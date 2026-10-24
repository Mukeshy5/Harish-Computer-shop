const mongoose = require("mongoose");
const { Schema } = mongoose;
const ref = (model, required = false) => ({
  type: Schema.Types.ObjectId,
  ref: model,
  required,
});
const money = { type: Number, min: 0, required: true, default: 0 };
const text = { type: String, trim: true, maxlength: 2000, default: "" };
// Old catalog entries remain editable; all new product creations use version 2.
const detailedProduct = function () {
  return this.detailsVersion === 2;
};
const productText = { ...text, required: detailedProduct };
const schemas = {
  AdminSetup: {
    key: { type: String, required: true, unique: true, enum: ["first-admin"] },
  },
  User: {
    name: { ...text, required: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    password: { type: String, required: true },
    // Keep legacy staff records and historical references; auth accepts admins only.
    role: { type: String, enum: ["admin", "staff"], default: "staff" },
    active: { type: Boolean, default: true },
    permissions: {
      purchaseEntry: Boolean,
      manageContacts: Boolean,
      viewAllHistory: Boolean,
      creditSales: Boolean,
    },
    tokenVersion: { type: Number, default: 0 },
  },
  Product: {
    name: { ...text, required: true },
    sku: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      unique: true,
    },
    barcode: { type: String, trim: true },
    category: { ...ref("Category"), required: detailedProduct },
    brand: ref("Brand"),
    supplier: ref("Supplier"),
    description: text,
    productType: productText,
    model: productText,
    size: productText,
    companyName: productText,
    colour: productText,
    detailsVersion: { type: Number, default: 1 },
    createdBy: ref("User"),
    createRequestKey: { type: String, unique: true, sparse: true },
    createRequestHash: String,
    purchasePrice: money,
    sellingPrice: {
      ...money,
      validate: {
        validator: function (value) {
          return !detailedProduct.call(this) || value > 0;
        },
        message: "Product price must be greater than zero",
      },
    },
    averageCost: money,
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: Number.isSafeInteger,
    },
    openingStock: { type: Number, min: 0, default: 0 },
    minStock: {
      type: Number,
      required: true,
      min: 0,
      default: 5,
      validate: Number.isSafeInteger,
    },
    unit: { ...text, default: "piece" },
    taxRate: { type: Number, required: true, min: 0, max: 100, default: 0 },
    image: text,
    active: { type: Boolean, default: true },
    lastPurchaseDate: Date,
  },
  Category: {
    name: { type: String, required: true, trim: true, unique: true },
    active: { type: Boolean, default: true },
  },
  Brand: {
    name: { type: String, required: true, trim: true, unique: true },
    active: { type: Boolean, default: true },
  },
  Customer: {
    name: { ...text, required: true },
    phone: text,
    email: text,
    address: text,
    gstin: text,
    openingBalance: money,
    openingPaid: money,
    balance: { type: Number, default: 0 },
  },
  Supplier: {
    name: { ...text, required: true },
    contactPerson: text,
    phone: text,
    email: text,
    address: text,
    gstin: text,
    openingBalance: money,
    openingPaid: money,
    balance: { type: Number, default: 0 },
  },
  Payment: {
    kind: {
      type: String,
      enum: [
        "sale",
        "purchase",
        "sale-refund",
        "purchase-refund",
        "customer-opening",
        "supplier-opening",
      ],
      required: true,
    },
    invoice: {
      type: Schema.Types.ObjectId,
      required: function () {
        return !this.kind?.endsWith("-opening");
      },
    },
    party: Schema.Types.ObjectId,
    amount: money,
    method: {
      type: String,
      enum: ["cash", "upi", "card", "bank", "credit"],
      required: true,
    },
    user: ref("User", true),
    reference: text,
    requestKey: { type: String, required: true, unique: true },
  },
  StockMovement: {
    product: ref("Product", true),
    previousQuantity: { type: Number, required: true },
    quantity: { type: Number, required: true },
    newQuantity: { type: Number, min: 0, required: true },
    type: { type: String, required: true },
    reason: { ...text, required: true },
    reference: text,
    user: ref("User", true),
    cost: money,
  },
  StockCount: {
    lines: [
      {
        product: ref("Product", true),
        name: String,
        sku: String,
        expected: Number,
        counted: Number,
        difference: Number,
        reason: String,
      },
    ],
    status: { type: String, enum: ["draft", "applied"], default: "draft" },
    user: ref("User", true),
    appliedBy: ref("User"),
  },
  ShopSettings: {
    key: { type: String, default: "shop", unique: true },
    name: { ...text, default: "Harish Computer Shop" },
    address: text,
    phone: text,
    email: text,
    gstin: text,
    logo: text,
    salePrefix: { ...text, default: "HCS" },
    purchasePrefix: { ...text, default: "PUR" },
    nextSale: { type: Number, default: 1, min: 1 },
    nextPurchase: { type: Number, default: 1, min: 1 },
    nextService: { type: Number, default: 1, min: 1 },
    defaultTax: { type: Number, min: 0, max: 100, default: 18 },
    minStock: { type: Number, min: 0, default: 5 },
    allowCreditSales: { type: Boolean, default: false },
    receiptFooter: { ...text, default: "Thank you for shopping with us." },
  },
  AuditLog: {
    user: ref("User"),
    action: { type: String, required: true },
    entity: text,
    entityId: text,
    details: Schema.Types.Mixed,
  },
  Expense: {
    description: { ...text, required: true },
    amount: money,
    date: { type: Date, default: Date.now },
    user: ref("User", true),
  },
  Enquiry: {
    name: { ...text, required: true },
    contact: { ...text, required: true },
    message: { ...text, required: true },
  },
};
const line = new Schema(
  {
    product: ref("Product", true),
    name: String,
    sku: String,
    productType: text,
    model: text,
    size: text,
    colour: text,
    guaranteeEnabled: { type: Boolean, default: false },
    warrantyEnabled: { type: Boolean, default: false },
    warrantyMonths: { type: Number, min: 0, max: 1200, default: 0 },
    warrantyDays: { type: Number, min: 0, max: 36500, default: 0 },
    warrantyStartDate: Date,
    warrantyExpiryDate: Date,
    category: ref("Category"),
    quantity: { type: Number, min: 1, required: true },
    rate: money,
    discount: money,
    taxRate: { type: Number, min: 0, max: 100 },
    taxable: money,
    tax: money,
    total: money,
    unitCost: money,
    returnedQuantity: { type: Number, default: 0 },
    categoryName: text,
  },
  { _id: false },
);
const invoice = {
  number: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now },
  party: Schema.Types.ObjectId,
  partyName: text,
  partyPhone: text,
  partyEmail: text,
  partyAddress: text,
  partyGstin: text,
  supplierInvoice: text,
  lines: { type: [line], required: true },
  subtotal: money,
  discount: money,
  lineDiscount: money,
  invoiceDiscount: money,
  tax: money,
  charges: money,
  total: money,
  paid: money,
  due: money,
  creditApprovedBy: ref("User"),
  cashReceived: money,
  change: money,
  returned: money,
  grossProfit: { type: Number, default: 0 },
  method: { type: String, enum: ["cash", "upi", "card", "bank", "credit"] },
  notes: text,
  status: {
    type: String,
    enum: ["completed", "partially-returned", "returned", "cancelled"],
    default: "completed",
  },
  user: ref("User", true),
  requestKey: { type: String, required: true, unique: true },
  requestHash: { type: String, required: true },
  shopSnapshot: Schema.Types.Mixed,
};
schemas.Sale = { ...invoice };
schemas.Sale.exchangeOf = ref("Sale");
schemas.Purchase = { ...invoice };
const returned = {
  invoice: { type: Schema.Types.ObjectId, required: true },
  lines: [line],
  total: money,
  grossProfit: { type: Number, default: 0 },
  reason: { ...text, required: true },
  refund: money,
  user: ref("User", true),
  requestKey: { type: String, required: true, unique: true },
  requestHash: { type: String, required: true },
  cancelled: Boolean,
};
schemas.SaleReturn = { ...returned };
schemas.PurchaseReturn = { ...returned };
schemas.InvoiceEmailDelivery = {
  invoice: ref("Sale", true),
  recipient: { type: String, required: true, trim: true, maxlength: 254 },
  status: {
    type: String,
    enum: ["pending", "sent", "failed"],
    default: "pending",
  },
  requestKey: { type: String, required: true, unique: true },
  messageId: { type: String, maxlength: 500 },
  failureReason: { type: String, maxlength: 2000 },
  attemptedBy: ref("User", true),
  sentAt: Date,
};
schemas.ServiceCenter = {
  number: { type: String, required: true, unique: true },
  customerName: { type: String, required: true, trim: true, maxlength: 200 },
  customerEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  customerPhone: { type: String, required: true, trim: true, maxlength: 26 },
  customerAddress: { ...text, maxlength: 1000 },
  product: { type: String, required: true, trim: true, maxlength: 200 },
  model: { type: String, trim: true, maxlength: 200, default: "" },
  serviceType: {
    type: String,
    required: true,
    enum: ["Receive Shop", "Receive Customer"],
  },
  problem: { type: String, required: true, trim: true, maxlength: 2000 },
  solution: { type: String, trim: true, maxlength: 2000 },
  totalAmount: money,
  paidAmount: money,
  pendingAmount: money,
  status: { type: String, enum: ["open", "completed"], default: "open" },
  requestKey: { type: String, required: true, unique: true },
  requestHash: { type: String, required: true },
  createdBy: ref("User", true),
  updatedBy: ref("User", true),
  shopSnapshot: Schema.Types.Mixed,
};
schemas.ServiceEmailDelivery = {
  service: ref("ServiceCenter", true),
  recipient: { type: String, required: true, trim: true, maxlength: 254 },
  status: {
    type: String,
    enum: ["pending", "sent", "failed"],
    default: "pending",
  },
  requestKey: { type: String, required: true, unique: true },
  messageId: { type: String, maxlength: 500 },
  failureReason: { type: String, maxlength: 2000 },
  attemptedBy: ref("User", true),
  sentAt: Date,
};
const models = {};
for (const [name, shape] of Object.entries(schemas)) {
  const schema = new Schema(shape, { timestamps: true, strict: "throw" });
  if (name === "Product") {
    schema.index(
      { barcode: 1 },
      {
        unique: true,
        partialFilterExpression: { barcode: { $type: "string" } },
      },
    );
    schema.index({ name: 1, active: 1 });
  }
  if (
    [
      "Sale",
      "Purchase",
      "Payment",
      "StockMovement",
      "AuditLog",
      "ServiceCenter",
      "ServiceEmailDelivery",
    ].includes(name)
  )
    schema.index({ createdAt: -1 });
  models[name] = mongoose.models[name] || mongoose.model(name, schema);
}
module.exports = models;
