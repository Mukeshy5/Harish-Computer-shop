const store = require("../config/store");
const { assert, amount, round } = require("../utils/errors");
const printShop = require("../config/print-shop.json");

const fields = [
  "customerName",
  "customerEmail",
  "customerPhone",
  "customerAddress",
  "product",
  "model",
  "serviceType",
  "problem",
  "solution",
  "totalAmount",
  "paidAmount",
  "status",
];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[\d ()-]{7,25}$/;

function validate(input) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Invalid service record");
  const result = {};
  for (const key of fields) if (input[key] !== undefined) result[key] = input[key];
  const requiredText = [
    ["customerName", "Customer name", 200],
    ["customerEmail", "Customer email", 254],
    ["customerPhone", "Customer phone", 26],
    ["product", "Product", 200],
    ["serviceType", "Service type", 30],
    ["problem", "Problem", 2000],
  ];
  for (const [key, label, max] of requiredText) {
    if (result[key] === undefined) continue;
    assert(
      typeof result[key] === "string" &&
        result[key].trim().length > 0 &&
        result[key].trim().length <= max,
      `${label} is required and must be at most ${max} characters`,
    );
    result[key] = result[key].trim();
  }
  if (result.customerEmail !== undefined) {
    result.customerEmail = result.customerEmail.toLowerCase();
    assert(emailPattern.test(result.customerEmail), "Enter a valid customer email");
  }
  if (result.customerPhone !== undefined) {
    assert(phonePattern.test(result.customerPhone), "Enter a valid customer phone");
    const digits = result.customerPhone.replace(/\D/g, "");
    assert(
      digits.length >= 7 && digits.length <= 15,
      "Customer phone must contain between 7 and 15 digits",
    );
  }
  for (const [key, label, max] of [
    ["customerAddress", "Customer address", 1000],
    ["model", "Model", 200],
  ])
    if (result[key] !== undefined) {
      assert(
        typeof result[key] === "string" && result[key].trim().length <= max,
        `${label} must be text with at most ${max} characters`,
      );
      result[key] = result[key].trim();
    }
  if (result.solution !== undefined)
    assert(
      typeof result.solution === "string" && result.solution.trim().length <= 2000,
      "Solution must be text with at most 2000 characters",
    );
  if (result.serviceType !== undefined)
    assert(
      ["Receive Shop", "Receive Customer"].includes(result.serviceType),
      "Choose Receive Shop or Receive Customer",
    );
  if (result.status !== undefined)
    assert(["open", "completed"].includes(result.status), "Choose a valid service status");
  if (result.totalAmount !== undefined)
    result.totalAmount = amount(result.totalAmount, "Total amount");
  if (result.paidAmount !== undefined)
    result.paidAmount = amount(result.paidAmount, "Paid amount");
  return result;
}

function serviceView(record) {
  const view = { ...record, printShop };
  if (view.serviceType === "Receive Shop") delete view.solution;
  return view;
}

function finish(record) {
  assert(record.serviceType, "Service type is required");
  assert(record.problem?.trim(), "Problem is required");
  if (record.serviceType === "Receive Customer") {
    assert(record.solution?.trim(), "Solution is required when receiving a customer product");
  } else {
    delete record.solution;
  }
  record.totalAmount = amount(record.totalAmount, "Total amount");
  record.paidAmount = amount(record.paidAmount, "Paid amount");
  assert(record.paidAmount <= record.totalAmount, "Paid amount cannot exceed total amount");
  record.pendingAmount = round(record.totalAmount - record.paidAmount);
  return record;
}

async function create(input, user, requestKey) {
  const data = validate(input);
  assert(data.serviceType, "Service type is required");
  for (const field of [
    "customerName",
    "customerEmail",
    "customerPhone",
    "product",
    "problem",
    "totalAmount",
    "paidAmount",
  ])
    assert(data[field] !== undefined, `${field} is required`);
  const hash = store.fingerprint(data);
  return store.transaction(async (tx) => {
    const prior = (await tx.list("ServiceCenter", { requestKey }))[0];
    if (prior) {
      assert(
        prior.requestHash === hash &&
          String(prior.createdBy) === String(user._id),
        "Request key already used for different service data",
        409,
      );
      return prior;
    }
    const settings = await require("../services/billing").settings(tx);
    const record = finish({
      ...data,
      number: `${settings.salePrefix || "HCS"}-SVC-${String(settings.nextService).padStart(6, "0")}`,
      requestKey,
      requestHash: hash,
      createdBy: user._id,
      updatedBy: user._id,
      status: "open",
      shopSnapshot: {
        name: settings.name || "Harish Computer Shop",
        address: settings.address || "",
        phone: settings.phone || "",
        email: settings.email || "",
        gstin: settings.gstin || "",
      },
    });
    settings.nextService++;
    await tx.save("ShopSettings", settings);
    const saved = await tx.insert("ServiceCenter", record);
    await store.audit(tx, user, "service.create", "ServiceCenter", saved._id, {
      number: saved.number,
      serviceType: saved.serviceType,
    });
    return saved;
  });
}

async function update(id, input, user) {
  const data = validate(input);
  return store.transaction(async (tx) => {
    const record = await tx.get("ServiceCenter", id);
    Object.assign(record, data);
    if (record.serviceType === "Receive Shop") delete record.solution;
    finish(record);
    record.updatedBy = user._id;
    const saved = await tx.save("ServiceCenter", record);
    await store.audit(tx, user, "service.update", "ServiceCenter", id, {
      number: saved.number,
    });
    return saved;
  });
}

module.exports = { create, update, validate, serviceView };
