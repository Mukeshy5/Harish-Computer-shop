// Replica sets use native transactions. Standalone MongoDB uses an atomic,
// bounded aggregate with compare-and-swap: no partially committed invoices.
const mongoose = require("mongoose");
const sift = require("sift").default;
const crypto = require("node:crypto");
const { calculateObjectSize } = require("bson");
const models = require("../models");
const { AppError } = require("../utils/errors");
const Aggregate = mongoose.model(
  "StandaloneLedger",
  new mongoose.Schema(
    { _id: String, revision: Number, data: mongoose.Schema.Types.Mixed },
    { minimize: false },
  ),
);
const clone = (value) => JSON.parse(JSON.stringify(value));
let mode;
const unique = {
  AdminSetup: ["key"],
  User: ["email"],
  Product: ["sku", "barcode", "createRequestKey"],
  Category: ["name"],
  Brand: ["name"],
  ShopSettings: ["key"],
  Sale: ["number", "requestKey"],
  Purchase: ["number", "requestKey"],
  SaleReturn: ["requestKey"],
  PurchaseReturn: ["requestKey"],
  InvoiceEmailDelivery: ["requestKey"],
  ServiceCenter: ["number", "requestKey"],
  ServiceEmailDelivery: ["requestKey"],
  Payment: ["requestKey"],
};
class Tx {
  constructor(session, data) {
    this.session = session;
    this.data = data;
  }
  async list(name, filter = {}) {
    return this.data
      ? clone((this.data[name] || []).filter(sift(filter)))
      : models[name]
          .find(filter)
          .session(this.session || null)
          .lean();
  }
  async get(name, id) {
    if (!mongoose.isObjectIdOrHexString(id))
      throw new AppError(400, "Invalid record ID");
    const canonicalId = new mongoose.Types.ObjectId(String(id)).toHexString();
    const item = (await this.list(name, { _id: canonicalId }))[0];
    if (!item) throw new AppError(404, `${name} not found`);
    return item;
  }
  async insert(name, input) {
    const doc = new models[name]({
      ...input,
      _id: input._id || new mongoose.Types.ObjectId(),
    });
    await doc.validate();
    if (!this.data) {
      await doc.save({ session: this.session });
      return doc.toObject();
    }
    const value = clone(doc.toObject());
    value.createdAt = new Date().toISOString();
    value.updatedAt = value.createdAt;
    this.checkUnique(name, value);
    (this.data[name] ||= []).push(value);
    return clone(value);
  }
  checkUnique(name, value) {
    for (const field of unique[name] || [])
      if (
        value[field] !== undefined &&
        (this.data[name] || []).some(
          (d) => d[field] === value[field] && d._id !== value._id,
        )
      )
        throw new AppError(409, `${field} already exists`);
  }
  async save(name, value) {
    const doc = new models[name](value);
    await doc.validate();
    if (!this.data)
      return models[name]
        .findOneAndReplace({ _id: value._id }, doc.toObject(), {
          session: this.session,
          returnDocument: "after",
          runValidators: true,
        })
        .lean();
    const next = clone(doc.toObject());
    next.updatedAt = new Date().toISOString();
    this.checkUnique(name, next);
    const index = (this.data[name] || []).findIndex((d) => d._id === next._id);
    if (index < 0) throw new AppError(404, `${name} not found`);
    this.data[name][index] = next;
    return clone(next);
  }
}
async function connect(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  mode =
    hello.setName || hello.msg === "isdbgrid"
      ? "transactions"
      : "standalone-atomic";
  if (mode === "standalone-atomic")
    await Aggregate.updateOne(
      { _id: "shop" },
      { $setOnInsert: { revision: 0, data: {} } },
      { upsert: true },
    );
  else for (const model of Object.values(models)) await model.init();
  return mode;
}
async function read(fn) {
  if (mode === "standalone-atomic") {
    const doc = await Aggregate.findById("shop").lean();
    return fn(new Tx(null, doc.data || {}));
  }
  return fn(new Tx(null));
}
async function transaction(fn) {
  if (mode !== "standalone-atomic")
    return mongoose.connection.transaction((session) => fn(new Tx(session)), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  for (let attempt = 0; attempt < 12; attempt++) {
    const snapshot = await Aggregate.findById("shop").lean();
    const data = clone(snapshot.data || {});
    const result = await fn(new Tx(null, data));
    if (calculateObjectSize({ data }) > 12 * 1024 * 1024)
      throw new AppError(
        507,
        "Standalone ledger capacity reached. Migrate to a MongoDB replica set before adding records.",
      );
    const saved = await Aggregate.updateOne(
      { _id: "shop", revision: snapshot.revision },
      { $set: { data }, $inc: { revision: 1 } },
    );
    if (saved.modifiedCount) return result;
  }
  throw new AppError(
    409,
    "Concurrent changes detected. Please retry with the same request key.",
  );
}
async function audit(tx, user, action, entity, entityId, details) {
  return tx.insert("AuditLog", {
    user: user?._id,
    action,
    entity,
    entityId: String(entityId || ""),
    details,
  });
}
const fingerprint = (data) =>
  crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
module.exports = {
  connect,
  read,
  transaction,
  audit,
  fingerprint,
  get mode() {
    return mode;
  },
  Aggregate,
  Tx,
};
