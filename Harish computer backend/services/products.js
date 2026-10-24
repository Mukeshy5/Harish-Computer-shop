const mongoose = require("mongoose");
const store = require("../config/store");
const billing = require("./billing");
const { assert, amount } = require("../utils/errors");
const { productInput } = require("../validators/products");
function checkReplay(product, hash, user) {
  assert(
    product.createRequestHash === hash &&
      String(product.createdBy) === String(user._id),
    "Request key already used for different product data",
    409,
  );
  return { product, replay: true };
}
async function createProduct(data, user, requestKey) {
  const hash = store.fingerprint(data),
    id = new mongoose.Types.ObjectId();
  try {
    return await store.transaction(async (tx) => {
      if (requestKey) {
        const prior = (
          await tx.list("Product", { createRequestKey: requestKey })
        )[0];
        if (prior) return checkReplay(prior, hash, user);
      }
      const input = await productInput(tx, data, true);
      const { openingStock: opening, ...fields } = input;
      await billing.settings(tx);
      const product = await tx.insert("Product", {
        ...fields,
        _id: id,
        sku: fields.sku || `HCS-${id.toHexString().toUpperCase()}`,
        detailsVersion: 2,
        stock: 0,
        openingStock: opening,
        averageCost: amount(input.purchasePrice ?? 0),
        createdBy: user._id,
        ...(requestKey
          ? { createRequestKey: requestKey, createRequestHash: hash }
          : {}),
      });
      if (opening)
        await billing.movement(
          tx,
          product,
          opening,
          "opening",
          "Opening stock",
          "",
          user,
        );
      await store.audit(tx, user, "product.create", "Product", product._id);
      return { product, replay: false };
    });
  } catch (error) {
    if (requestKey && error.code === 11000) {
      const prior = await store.read(
        async (tx) =>
          (await tx.list("Product", { createRequestKey: requestKey }))[0],
      );
      if (prior) return checkReplay(prior, hash, user);
    }
    throw error;
  }
}
module.exports = { createProduct };
