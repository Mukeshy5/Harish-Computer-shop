const bcrypt = require("bcryptjs");
const store = require("../config/store");
const { settings } = require("./billing");
const { assert } = require("../utils/errors");

function isLocalSetupRequest(req) {
  return (
    process.env.NODE_ENV !== "production" &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
  );
}

async function needsAdmin() {
  return store.read(
    async (tx) =>
      (await tx.list("User", { role: "admin" })).length === 0 &&
      (await tx.list("AdminSetup")).length === 0,
  );
}

async function createFirstAdmin(input) {
  assert(
    Buffer.byteLength(input.password, "utf8") <= 72,
    "Password must be at most 72 UTF-8 bytes",
  );
  const password = await bcrypt.hash(input.password, 12);
  return store.transaction(async (tx) => {
    assert(
      (await tx.list("User", { role: "admin" })).length === 0 &&
        (await tx.list("AdminSetup")).length === 0,
      "An administrator account already exists. Please sign in.",
      409,
    );
    // Unique singleton serializes competing initializations in native MongoDB
    // transactions; standalone mode also protects it through aggregate CAS.
    await tx.insert("AdminSetup", { key: "first-admin" });
    const user = await tx.insert("User", {
      name: input.name,
      email: input.email,
      password,
      role: "admin",
      active: true,
    });
    const shop = await settings(tx);
    shop.name = process.env.SHOP_NAME || shop.name;
    await tx.save("ShopSettings", shop);
    await store.audit(tx, user, "admin.initialize", "User", user._id);
    return user;
  });
}

module.exports = { isLocalSetupRequest, needsAdmin, createFirstAdmin };
