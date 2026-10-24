require("dotenv").config();
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const store = require("../config/store");
const { settings } = require("../services/billing");
async function main() {
  if (!process.env.MONGODB_URI)
    throw new Error("Set MONGODB_URI in .env first");
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const name = process.env.ADMIN_NAME || (await rl.question("Admin name: "));
  const email = (
    process.env.ADMIN_EMAIL || (await rl.question("Admin email: "))
  )
    .trim()
    .toLowerCase();
  // Password comes from the environment to avoid terminal echo or shell arguments.
  const password = process.env.ADMIN_PASSWORD;
  rl.close();
  if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Valid name and email required");
  if (
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password)
  )
    throw new Error(
      "Set ADMIN_PASSWORD to at least 12 characters with uppercase, lowercase and a number",
    );
  const hash = await bcrypt.hash(password, 12);
  await store.connect(process.env.MONGODB_URI);
  await store.transaction(async (tx) => {
    if ((await tx.list("User", { email })).length)
      throw new Error("This email already exists");
    const u = await tx.insert("User", {
      name,
      email,
      password: hash,
      role: "admin",
      active: true,
    });
    const s = await settings(tx);
    s.name = process.env.SHOP_NAME || s.name;
    await tx.save("ShopSettings", s);
    await store.audit(tx, u, "admin.initialize", "User", u._id);
  });
  console.log("Admin created. Clear ADMIN_PASSWORD from your environment.");
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
