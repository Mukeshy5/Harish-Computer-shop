const { round } = require("../utils/errors");
function dateRange(query = {}) {
  const from = query.from
    ? new Date(`${query.from}T00:00:00+05:30`)
    : new Date("2000-01-01");
  const to = query.to
    ? new Date(`${query.to}T23:59:59.999+05:30`)
    : new Date("2100-01-01");
  if (Number.isNaN(+from) || Number.isNaN(+to) || from > to)
    throw Object.assign(new Error("Invalid date range"), { status: 400 });
  return (d) => new Date(d) >= from && new Date(d) <= to;
}
const sum = (rows, field) =>
  round(rows.reduce((s, r) => s + Number(r[field] || 0), 0));
async function report(tx, type, query, user) {
  const within = dateRange(query);
  const admin = user.role === "admin";
  const scope =
    admin || user.permissions?.viewAllHistory ? {} : { user: String(user._id) };
  const products = await tx.list("Product");
  if (type === "low-stock")
    return products
      .filter((p) => p.active && p.stock <= p.minStock)
      .map((p) => ({
        name: p.name,
        sku: p.sku,
        currentQuantity: p.stock,
        minimumQuantity: p.minStock,
        status: p.stock === 0 ? "OUT OF STOCK" : "LOW STOCK",
        suggestedReorder: Math.max(1, p.minStock * 2 - p.stock),
        lastPurchaseDate: p.lastPurchaseDate || "",
      }));
  const sales = await tx.list("Sale", scope);
  const purchases =
    admin || user.permissions?.purchaseEntry
      ? await tx.list("Purchase", scope)
      : [];
  const saleReturns = (await tx.list("SaleReturn", scope)).filter((r) =>
    within(r.createdAt),
  );
  const purchaseReturns = (await tx.list("PurchaseReturn", scope)).filter((r) =>
    within(r.createdAt),
  );
  const filteredSales = sales.filter((s) => within(s.date));
  const filteredPurchases = purchases.filter((s) => within(s.date));
  const movements = await tx.list("StockMovement");
  if (type === "inventory")
    return products.map((p) => {
      const m = movements.filter((m) => String(m.product) === String(p._id));
      const qty = (t) =>
        m.filter((x) => x.type === t).reduce((s, x) => s + x.quantity, 0);
      return {
        product: p.name,
        sku: p.sku,
        category: p.category,
        openingStock: p.openingStock,
        purchased: qty("purchase"),
        sold: -qty("sale"),
        saleReturns: qty("sale-return"),
        purchaseReturns: -qty("purchase-return"),
        adjusted: qty("adjustment") + qty("stock-count"),
        available: p.stock,
        ledgerQuantity: m.reduce((s, x) => s + x.quantity, 0),
        discrepancy: p.stock - m.reduce((s, x) => s + x.quantity, 0),
        averageCost: p.averageCost,
        valuation: round(p.stock * p.averageCost),
      };
    });
  const basic = {
    sales: filteredSales,
    purchases: filteredPurchases,
    "sale-returns": saleReturns,
    "purchase-returns": purchaseReturns,
  };
  if (basic[type]) return basic[type];
  if (type === "collections")
    return (await tx.list("Payment")).filter((p) => within(p.createdAt));
  if (type === "movements") return movements.filter((m) => within(m.createdAt));
  const salesNet = round(
    sum(filteredSales, "subtotal") -
      sum(filteredSales, "discount") -
      saleReturns.reduce(
        (s, r) => s + r.lines.reduce((n, l) => n + l.taxable, 0),
        0,
      ),
  );
  const grossProfit = round(
    sum(filteredSales, "grossProfit") - sum(saleReturns, "grossProfit"),
  );
  const expenses = sum(
    (await tx.list("Expense")).filter((e) => within(e.date)),
    "amount",
  );
  if (type === "profit")
    return [
      {
        salesExTax: salesNet,
        costOfGoodsSold: round(salesNet - grossProfit),
        grossProfit,
        expenses,
        netProfit: round(grossProfit - expenses),
      },
    ];
  if (
    [
      "product-sales",
      "category-sales",
      "customer-sales",
      "supplier-purchases",
    ].includes(type)
  ) {
    const grouped = new Map();
    const buying = type === "supplier-purchases";
    const bills = buying ? filteredPurchases : filteredSales;
    const returns = buying ? purchaseReturns : saleReturns;
    const all = buying ? purchases : sales;
    const add = (bill, lines, sign) => {
      for (const l of lines) {
        const key =
          type === "product-sales"
            ? l.sku
            : type === "category-sales"
              ? String(l.category || "Uncategorized")
              : String(bill.party || "Walk-in");
        const row = grouped.get(key) || {
          group: key,
          name:
            type === "product-sales"
              ? l.name
              : type === "category-sales"
                ? key
                : bill.partyName,
          quantity: 0,
          salesExTax: 0,
          tax: 0,
          total: 0,
        };
        row.quantity += sign * l.quantity;
        for (const [field, value] of [
          ["salesExTax", l.taxable],
          ["tax", l.tax],
          ["total", l.total],
        ])
          row[field] = round(row[field] + sign * value);
        grouped.set(key, row);
      }
    };
    bills.forEach((b) => add(b, b.lines, 1));
    returns.forEach((r) => {
      const b = all.find((b) => String(b._id) === String(r.invoice));
      if (b) add(b, r.lines, -1);
    });
    if (type === "category-sales") {
      const categories = await tx.list("Category");
      for (const row of grouped.values())
        row.name =
          categories.find((c) => String(c._id) === row.group)?.name ||
          "Uncategorized";
    }
    return [...grouped.values()];
  }
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const isToday = dateRange({ from: today, to: today });
  const ts = sales.filter((x) => isToday(x.date));
  const tp = purchases.filter((x) => isToday(x.date));
  const pay = (await tx.list("Payment", scope)).filter((x) =>
    isToday(x.createdAt),
  );
  const tr = (await tx.list("SaleReturn", scope)).filter((x) =>
    isToday(x.createdAt),
  );
  const result = {
    totalProducts: products.filter((p) => p.active).length,
    stockUnits: products.reduce((s, p) => s + p.stock, 0),
    todaySales: round(sum(ts, "total") - sum(tr, "total")),
    lowStock: products.filter(
      (p) => p.active && p.stock > 0 && p.stock <= p.minStock,
    ).length,
    outOfStock: products.filter((p) => p.active && p.stock === 0).length,
    collections: round(
      sum(
        pay.filter((p) => ["sale", "customer-opening"].includes(p.kind)),
        "amount",
      ) -
        sum(
          pay.filter((p) => p.kind === "sale-refund"),
          "amount",
        ),
    ),
    recentSales: [...sales]
      .filter((sale) => !sale.clearedAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6),
    alerts: products
      .filter((p) => p.active && p.stock <= p.minStock)
      .slice(0, 6)
      .map((p) => ({
        _id: p._id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        minStock: p.minStock,
      })),
  };
  result.trend = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(
      new Date(`${today}T12:00:00+05:30`).valueOf() - (6 - i) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const withinDay = dateRange({ from: day, to: day });
    return {
      day,
      total: round(
        sum(
          sales.filter((s) => withinDay(s.date)),
          "total",
        ) -
          sum(
            (saleReturns || []).filter((r) => withinDay(r.createdAt)),
            "total",
          ),
      ),
    };
  });
  if (admin)
    Object.assign(result, {
      todayPurchases: sum(tp, "total"),
      customerDues: sum(await tx.list("Customer"), "balance"),
      supplierDues: sum(await tx.list("Supplier"), "balance"),
      grossProfit: round(sum(ts, "grossProfit") - sum(tr, "grossProfit")),
      todayExpenses: sum(
        (await tx.list("Expense")).filter((e) => isToday(e.date)),
        "amount",
      ),
      inventoryValue: round(
        products.reduce((s, p) => s + p.stock * p.averageCost, 0),
      ),
    });
  return result;
}
module.exports = { report, dateRange };
