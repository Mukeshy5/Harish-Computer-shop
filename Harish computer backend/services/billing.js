const store = require("../config/store");
const { assert, round, amount, quantity } = require("../utils/errors");
const { contact } = require("../validators/records");
const { applyInvoiceDiscount } = require("../utils/invoice-discount");
const methods = ["cash", "upi", "card", "bank", "credit"];
async function settings(tx) {
  return (await tx.list("ShopSettings"))[0] || tx.insert("ShopSettings", {});
}
async function movement(
  tx,
  product,
  delta,
  type,
  reason,
  reference,
  user,
  cost = product.averageCost,
) {
  const before = product.stock;
  const next = before + delta;
  assert(next >= 0, `Insufficient stock for ${product.name}`, 409);
  product.stock = next;
  await tx.save("Product", product);
  return tx.insert("StockMovement", {
    product: product._id,
    previousQuantity: before,
    quantity: delta,
    newQuantity: next,
    type,
    reason,
    reference,
    user: user._id,
    cost,
  });
}
function calculateLine(product, input, kind) {
  const qty = quantity(input.quantity);
  const rate = amount(
    input.rate ??
      (kind === "sale" ? product.sellingPrice : product.purchasePrice),
    "Rate",
  );
  const discount = amount(input.discount ?? 0, "Line discount");
  const base = round(qty * rate);
  assert(
    Number.isSafeInteger(Math.round(base * 100)),
    "Line value exceeds supported precision",
  );
  assert(discount <= base, "Discount cannot exceed line value");
  const taxRate =
    kind === "sale"
      ? product.taxRate
      : amount(input.taxRate ?? product.taxRate, "Tax rate");
  assert(taxRate <= 100, "Tax rate cannot exceed 100");
  for (const field of ["warrantyEnabled", "guaranteeEnabled"])
    if (input[field] !== undefined)
      assert(typeof input[field] === "boolean", `${field} must be a boolean`);
  const coverageEnabled = input.warrantyEnabled || input.guaranteeEnabled;
  const warrantyMonths = coverageEnabled
    ? Number(input.warrantyMonths || 0)
    : 0;
  const warrantyDays = coverageEnabled ? Number(input.warrantyDays || 0) : 0;
  assert(
    Number.isInteger(warrantyMonths) &&
      warrantyMonths >= 0 &&
      warrantyMonths <= 1200 &&
      Number.isInteger(warrantyDays) &&
      warrantyDays >= 0 &&
      warrantyDays <= 36500,
    "Warranty duration is invalid",
  );
  assert(
    !coverageEnabled || warrantyMonths + warrantyDays > 0,
    "Enter a coverage duration when warranty or guarantee is selected",
  );
  for (const field of ["productType", "model"])
    if (input[field] !== undefined)
      assert(
        typeof input[field] === "string" && input[field].length <= 200,
        `${field} must contain at most 200 characters`,
      );
  const taxable = round(base - discount);
  const tax = round((taxable * taxRate) / 100);
  return {
    product: product._id,
    name: product.name,
    sku: product.sku,
    productType: (input.productType ?? product.productType ?? "").trim(),
    model: (input.model ?? product.model ?? "").trim(),
    size: product.size || "",
    colour: product.colour || "",
    guaranteeEnabled: input.guaranteeEnabled === true,
    warrantyEnabled: input.warrantyEnabled === true,
    warrantyMonths,
    warrantyDays,
    warrantyStartDate: null,
    warrantyExpiryDate: null,
    category: product.category,
    quantity: qty,
    rate,
    discount,
    taxRate,
    taxable,
    tax,
    total: round(taxable + tax),
    unitCost: kind === "sale" ? product.averageCost : round(taxable / qty),
    returnedQuantity: 0,
  };
}
async function invoice(kind, input, user, key) {
  const model = kind === "sale" ? "Sale" : "Purchase";
  const hash = store.fingerprint(input);
  return store.transaction(async (tx) => {
    const prior = (await tx.list(model, { requestKey: key }))[0];
    if (prior) {
      assert(
        prior.requestHash === hash && String(prior.user) === String(user._id),
        "Request key already used for different data",
        409,
      );
      return prior;
    }
    const shop = await settings(tx);
    let exchangeOf;
    if (input.exchangeOf) {
      assert(
        kind === "sale" && user.role === "admin",
        "Exchanges require an administrator",
        403,
      );
      const original = await tx.get("Sale", input.exchangeOf);
      assert(
        original.returned > 0,
        "Record the original item return before creating an exchange sale",
      );
      exchangeOf = original._id;
    }
    assert(
      Array.isArray(input.lines) &&
        input.lines.length > 0 &&
        input.lines.length <= 100,
      "Add between 1 and 100 invoice lines",
    );
    assert(methods.includes(input.method), "Select a valid payment method");
    const partyModel = kind === "sale" ? "Customer" : "Supplier";
    let party = input.party ? await tx.get(partyModel, input.party) : null;
    assert(kind === "sale" || party, "A supplier is required");
    const seen = new Set();
    let lines = [];
    const products = [];
    for (const item of input.lines) {
      const p = await tx.get("Product", item.product);
      const productId = String(p._id);
      assert(!seen.has(productId), "Combine duplicate products into one line");
      seen.add(productId);
      assert(p.active, `${p.name} is inactive`);
      const line = calculateLine(p, item, kind);
      if (p.category) {
        const category = await tx.get("Category", p.category);
        line.categoryName = category.name;
      }
      if (user.role !== "admin" && kind === "sale")
        assert(
          line.rate === p.sellingPrice,
          "Staff must use the product selling price",
          403,
        );
      if (kind === "sale")
        assert(
          p.stock >= line.quantity,
          `Insufficient stock for ${p.name}`,
          409,
        );
      lines.push(line);
      products.push(p);
    }
    const subtotal = round(lines.reduce((s, l) => s + l.quantity * l.rate, 0));
    const lineDiscount = round(lines.reduce((s, l) => s + l.discount, 0));
    const invoiceDiscount = amount(input.invoiceDiscount ?? 0, "Bill discount");
    lines = applyInvoiceDiscount(lines, invoiceDiscount, kind);
    const discount = round(lines.reduce((s, l) => s + l.discount, 0));
    const tax = round(lines.reduce((s, l) => s + l.tax, 0));
    const charges = amount(input.charges ?? 0, "Other charges");
    const total = round(subtotal - discount + tax + charges);
    assert(
      Number.isSafeInteger(Math.round(total * 100)) && total <= 1e9,
      "Invoice total exceeds the supported limit",
    );
    const tender = amount(input.paid ?? 0, "Paid amount");
    assert(
      input.method !== "credit" || tender === 0,
      "Use a payment method when recording a payment",
    );
    assert(
      input.method === "cash" || tender <= total,
      "Paid amount exceeds total",
    );
    const paid = Math.min(total, tender);
    const due = round(total - paid);
    if (kind === "sale" && due > 0) {
      assert(
        (shop.allowCreditSales ||
          (user.role === "admin" && input.approveCredit === true)) &&
          (user.role === "admin" || user.permissions?.creditSales),
        "Credit sales are not authorized",
        403,
      );
    }
    const counter = kind === "sale" ? "nextSale" : "nextPurchase";
    const prefix = kind === "sale" ? shop.salePrefix : shop.purchasePrefix;
    const number = `${prefix}-${String(shop[counter]).padStart(6, "0")}`;
    shop[counter]++;
    await tx.save("ShopSettings", shop);
    const date = input.date ? new Date(input.date) : new Date();
    assert(
      !Number.isNaN(date.valueOf()) && date <= new Date(Date.now() + 60000),
      "Invalid invoice date",
    );
    lines = lines.map((line) => {
      if (!line.warrantyEnabled && !line.guaranteeEnabled) return line;
      const start = new Date(date);
      const expiry = new Date(start);
      const monthCount = line.warrantyMonths;
      const dayCount = line.warrantyDays;
      const targetMonth = expiry.getMonth() + monthCount;
      const targetDay = expiry.getDate();
      expiry.setDate(1);
      expiry.setMonth(targetMonth);
      const lastDay = new Date(
        expiry.getFullYear(),
        expiry.getMonth() + 1,
        0,
      ).getDate();
      expiry.setDate(Math.min(targetDay, lastDay) + dayCount);
      return {
        ...line,
        warrantyStartDate: start,
        warrantyExpiryDate: expiry,
      };
    });
    for (const field of [
      "partyName",
      "partyPhone",
      "partyEmail",
      "partyAddress",
      "partyGstin",
    ])
      if (input[field] !== undefined)
        assert(
          typeof input[field] === "string" && input[field].length <= 2000,
          `${field} must be text with at most 2000 characters`,
        );
    const partyDetails = contact(
      {
        name: input.partyName?.trim() || party?.name || "Walk-in customer",
        phone: input.partyPhone ?? party?.phone ?? "",
        email: input.partyEmail ?? party?.email ?? "",
        address: input.partyAddress ?? party?.address ?? "",
        gstin: input.partyGstin ?? party?.gstin ?? "",
      },
      ["name", "phone", "email", "address", "gstin"],
    );
    if (kind === "sale")
      assert(
        (party || partyDetails.name !== "Walk-in customer") &&
          partyDetails.phone,
        "Customer name and mobile number are required",
      );
    if (kind === "sale" && due > 0 && !party) {
      // Resolve a credit account from the inline details in the same transaction.
      const phone = partyDetails.phone.replace(/\D/g, "");
      const name = partyDetails.name.trim().toLowerCase();
      const matches = (await tx.list("Customer")).filter(
        (customer) =>
          customer.name.trim().toLowerCase() === name &&
          (customer.phone || "").replace(/\D/g, "") === phone,
      );
      party =
        matches.length === 1
          ? matches[0]
          : await tx.insert("Customer", {
              ...partyDetails,
              openingBalance: 0,
              openingPaid: 0,
              balance: 0,
            });
    }
    const result = await tx.insert(model, {
      ...(exchangeOf ? { exchangeOf } : {}),
      number,
      date,
      party: party?._id,
      partyName: partyDetails.name,
      partyPhone: partyDetails.phone,
      partyEmail: partyDetails.email,
      partyAddress: partyDetails.address,
      partyGstin: partyDetails.gstin,
      supplierInvoice: input.supplierInvoice || "",
      lines,
      subtotal,
      discount,
      lineDiscount,
      invoiceDiscount,
      tax,
      charges,
      total,
      paid,
      due,
      ...(due > 0 && user.role === "admin" && input.approveCredit === true
        ? { creditApprovedBy: user._id }
        : {}),
      cashReceived: tender,
      change: round(tender - paid),
      returned: 0,
      grossProfit:
        kind === "sale"
          ? round(
              lines.reduce(
                (s, l) => s + l.taxable - l.unitCost * l.quantity,
                0,
              ),
            )
          : 0,
      method: input.method,
      notes: input.notes || "",
      user: user._id,
      requestKey: key,
      requestHash: hash,
      shopSnapshot: {
        name: shop.name,
        address: shop.address,
        phone: shop.phone,
        email: shop.email,
        gstin: shop.gstin,
        logo: shop.logo,
        receiptFooter: shop.receiptFooter,
      },
    });
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const l = lines[i];
      if (kind === "purchase") {
        p.averageCost = round(
          (p.stock * p.averageCost + l.taxable) / (p.stock + l.quantity),
        );
        p.purchasePrice = l.rate;
        p.lastPurchaseDate = date;
      }
      await movement(
        tx,
        p,
        kind === "sale" ? -l.quantity : l.quantity,
        kind,
        `${model} invoice`,
        number,
        user,
        l.unitCost,
      );
    }
    if (party) {
      party.balance = round(party.balance + due);
      await tx.save(partyModel, party);
    }
    if (paid > 0)
      await tx.insert("Payment", {
        kind,
        invoice: result._id,
        party: party?._id,
        amount: paid,
        method: input.method,
        user: user._id,
        reference: number,
        requestKey: `${key}:initial`,
      });
    await store.audit(tx, user, "invoice.create", model, result._id, {
      number,
      total,
    });
    return result;
  });
}
async function payment(kind, id, input, user, key) {
  return store.transaction(async (tx) => {
    const prior = (await tx.list("Payment", { requestKey: key }))[0];
    if (prior) {
      assert(
        String(prior.invoice) === id &&
          prior.amount === Number(input.amount) &&
          prior.kind === kind &&
          prior.method === input.method &&
          String(prior.user) === String(user._id),
        "Request key reused",
        409,
      );
      return prior;
    }
    const model = kind === "sale" ? "Sale" : "Purchase";
    const bill = await tx.get(model, id);
    assert(bill.status !== "cancelled", "Invoice is cancelled");
    const value = amount(input.amount, "Payment", false);
    assert(value <= bill.due, "Payment exceeds outstanding balance");
    assert(
      methods.includes(input.method) && input.method !== "credit",
      "Select a valid payment method",
    );
    if (user.role !== "admin" && !user.permissions?.viewAllHistory)
      assert(
        String(bill.user) === String(user._id),
        "Invoice is restricted",
        403,
      );
    bill.paid = round(bill.paid + value);
    bill.due = round(bill.due - value);
    await tx.save(model, bill);
    if (bill.party) {
      const name = kind === "sale" ? "Customer" : "Supplier";
      const party = await tx.get(name, bill.party);
      party.balance = round(party.balance - value);
      await tx.save(name, party);
    }
    const result = await tx.insert("Payment", {
      kind,
      invoice: id,
      party: bill.party,
      amount: value,
      method: input.method,
      user: user._id,
      reference: input.reference || bill.number,
      requestKey: key,
    });
    await store.audit(tx, user, "payment.create", model, id, { amount: value });
    return result;
  });
}
async function returnInvoice(kind, id, input, user, key, cancel = false) {
  const model = kind === "sale" ? "Sale" : "Purchase";
  const returns = `${model}Return`;
  return store.transaction(async (tx) => {
    const hash = store.fingerprint({ input, cancel });
    const prior = (await tx.list(returns, { requestKey: key }))[0];
    if (prior) {
      assert(
        String(prior.invoice) === id &&
          String(prior.user) === String(user._id) &&
          prior.requestHash === hash,
        "Request key reused",
        409,
      );
      return prior;
    }
    assert(
      methods.includes(input.method || "cash") && input.method !== "credit",
      "Select a valid refund method",
    );
    const bill = await tx.get(model, id);
    assert(
      !["cancelled", "returned"].includes(bill.status),
      "Invoice is already fully reversed",
    );
    assert(
      typeof input.reason === "string" && input.reason.trim().length >= 3,
      "A return reason is required",
    );
    const selected = cancel
      ? bill.lines
          .filter((l) => l.quantity > l.returnedQuantity)
          .map((l) => ({
            product: String(l.product),
            quantity: l.quantity - l.returnedQuantity,
          }))
      : input.lines;
    assert(
      Array.isArray(selected) && selected.length,
      "Choose products to return",
    );
    const lines = [];
    const seen = new Set();
    let profit = 0;
    for (const item of selected) {
      assert(!seen.has(item.product), "Duplicate return line");
      seen.add(item.product);
      const source = bill.lines.find((l) => String(l.product) === item.product);
      assert(source, "Product is not on original invoice");
      const qty = quantity(item.quantity);
      const remaining = source.quantity - source.returnedQuantity;
      assert(qty <= remaining, "Return exceeds unreturned quantity");
      // Differences of cumulative rounded amounts ensure partial returns sum exactly.
      const portion = (field) =>
        round(
          round(
            (source[field] * (source.returnedQuantity + qty)) / source.quantity,
          ) -
            round((source[field] * source.returnedQuantity) / source.quantity),
        );
      const line = {
        ...source,
        quantity: qty,
        discount: portion("discount"),
        taxable: portion("taxable"),
        tax: portion("tax"),
        total: portion("total"),
        returnedQuantity: 0,
      };
      lines.push(line);
      source.returnedQuantity += qty;
      profit += line.taxable - line.unitCost * qty;
      const p = await tx.get("Product", item.product);
      if (kind === "sale")
        p.averageCost = round(
          (p.stock * p.averageCost + qty * source.unitCost) / (p.stock + qty),
        );
      else {
        assert(p.stock >= qty, `Not enough stock to return ${p.name}`, 409);
        if (p.stock > qty) {
          const remainingCost = round(
            p.stock * p.averageCost - qty * source.unitCost,
          );
          assert(
            remainingCost >= 0,
            "Return would create negative inventory value. Reconcile cost before this return.",
            409,
          );
          p.averageCost = round(remainingCost / (p.stock - qty));
        }
      }
      await movement(
        tx,
        p,
        kind === "sale" ? qty : -qty,
        `${kind}-return`,
        input.reason,
        bill.number,
        user,
        source.unitCost,
      );
    }
    const allReturned = bill.lines.every(
      (l) => l.returnedQuantity === l.quantity,
    );
    const returnedTotal = round(
      lines.reduce((s, l) => s + l.total, 0) + (allReturned ? bill.charges : 0),
    );
    const oldDue = bill.due;
    bill.returned = round(bill.returned + returnedTotal);
    const netTotal = round(bill.total - bill.returned);
    const refund = round(Math.max(0, bill.paid - netTotal));
    bill.paid = round(bill.paid - refund);
    bill.due = round(netTotal - bill.paid);
    bill.status = cancel
      ? "cancelled"
      : allReturned
        ? "returned"
        : "partially-returned";
    await tx.save(model, bill);
    if (bill.party) {
      const name = kind === "sale" ? "Customer" : "Supplier";
      const party = await tx.get(name, bill.party);
      party.balance = round(party.balance + bill.due - oldDue);
      await tx.save(name, party);
    }
    const result = await tx.insert(returns, {
      invoice: id,
      lines,
      total: returnedTotal,
      grossProfit: kind === "sale" ? round(profit) : 0,
      reason: input.reason.trim(),
      refund,
      user: user._id,
      requestKey: key,
      requestHash: hash,
      cancelled: cancel,
    });
    if (refund > 0)
      await tx.insert("Payment", {
        kind: `${kind}-refund`,
        invoice: id,
        party: bill.party,
        amount: refund,
        method: input.method || "cash",
        user: user._id,
        reference: bill.number,
        requestKey: `${key}:refund`,
      });
    await store.audit(
      tx,
      user,
      cancel ? "invoice.cancel" : "invoice.return",
      model,
      id,
      { total: returnedTotal, refund, reason: input.reason },
    );
    return result;
  });
}
module.exports = {
  invoice,
  payment,
  returnInvoice,
  settings,
  movement,
  calculateLine,
};
