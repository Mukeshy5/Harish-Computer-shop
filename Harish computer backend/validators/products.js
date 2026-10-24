const mongoose = require("mongoose");
const { AppError, assert, pick, amount, quantity } = require("../utils/errors");
const { imageUrl } = require("./records");
const aliases = {
  productName: "name",
  productModel: "model",
  productSize: "size",
  productColour: "colour",
  productPrice: "sellingPrice",
  minimumStockAlert: "minStock",
  gstRate: "taxRate",
  openingStock: "stock",
};
const labels = {
  name: "Product Name",
  model: "Product Model",
  size: "Product Size",
  productType: "Product Type",
  category: "Category",
  companyName: "Company Name",
  colour: "Product Colour",
  sellingPrice: "Product Price",
  stock: "Stock",
  minStock: "Minimum Stock Alert",
  taxRate: "GST Rate",
};
const productFields = [
  "name",
  "sku",
  "barcode",
  "category",
  "brand",
  "supplier",
  "description",
  "productType",
  "model",
  "size",
  "companyName",
  "colour",
  "purchasePrice",
  "sellingPrice",
  "minStock",
  "unit",
  "taxRate",
  "image",
  "active",
];
function invalid(fields) {
  const error = new AppError(
    400,
    "Please correct the highlighted product fields.",
  );
  error.fields = fields;
  throw error;
}
function details(data, creating = false) {
  assert(
    data && typeof data === "object" && !Array.isArray(data),
    "Product details must be an object",
  );
  const values = { ...data },
    errors = {};
  for (const [alias, field] of Object.entries(aliases)) {
    if (data[alias] === undefined) continue;
    if (
      data[field] !== undefined &&
      String(data[field]) !== String(data[alias])
    )
      errors[field] = `Conflicting values for ${labels[field]}.`;
    else values[field] = data[alias];
  }
  for (const field of [
    "name",
    "model",
    "size",
    "productType",
    "companyName",
    "colour",
  ]) {
    const value = values[field];
    if (!creating && value === undefined) continue;
    if (
      typeof value !== "string" ||
      value.trim().length > 200 ||
      ((creating || field === "name") && !value.trim())
    )
      errors[field] = `${labels[field]} must contain 1–200 characters.`;
    else values[field] = value.trim();
  }
  for (const field of ["sellingPrice", "stock", "minStock", "taxRate"]) {
    const value = values[field];
    if (!creating && value === undefined) continue;
    const n = Number(value),
      integer = ["stock", "minStock"].includes(field);
    const minimum = field === "sellingPrice" && creating ? 0.01 : 0;
    const maximum = field === "taxRate" ? 100 : integer ? 1e8 : 1e9;
    if (
      !["number", "string"].includes(typeof value) ||
      String(value).trim() === "" ||
      !Number.isFinite(n) ||
      n < minimum ||
      n > maximum ||
      (integer
        ? !Number.isSafeInteger(n)
        : Math.abs(n * 100 - Math.round(n * 100)) >= 0.0001)
    )
      errors[field] = integer
        ? `${labels[field]} must be a non-negative whole number up to 100000000.`
        : field === "taxRate"
          ? "GST Rate must be between 0 and 100 with at most two decimals."
          : "Product Price must be greater than zero, at most 1000000000, with at most two decimals.";
    else values[field] = n;
  }
  if (creating || (values.category !== undefined && values.category !== "")) {
    if (
      typeof values.category !== "string" ||
      !mongoose.isObjectIdOrHexString(values.category)
    )
      errors.category = "Choose a valid category.";
  }
  if (Object.keys(errors).length) invalid(errors);
  return values;
}
async function productInput(tx, data, creating = false) {
  const normalized = details(data, creating),
    input = pick(normalized, productFields);
  if (input.sku !== undefined)
    assert(
      typeof input.sku === "string" &&
        input.sku.trim().length > 0 &&
        input.sku.length <= 100,
      "SKU must contain 1–100 characters",
    );
  if (input.barcode)
    assert(
      typeof input.barcode === "string" && input.barcode.length <= 100,
      "Barcode must contain at most 100 characters",
    );
  imageUrl(input.image);
  if (input.purchasePrice !== undefined)
    input.purchasePrice = amount(input.purchasePrice, "Purchase price");
  if (input.active !== undefined)
    assert(typeof input.active === "boolean", "Active must be boolean");
  for (const f of ["category", "brand", "supplier", "barcode"])
    if (input[f] === "") input[f] = undefined;
  for (const [field, model] of [
    ["category", "Category"],
    ["brand", "Brand"],
    ["supplier", "Supplier"],
  ]) {
    if (!input[field]) continue;
    try {
      const record = await tx.get(model, input[field]);
      if (creating && field === "category" && record.active === false)
        invalid({ category: "Choose an active category." });
    } catch (e) {
      if (field === "category" && e.status === 404)
        invalid({ category: "Choose an existing category." });
      throw e;
    }
  }
  if (creating) input.openingStock = quantity(normalized.stock, "Stock", true);
  return input;
}
module.exports = { productInput, details };
