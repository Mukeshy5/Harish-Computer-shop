const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const {
  MongoMemoryServer,
  MongoMemoryReplSet,
} = require("mongodb-memory-server");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = "false";
const store = require("../config/store"),
  app = require("../app");
const installed = String.raw`C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe`;
const binary = process.env.MONGOMS_SYSTEM_BINARY
  ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
  : fs.existsSync(installed)
    ? { systemBinary: installed }
    : {};
for (const replica of [true, false])
  describe(
    `Product form API: ${replica ? "replica set" : "standalone"}`,
    { concurrency: false },
    () => {
      let mongo, admin, category, user;
      const uri = () => mongo.getUri("hcs_product_form_test");
      const body = (extra = {}) => ({
        name: " SSD ",
        model: " X1 ",
        size: " 256GB ",
        productType: " Storage ",
        category: String(category._id),
        companyName: " Company ",
        colour: " Black ",
        sellingPrice: 100,
        stock: 2,
        minStock: 2,
        taxRate: 18,
        ...extra,
      });
      before(async () => {
        mongo = replica
          ? await MongoMemoryReplSet.create({
              binary,
              replSet: {
                count: 1,
                storageEngine: "wiredTiger",
                args: [
                  "--oplogSize",
                  "16",
                  "--setParameter",
                  "indexBuildMinAvailableDiskSpaceMB=16",
                ],
              },
            })
          : await MongoMemoryServer.create({ binary });
        await store.connect(uri());
        await store.transaction(async (tx) => {
          user = await tx.insert("User", {
            name: "Test owner",
            email: "owner@products.example",
            password: await bcrypt.hash("TestPassword123", 4),
            role: "admin",
          });
          category = await tx.insert("Category", { name: "Storage" });
        });
        admin = request.agent(app);
        assert.equal(
          (
            await admin
              .post("/api/auth/login")
              .send({ email: user.email, password: "TestPassword123" })
          ).status,
          200,
        );
      }, 120000);
      after(async () => {
        await mongoose.disconnect();
        await mongo?.stop();
      });

      it("saves all eleven fields, generates a SKU, and survives database reconnect and listing reload", async () => {
        const result = await admin
          .post("/api/products")
          .set("Idempotency-Key", crypto.randomUUID())
          .send(body());
        assert.equal(result.status, 201, JSON.stringify(result.body));
        assert.equal(result.body.message, "Product added successfully.");
        const product = result.body;
        assert.match(product.sku, /^HCS-[A-F0-9]{24}$/);
        assert.equal(product.name, "SSD");
        assert.equal(product.model, "X1");
        assert.equal(product.size, "256GB");
        assert.equal(product.companyName, "Company");
        assert.equal(product.colour, "Black");
        assert.equal(product.productType, "Storage");
        assert.equal(String(product.category), String(category._id));
        assert.equal(product.sellingPrice, 100);
        assert.equal(product.stock, 2);
        assert.equal(product.minStock, 2);
        assert.equal(product.taxRate, 18);
        await mongoose.disconnect();
        await store.connect(uri());
        const saved = (await admin.get(`/api/products/${product._id}`)).body;
        assert.equal(saved.size, "256GB");
        assert.equal(saved.stock, 2);
        const list = await admin.get("/api/products").query({ q: product.sku });
        assert.equal(list.body.data[0]._id, product._id);
        const movements = await store.read((tx) =>
          tx.list("StockMovement", { product: product._id }),
        );
        assert.equal(movements.length, 1);
        assert.equal(movements[0].quantity, 2);
      });
      it("maps the requested field names onto the existing catalog fields", async () => {
        const data = body();
        for (const [field, alias] of Object.entries({
          name: "productName",
          model: "productModel",
          size: "productSize",
          colour: "productColour",
          sellingPrice: "productPrice",
          minStock: "minimumStockAlert",
          taxRate: "gstRate",
        })) {
          data[alias] = data[field];
          delete data[field];
        }
        const result = await admin.post("/api/products").send(data);
        assert.equal(result.status, 201, JSON.stringify(result.body));
        assert.equal(result.body.sellingPrice, 100);
        assert.equal(result.body.productPrice, undefined);
      });
      it("rejects every missing required field without writing products or stock", async () => {
        const before = (await store.read((tx) => tx.list("Product"))).length;
        for (const field of Object.keys(body())) {
          const data = body();
          delete data[field];
          const result = await admin.post("/api/products").send(data);
          assert.equal(result.status, 400, field);
          assert.ok(result.body.error.fields[field], field);
        }
        assert.equal(
          (await store.read((tx) => tx.list("Product"))).length,
          before,
        );
      });
      it("rejects empty text, invalid numbers, types, category IDs, and conflicting aliases", async () => {
        for (const extra of [
          { name: " " },
          { model: 123 },
          { size: [] },
          { companyName: "" },
          { colour: null },
          { sellingPrice: 0 },
          { sellingPrice: -1 },
          { sellingPrice: "" },
          { sellingPrice: true },
          { sellingPrice: 1.234 },
          { stock: -1 },
          { stock: 0.5 },
          { stock: null },
          { minStock: -1 },
          { minStock: 0.5 },
          { taxRate: -1 },
          { taxRate: 101 },
          { taxRate: 5.123 },
          { category: "invalid" },
          { stock: 2, openingStock: 3 },
          { productPrice: 200 },
        ]) {
          const result = await admin.post("/api/products").send(body(extra));
          assert.equal(result.status, 400, JSON.stringify(extra));
          assert.ok(result.body.error.fields);
        }
        const missing = await admin
          .post("/api/products")
          .send(body({ category: new mongoose.Types.ObjectId().toString() }));
        assert.equal(missing.status, 400);
        assert.ok(missing.body.error.fields.category);
        const inactive = await store.transaction((tx) =>
          tx.insert("Category", { name: "Inactive", active: false }),
        );
        assert.equal(
          (
            await admin
              .post("/api/products")
              .send(body({ category: String(inactive._id) }))
          ).status,
          400,
        );
      });
      it("accepts zero stock, zero minimum, and zero GST without a dummy movement", async () => {
        const result = await admin
          .post("/api/products")
          .send(
            body({ stock: 0, minStock: 0, taxRate: 0, sellingPrice: 0.01 }),
          );
        assert.equal(result.status, 201);
        assert.equal(result.body.stock, 0);
        assert.equal(result.body.taxRate, 0);
        assert.equal(
          (
            await store.read((tx) =>
              tx.list("StockMovement", { product: result.body._id }),
            )
          ).length,
          0,
        );
      });
      it("deduplicates concurrent submissions and retries, and rejects request-key reuse with different data", async () => {
        const key = crypto.randomUUID();
        const results = await Promise.all(
          [1, 2].map(() =>
            admin
              .post("/api/products")
              .set("Idempotency-Key", key)
              .send(body()),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
        assert.equal(results[0].body._id, results[1].body._id);
        const retry = await admin
          .post("/api/products")
          .set("Idempotency-Key", key)
          .send(body());
        assert.equal(retry.status, 200);
        assert.equal(retry.body._id, results[0].body._id);
        assert.equal(
          (
            await store.read((tx) =>
              tx.list("StockMovement", { product: retry.body._id }),
            )
          ).length,
          1,
        );
        assert.equal(
          (
            await admin
              .post("/api/products")
              .set("Idempotency-Key", key)
              .send(body({ sellingPrice: 200 }))
          ).status,
          409,
        );
      });
      it("requires admin authentication for creation", async () => {
        assert.equal(
          (await request(app).post("/api/products").send(body())).status,
          401,
        );
        const staff = await store.transaction((tx) =>
          tx.insert("User", {
            name: "Legacy",
            email: "legacy@products.example",
            password: "unused",
            role: "staff",
          }),
        );
        const token = jwt.sign(
          { version: staff.tokenVersion },
          process.env.JWT_SECRET,
          { subject: String(staff._id), expiresIn: "1h" },
        );
        assert.equal(
          (
            await request(app)
              .post("/api/products")
              .set("Cookie", `hcs_session=${token}`)
              .send(body())
          ).status,
          401,
        );
      });
      it("uses the saved price and GST once in sales and refreshes alerts after sales, purchases and adjustments", async () => {
        const product = (
          await admin.post("/api/products").send(body({ stock: 1 }))
        ).body;
        const alerts = () =>
          admin.get("/api/inventory/low-stock").query({ q: product.sku });
        assert.equal((await alerts()).body.total, 1);
        const sale = await admin
          .post("/api/sales")
          .set("Idempotency-Key", crypto.randomUUID())
          .send({
            partyName: "Test buyer",
            partyPhone: "9876543210",
            lines: [{ product: product._id, quantity: 1 }],
            method: "cash",
            paid: 118,
          });
        assert.equal(sale.status, 201, JSON.stringify(sale.body));
        assert.equal(sale.body.tax, 18);
        assert.equal(sale.body.total, 118);
        assert.equal(sale.body.lines[0].model, "X1");
        assert.equal((await alerts()).body.data[0].stock, 0);
        const supplier = (
          await admin.post("/api/suppliers").send({ name: "Test supplier" })
        ).body;
        const purchase = await admin
          .post("/api/purchases")
          .set("Idempotency-Key", crypto.randomUUID())
          .send({
            party: supplier._id,
            lines: [{ product: product._id, quantity: 5, rate: 60 }],
            method: "cash",
            paid: 354,
          });
        assert.equal(purchase.status, 201, JSON.stringify(purchase.body));
        assert.equal((await alerts()).body.total, 0);
        const adjustment = await admin
          .post("/api/inventory/adjustments")
          .set("Idempotency-Key", crypto.randomUUID())
          .send({
            product: product._id,
            type: "decrease",
            quantity: 3,
            reason: "Count correction",
          });
        assert.equal(adjustment.status, 201, JSON.stringify(adjustment.body));
        assert.equal((await alerts()).body.data[0].stock, 2);
      });
      it("preserves legacy product IDs and allows stock adjustment and edits without requiring backfill", async () => {
        const legacy = await store.transaction((tx) =>
          tx.insert("Product", {
            name: "Existing product",
            sku: "LEGACY",
            stock: 0,
            sellingPrice: 0,
          }),
        );
        const adjustment = await admin
          .post("/api/inventory/adjustments")
          .set("Idempotency-Key", crypto.randomUUID())
          .send({
            product: String(legacy._id),
            type: "increase",
            quantity: 1,
            reason: "Existing stock",
          });
        assert.equal(adjustment.status, 201, JSON.stringify(adjustment.body));
        const edited = await admin
          .patch(`/api/products/${legacy._id}`)
          .send({
            name: "Existing renamed product",
            sellingPrice: 0,
            model: "",
            size: "",
            companyName: "",
            colour: "",
          });
        assert.equal(edited.status, 200);
        assert.equal(String(edited.body._id), String(legacy._id));
        assert.equal(edited.body.stock, 1);
      });
    },
  );
