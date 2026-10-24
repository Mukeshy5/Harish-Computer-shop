const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const {
  MongoMemoryServer,
  MongoMemoryReplSet,
} = require("mongodb-memory-server");
process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.NODE_ENV = "test";
process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = "false";
const store = require("../config/store"),
  app = require("../app");
const models = require("../models");
const installed = "C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe";
const binary = process.env.MONGOMS_SYSTEM_BINARY
  ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
  : fs.existsSync(installed)
    ? { systemBinary: installed }
    : {};
const key = () => crypto.randomUUID();
const id = (r) => String(r._id);
const password = "TestOnly-StrongPassword123!";
for (const replica of [true, false])
  describe(
    replica ? "Replica-set transactions" : "Standalone atomic ledger",
    { concurrency: false },
    () => {
      let mongo, admin, staff, adminUser, staffUser, category;
      const code = () => crypto.randomBytes(6).toString("hex").toUpperCase();
      async function product(extra = {}) {
        const r = await admin.post("/api/products").send({
          name: "Test component",
          model: "Test model",
          size: "Standard",
          productType: "Component",
          companyName: "Test company",
          colour: "Black",
          category: String(category._id),
          sku: code(),
          purchasePrice: 100,
          sellingPrice: 300,
          openingStock: 10,
          minStock: 3,
          taxRate: 18,
          ...extra,
        });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        return r.body;
      }
      async function party(path = "customers") {
        const r = await admin
          .post("/api/" + path)
          .send({ name: "Test account", openingBalance: 25 });
        assert.equal(r.status, 201);
        return r.body;
      }
      async function sale(p, extra = {}, agent = admin, requestKey = key()) {
        return agent
          .post("/api/sales")
          .set("Idempotency-Key", requestKey)
          .send({
            partyName: "Test Buyer",
            partyPhone: "9876543210",
            lines: [{ product: id(p), quantity: 2, rate: 300, discount: 20 }],
            method: "cash",
            paid: 1000,
            ...extra,
          });
      }
      before(async () => {
        mongo = replica
          ? await MongoMemoryReplSet.create({
              binary,
              // Disposable fixtures need a small oplog and indexes, even on a
              // developer machine below MongoDB's default 500 MiB index reserve.
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
        await store.connect(mongo.getUri("hcs_test"));
        assert.equal(
          store.mode,
          replica ? "transactions" : "standalone-atomic",
        );
        const hash = await bcrypt.hash(password, 4);
        await store.transaction(async (tx) => {
          adminUser = await tx.insert("User", {
            name: "Test admin",
            email: "admin@example.test",
            password: hash,
            role: "admin",
          });
          staffUser = await tx.insert("User", {
            name: "Test staff",
            email: "staff@example.test",
            password: hash,
            role: "staff",
            permissions: {},
          });
          await tx.insert("ShopSettings", { allowCreditSales: true });
          category = await tx.insert("Category", { name: "Test components" });
        });
        admin = request.agent(app);
        staff = request.agent(app);
        const login = await admin
          .post("/api/auth/login")
          .send({ email: "admin@example.test", password });
        assert.equal(login.status, 200, JSON.stringify(login.body));
        // Simulate a staff cookie issued before staff authentication was removed.
        const token = jwt.sign(
          { version: staffUser.tokenVersion },
          process.env.JWT_SECRET,
          {
            subject: String(staffUser._id),
            expiresIn: "8h",
            algorithm: "HS256",
          },
        );
        staff.set("Cookie", "hcs_session=" + token);
      }, 120000);
      after(async () => {
        await mongoose.disconnect();
        await mongo?.stop();
      });
      it("requires authentication and rejects invalid credentials", async () => {
        assert.equal((await request(app).get("/api/products")).status, 401);
        assert.equal(
          (
            await request(app)
              .post("/api/auth/login")
              .send({ email: "admin@example.test", password: "wrong" })
          ).status,
          401,
        );
      });
      it("rejects legacy staff sessions on all protected API groups", async () => {
        for (const path of [
          "/api/auth/me",
          "/api/products",
          "/api/inventory/summary",
          "/api/settings",
          "/api/reports/profit",
          "/api/audit-logs",
          "/api/sales",
          "/api/purchases",
          "/api/customers",
          "/api/suppliers",
          "/api/payments",
          "/api/expenses",
        ])
          assert.equal((await staff.get(path)).status, 401, path);
        for (const path of [
          "/api/purchases",
          "/api/customers",
          "/api/auth/change-password",
          "/api/auth/logout",
        ])
          assert.equal(
            (await staff.post(path).set("Idempotency-Key", key()).send({}))
              .status,
            401,
            path,
          );
        assert.equal(
          (await staff.patch("/api/settings").send({ name: "Unauthorized" }))
            .status,
          401,
        );
      });
      it("creates and edits products without silently changing stock", async () => {
        const p = await product();
        const r = await admin
          .patch(`/api/products/${p._id}`)
          .send({ name: "Updated component", stock: 999, averageCost: 0 });
        assert.equal(r.status, 200);
        assert.equal(r.body.stock, 10);
        assert.equal(r.body.averageCost, 100);
        const ledger = await admin
          .get("/api/inventory/movements")
          .query({ product: id(p) });
        assert.equal(ledger.body.data[0].quantity, 10);
      });
      it("enforces unique SKU and barcode", async () => {
        const p = await product({ barcode: code() });
        const duplicate = await admin
          .post("/api/products")
          .send({
            ...p,
            stock: 0,
            openingStock: 0,
            name: "Duplicate",
            sku: p.sku,
          });
        assert.equal(duplicate.status, 409);
        const duplicateBarcode = await admin
          .post("/api/products")
          .send({
            ...p,
            stock: 0,
            openingStock: 0,
            name: "Duplicate",
            sku: code(),
            barcode: p.barcode,
          });
        assert.equal(duplicateBarcode.status, 409);
      });
      it("keeps administrator inventory cost access", async () => {
        const p = await product();
        const result = await admin.get("/api/products/" + p._id);
        assert.equal(result.status, 200);
        assert.equal(result.body.averageCost, 100);
        assert.equal(result.body.purchasePrice, 100);
      });
      it("commits purchase stock, balances and weighted average cost exactly once", async () => {
        const p = await product(),
          supplier = await party("suppliers"),
          requestKey = key();
        const payload = {
          party: id(supplier),
          lines: [{ product: id(p), quantity: 10, rate: 200 }],
          method: "bank",
          paid: 100,
        };
        const a = await admin
          .post("/api/purchases")
          .set("Idempotency-Key", requestKey)
          .send(payload);
        assert.equal(a.status, 201, JSON.stringify(a.body));
        const b = await admin
          .post("/api/purchases")
          .set("Idempotency-Key", requestKey)
          .send(payload);
        assert.equal(a.body._id, b.body._id);
        const current = (await admin.get(`/api/products/${p._id}`)).body;
        assert.equal(current.stock, 20);
        assert.equal(current.averageCost, 150);
        assert.equal(a.body.total, 2360);
        assert.equal(a.body.due, 2260);
        const contact = (
          await admin.get(`/api/suppliers/${supplier._id}/history`)
        ).body;
        assert.equal(contact.party.balance, 2285);
      });
      it("calculates tax, discounts, cost allocation, profit and cash change", async () => {
        const p = await product(),
          r = await sale(p);
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.equal(r.body.subtotal, 600);
        assert.equal(r.body.discount, 20);
        assert.equal(r.body.tax, 104.4);
        assert.equal(r.body.total, 684.4);
        assert.equal(r.body.grossProfit, 380);
        assert.equal(r.body.change, 315.6);
        assert.equal(r.body.due, 0);
        assert.equal((await admin.get(`/api/products/${p._id}`)).body.stock, 8);
      });
      it("does not reduce stock twice for duplicate sales and rejects key reuse", async () => {
        const p = await product(),
          requestKey = key();
        const a = await sale(p, {}, admin, requestKey),
          b = await sale(p, {}, admin, requestKey);
        assert.equal(a.body._id, b.body._id);
        assert.equal((await admin.get(`/api/products/${p._id}`)).body.stock, 8);
        assert.equal(
          (await sale(p, { notes: "Different payload" }, admin, requestKey))
            .status,
          409,
        );
      });
      it("rejects insufficient stock with no partial inventory or invoice writes", async () => {
        const a = await product(),
          b = await product({ openingStock: 1 });
        const r = await sale(a, {
          lines: [
            { product: id(a), quantity: 1 },
            { product: id(b), quantity: 2 },
          ],
        });
        assert.equal(r.status, 409);
        assert.equal(
          (await admin.get(`/api/products/${a._id}`)).body.stock,
          10,
        );
        assert.equal((await admin.get(`/api/products/${b._id}`)).body.stock, 1);
      });
      it("serializes concurrent sales to prevent overselling", async () => {
        const p = await product({ openingStock: 1 });
        const input = { lines: [{ product: id(p), quantity: 1 }], paid: 354 };
        const results = await Promise.all([sale(p, input), sale(p, input)]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal((await admin.get(`/api/products/${p._id}`)).body.stock, 0);
      });
      it("serializes duplicate concurrent submissions", async () => {
        const p = await product(),
          requestKey = key();
        const results = await Promise.all([
          sale(p, {}, admin, requestKey),
          sale(p, {}, admin, requestKey),
        ]);
        assert.deepEqual(
          results.map((r) => r.status),
          [201, 201],
        );
        assert.equal(results[0].body._id, results[1].body._id);
        assert.equal((await admin.get(`/api/products/${p._id}`)).body.stock, 8);
      });
      it("validates line quantities, discounts and duplicate products", async () => {
        const p = await product();
        for (const lines of [
          [{ product: id(p), quantity: -1 }],
          [{ product: id(p), quantity: 1.5 }],
          [{ product: id(p), quantity: 1, discount: 10000 }],
          [
            { product: id(p), quantity: 1 },
            { product: id(p), quantity: 1 },
          ],
        ]) {
          assert.equal((await sale(p, { lines })).status, 400);
        }
        assert.equal(
          (await admin.get(`/api/products/${p._id}`)).body.stock,
          10,
        );
      });
      it("updates low-stock and out-of-stock alerts immediately", async () => {
        const p = await product({ openingStock: 2, minStock: 2 });
        let r = await admin.get("/api/inventory/low-stock").query({ q: p.sku });
        assert.equal(r.body.data[0].status, "LOW STOCK");
        await sale(p);
        r = await admin.get("/api/inventory/low-stock").query({ q: p.sku });
        assert.equal(r.body.data[0].status, "OUT OF STOCK");
      });
      it("requires adjustment reasons and never permits negative stock", async () => {
        const p = await product();
        const input = {
          product: id(p),
          type: "decrease",
          quantity: 11,
          reason: "Damaged stock",
        };
        assert.equal(
          (
            await admin
              .post("/api/inventory/adjustments")
              .set("Idempotency-Key", key())
              .send(input)
          ).status,
          409,
        );
        assert.equal(
          (
            await admin
              .post("/api/inventory/adjustments")
              .set("Idempotency-Key", key())
              .send({ ...input, quantity: 1, reason: "" })
          ).status,
          400,
        );
        const requestKey = key();
        for (let i = 0; i < 2; i++)
          assert.equal(
            (
              await admin
                .post("/api/inventory/adjustments")
                .set("Idempotency-Key", requestKey)
                .send({ ...input, quantity: 1 })
            ).status,
            201,
          );
        assert.equal((await admin.get(`/api/products/${p._id}`)).body.stock, 9);
      });
      it("records credit balances and accepts partial and final payments once", async () => {
        const p = await product(),
          customer = await party(),
          r = await sale(p, { party: id(customer), method: "credit", paid: 0 });
        assert.equal(r.status, 201);
        assert.equal(r.body.due, 684.4);
        const requestKey = key(),
          path = `/api/sales/${r.body._id}/payments`;
        for (let i = 0; i < 2; i++)
          assert.equal(
            (
              await admin
                .post(path)
                .set("Idempotency-Key", requestKey)
                .send({ amount: 100, method: "upi" })
            ).status,
            201,
          );
        let bill = (await admin.get(`/api/sales/${r.body._id}`)).body;
        assert.equal(bill.due, 584.4);
        assert.equal(
          (
            await admin
              .post(path)
              .set("Idempotency-Key", key())
              .send({ amount: 1000, method: "cash" })
          ).status,
          400,
        );
        assert.equal(
          (
            await admin
              .post(path)
              .set("Idempotency-Key", key())
              .send({ amount: 584.4, method: "card" })
          ).status,
          201,
        );
        const h = (await admin.get(`/api/customers/${customer._id}/history`))
          .body;
        assert.equal(h.party.balance, 25);
      });
      it("requires named customers and permission for credit sales", async () => {
        const p = await product();
        assert.equal(
          (await sale(p, { method: "credit", paid: 0 })).status,
          400,
        );
        const c = await party();
        assert.equal(
          (await sale(p, { party: id(c), method: "credit", paid: 0 }, staff))
            .status,
          401,
        );
      });
      it("returns sales at original costs, restores stock and records refunds once", async () => {
        const p = await product(),
          r = await sale(p);
        const path = `/api/sales/${r.body._id}/returns`,
          requestKey = key();
        const body = {
          reason: "Customer returned item",
          method: "cash",
          lines: [{ product: id(p), quantity: 1 }],
        };
        let returned;
        for (let i = 0; i < 2; i++) {
          returned = await admin
            .post(path)
            .set("Idempotency-Key", requestKey)
            .send(body);
          assert.equal(returned.status, 201, JSON.stringify(returned.body));
        }
        assert.equal(returned.body.total, 342.2);
        assert.equal(returned.body.refund, 342.2);
        assert.equal(returned.body.grossProfit, 190);
        const b = (await admin.get(`/api/sales/${r.body._id}`)).body;
        assert.equal(b.paid, 342.2);
        assert.equal(b.total, 684.4);
        assert.equal(b.returned, 342.2);
        assert.equal((await admin.get(`/api/products/${p._id}`)).body.stock, 9);
        assert.equal(
          (
            await admin
              .post(path)
              .set("Idempotency-Key", key())
              .send({ ...body, lines: [{ product: id(p), quantity: 2 }] })
          ).status,
          400,
        );
      });
      it("reduces purchase stock for returns and rejects unavailable units", async () => {
        const p = await product(),
          supplier = await party("suppliers");
        const r = await admin
          .post("/api/purchases")
          .set("Idempotency-Key", key())
          .send({
            party: id(supplier),
            lines: [{ product: id(p), quantity: 2, rate: 100 }],
            method: "cash",
            paid: 236,
          });
        assert.equal(r.status, 201);
        const ret = await admin
          .post(`/api/purchases/${r.body._id}/returns`)
          .set("Idempotency-Key", key())
          .send({
            reason: "Faulty delivery",
            lines: [{ product: id(p), quantity: 1 }],
            method: "bank",
          });
        assert.equal(ret.status, 201, JSON.stringify(ret.body));
        assert.equal(ret.body.refund, 118);
        assert.equal(
          (await admin.get(`/api/products/${p._id}`)).body.stock,
          11,
        );
      });
      it("cancels through a controlled full reversal and retains original invoice", async () => {
        const p = await product(),
          r = await sale(p, { charges: 10 });
        const cancelled = await admin
          .post(`/api/sales/${r.body._id}/cancel`)
          .set("Idempotency-Key", key())
          .send({ reason: "Incorrect invoice", method: "cash" });
        assert.equal(cancelled.status, 201);
        const bill = (await admin.get(`/api/sales/${r.body._id}`)).body;
        assert.equal(bill.status, "cancelled");
        assert.equal(bill.returned, bill.total);
        assert.equal(bill.due, 0);
        assert.equal(
          (await admin.get(`/api/products/${p._id}`)).body.stock,
          10,
        );
        assert.equal(
          (await admin.delete(`/api/sales/${r.body._id}`)).status,
          404,
        );
      });
      it("applies physical counts once and reconciles the ledger", async () => {
        const p = await product();
        const c = await admin
          .post("/api/inventory/stock-counts")
          .send({ lines: [{ product: id(p) }] });
        assert.equal(c.status, 201);
        const path = `/api/inventory/stock-counts/${c.body._id}`;
        assert.equal(
          (
            await admin.patch(path).send({
              lines: [
                { product: id(p), counted: 8, reason: "Two damaged units" },
              ],
            })
          ).status,
          200,
        );
        for (let i = 0; i < 2; i++)
          assert.equal((await admin.post(path + "/apply")).status, 200);
        assert.equal((await admin.get(`/api/products/${p._id}`)).body.stock, 8);
        const report = (
          await admin.get("/api/reports/inventory")
        ).body.data.find((r) => r.sku === p.sku);
        assert.equal(report.discrepancy, 0);
      });
      it("rejects stale physical counts after a sale", async () => {
        const p = await product(),
          c = await admin
            .post("/api/inventory/stock-counts")
            .send({ lines: [{ product: id(p) }] });
        await sale(p);
        assert.equal(
          (await admin.post(`/api/inventory/stock-counts/${c.body._id}/apply`))
            .status,
          409,
        );
      });
      it("protects historical invoices from legacy staff sessions", async () => {
        const p = await product(),
          result = await sale(p);
        assert.equal(
          (await staff.get("/api/sales/" + result.body._id)).status,
          401,
        );
        assert.equal(
          (
            await staff
              .post("/api/sales/" + result.body._id + "/returns")
              .set("Idempotency-Key", key())
              .send({})
          ).status,
          401,
        );
        const preserved = await admin.get("/api/sales/" + result.body._id);
        assert.equal(preserved.status, 200);
        assert.equal(preserved.body.total, result.body.total);
        assert.equal(preserved.body.lines[0].sku, p.sku);
      });
      it("deactivates products without deleting invoice history", async () => {
        const p = await product(),
          r = await sale(p);
        assert.equal(
          (
            await admin
              .patch(`/api/products/${p._id}/status`)
              .send({ active: false })
          ).status,
          200,
        );
        assert.equal((await sale(p)).status, 400);
        assert.equal(
          (await admin.get(`/api/sales/${r.body._id}`)).body.lines[0].sku,
          p.sku,
        );
      });
      it("records expenses and keeps gross profit separate from net profit", async () => {
        assert.equal(
          (
            await admin
              .post("/api/expenses")
              .send({ description: "Electricity", amount: 50 })
          ).status,
          201,
        );
        const r = await admin.get("/api/reports/profit");
        assert.equal(r.status, 200);
        assert.equal(
          r.body.data[0].netProfit,
          Math.round((r.body.data[0].grossProfit - 50) * 100) / 100,
        );
        assert.equal(
          (await admin.get("/api/reports/dashboard")).body.trend.length,
          7,
        );
      });
      it("rolls back a failure after stock movement creation", async () => {
        const p = await product();
        await assert.rejects(
          store.transaction(async (tx) => {
            const current = await tx.get("Product", p._id);
            await require("../services/billing").movement(
              tx,
              current,
              -2,
              "adjustment",
              "Injected test failure",
              "",
              adminUser,
            );
            throw new Error("Injected failure");
          }),
        );
        assert.equal(
          (await admin.get(`/api/products/${p._id}`)).body.stock,
          10,
        );
        assert.equal(
          (
            await admin
              .get("/api/inventory/movements")
              .query({ product: id(p) })
          ).body.total,
          1,
        );
      });
      it("canonicalizes product IDs and ignores client tax and total overrides", async () => {
        const p = await product();
        assert.equal(
          (
            await sale(p, {
              lines: [
                { product: id(p), quantity: 6 },
                { product: id(p).toUpperCase(), quantity: 6 },
              ],
            })
          ).status,
          400,
        );
        const r = await sale(p, {
          total: 1,
          lines: [{ product: id(p), quantity: 1, rate: 300, taxRate: 0 }],
          paid: 354,
        });
        assert.equal(r.status, 201);
        assert.equal(r.body.total, 354);
        assert.equal(r.body.tax, 54);
        assert.equal(
          (
            await sale(
              p,
              { lines: [{ product: id(p), quantity: 1, rate: 1 }] },
              staff,
            )
          ).status,
          401,
        );
      });
      it("requires matching payloads when retrying a return", async () => {
        const p = await product(),
          r = await sale(p),
          requestKey = key();
        const path = `/api/sales/${r.body._id}/returns`,
          body = {
            reason: "Partial return",
            lines: [{ product: id(p), quantity: 1 }],
          };
        assert.equal(
          (await admin.post(path).set("Idempotency-Key", requestKey).send(body))
            .status,
          201,
        );
        assert.equal(
          (
            await admin
              .post(path)
              .set("Idempotency-Key", requestKey)
              .send({ ...body, reason: "Different reason" })
          ).status,
          409,
        );
      });
      it("preserves exact totals across repeated fractional-value returns", async () => {
        const p = await product({ sellingPrice: 0.33, purchasePrice: 0.1 });
        const r = await sale(p, {
          lines: [{ product: id(p), quantity: 3, rate: 0.33, discount: 0.01 }],
          paid: 2,
        });
        assert.equal(r.status, 201);
        let total = 0;
        for (let i = 0; i < 3; i++) {
          const result = await admin
            .post(`/api/sales/${r.body._id}/returns`)
            .set("Idempotency-Key", key())
            .send({
              reason: "Fractional return",
              lines: [{ product: id(p), quantity: 1 }],
            });
          assert.equal(result.status, 201);
          total = Math.round((total + result.body.total) * 100) / 100;
        }
        assert.equal(total, r.body.total);
        assert.equal(
          (await admin.get(`/api/sales/${r.body._id}`)).body.paid,
          0,
        );
      });
      it("rejects purchase returns when the received units have already sold", async () => {
        const p = await product({ openingStock: 0 }),
          supplier = await party("suppliers");
        const r = await admin
          .post("/api/purchases")
          .set("Idempotency-Key", key())
          .send({
            party: id(supplier),
            lines: [{ product: id(p), quantity: 2, rate: 100 }],
            method: "cash",
            paid: 236,
          });
        await sale(p);
        const result = await admin
          .post(`/api/purchases/${r.body._id}/returns`)
          .set("Idempotency-Key", key())
          .send({
            reason: "Unavailable goods",
            lines: [{ product: id(p), quantity: 1 }],
          });
        assert.equal(result.status, 409);
        assert.equal(
          (await admin.get(`/api/purchases/${r.body._id}`)).body.returned,
          0,
        );
      });
      it("settles opening customer and supplier balances without invented invoices", async () => {
        for (const path of ["customers", "suppliers"]) {
          const c = await party(path),
            requestKey = key();
          for (let i = 0; i < 2; i++)
            assert.equal(
              (
                await admin
                  .post(`/api/${path}/${c._id}/payments`)
                  .set("Idempotency-Key", requestKey)
                  .send({ amount: 25, method: "bank" })
              ).status,
              201,
            );
          const history = (await admin.get(`/api/${path}/${c._id}/history`))
            .body;
          assert.equal(history.party.balance, 0);
          assert.equal(history.invoices.length, 0);
          assert.equal(history.payments.length, 1);
        }
      });
      it("creates a linked exchange only after an authorized return", async () => {
        const p = await product(),
          r = await sale(p);
        assert.equal((await sale(p, { exchangeOf: r.body._id })).status, 400);
        await admin
          .post(`/api/sales/${r.body._id}/returns`)
          .set("Idempotency-Key", key())
          .send({
            reason: "Exchange old component",
            lines: [{ product: id(p), quantity: 1 }],
          });
        const next = await sale(p, { exchangeOf: r.body._id });
        assert.equal(next.status, 201);
        assert.equal(String(next.body.exchangeOf), r.body._id);
        assert.equal(
          (await sale(p, { exchangeOf: r.body._id }, staff)).status,
          401,
        );
      });
      it("rejects staff credentials and delegated permissions without changing stored accounts", async () => {
        const email = code().toLowerCase() + "@example.test";
        const account = await store.transaction((tx) =>
          tx.insert("User", {
            name: "Legacy staff",
            email,
            password: staffUser.password,
            role: "staff",
            permissions: {
              purchaseEntry: true,
              manageContacts: true,
              creditSales: true,
              viewAllHistory: true,
            },
          }),
        );
        for (const panel of [undefined, "staff", "admin"]) {
          const result = await request(app)
            .post("/api/auth/login")
            .send({ email, password, ...(panel ? { panel } : {}) });
          assert.equal(result.status, 401);
          assert.equal(result.headers["set-cookie"], undefined);
        }
        const token = jwt.sign(
          { version: account.tokenVersion },
          process.env.JWT_SECRET,
          { subject: String(account._id), expiresIn: "8h", algorithm: "HS256" },
        );
        assert.equal(
          (
            await request(app)
              .get("/api/auth/me")
              .set("Cookie", "hcs_session=" + token)
          ).status,
          401,
        );
        const stored = await store.read((tx) => tx.get("User", account._id));
        assert.equal(stored.role, "staff");
        assert.equal(stored.active, true);
        assert.equal(stored.password, staffUser.password);
      });
      it("removes staff management endpoints without deleting historical users", async () => {
        const before = await store.read((tx) => tx.list("User"));
        for (const [method, path] of [
          ["get", "/api/staff"],
          ["post", "/api/staff"],
          ["patch", "/api/staff/" + staffUser._id],
          ["patch", "/api/staff/" + staffUser._id + "/status"],
        ])
          assert.equal(
            (
              await admin[method](path).send({
                name: "No new account",
                email: "unused@example.test",
                password,
                active: false,
              })
            ).status,
            404,
            method + " " + path,
          );
        assert.deepEqual(await store.read((tx) => tx.list("User")), before);
      });
      it("accepts the legacy admin panel parameter and rejects the staff selector", async () => {
        for (const panel of ["admin", "staff"]) {
          const result = await request(app)
            .post("/api/auth/login")
            .send({
              email: "admin@example.test",
              password,
              ...(panel ? { panel } : {}),
            });
          assert.equal(result.status, panel === "staff" ? 403 : 200);
          if (panel === "staff")
            assert.equal(result.headers["set-cookie"], undefined);
          else assert.equal(result.body.user.role, "admin");
        }
      });
      it("changes passwords securely and invalidates prior sessions", async () => {
        const email = `${code().toLowerCase()}@example.test`;
        await store.transaction((tx) =>
          tx.insert("User", {
            name: "Password test admin",
            email,
            password: staffUser.password,
            role: "admin",
          }),
        );
        const agent = request.agent(app);
        await agent.post("/api/auth/login").send({ email, password });
        assert.equal(
          (
            await agent.post("/api/auth/change-password").send({
              currentPassword: "incorrect",
              password: "DifferentSecurePassword123",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await agent.post("/api/auth/change-password").send({
              currentPassword: password,
              password: "DifferentSecurePassword123",
            })
          ).status,
          200,
        );
        assert.equal((await agent.get("/api/auth/me")).status, 401);
        assert.equal(
          (
            await agent
              .post("/api/auth/login")
              .send({ email, password: "DifferentSecurePassword123" })
          ).status,
          200,
        );
        await agent.post("/api/auth/logout");
        assert.equal((await agent.get("/api/auth/me")).status, 401);
      });
      it("exports all alerts and groups inventory by category", async () => {
        const r = await admin.get("/api/reports/low-stock");
        assert.equal(r.status, 200);
        assert.ok(
          r.body.data.every((p) => p.currentQuantity <= p.minimumQuantity),
        );
        assert.ok(
          (await admin.get("/api/inventory/summary")).body.categories.length >
            0,
        );
      });
      it("preserves billing contacts, product type/model and guarantee/warranty snapshots", async () => {
        const p = await product({ productType: "Storage", model: "SSD-256" });
        const r = await sale(p, {
          partyName: "Test Buyer",
          partyPhone: "9876543210",
          partyEmail: "Buyer@Gmail.com",
          partyAddress: "Test billing address",
          partyGstin: "27ABCDE1234F1Z5",
          lines: [
            {
              product: id(p),
              quantity: 1,
              guaranteeEnabled: true,
              warrantyEnabled: true,
              warrantyMonths: 12,
              warrantyDays: 15,
            },
          ],
        });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.equal(r.body.partyName, "Test Buyer");
        assert.equal(r.body.partyEmail, "buyer@gmail.com");
        assert.equal(r.body.partyAddress, "Test billing address");
        assert.equal(r.body.partyGstin, "27ABCDE1234F1Z5");
        assert.equal(r.body.lines[0].productType, "Storage");
        assert.equal(r.body.lines[0].model, "SSD-256");
        assert.equal(r.body.lines[0].guaranteeEnabled, true);
        assert.equal(r.body.lines[0].warrantyMonths, 12);
        assert.equal(r.body.lines[0].warrantyDays, 15);
        assert.ok(r.body.lines[0].warrantyStartDate);
        assert.ok(r.body.lines[0].warrantyExpiryDate);
        const pdf = await admin.get(`/api/sales/${r.body._id}/invoice`);
        assert.equal(pdf.status, 200);
        assert.match(pdf.headers["content-type"], /application\/pdf/);
        assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
        const filtered = await admin
          .get("/api/sales")
          .query({ q: r.body.number, paymentStatus: "paid" });
        assert.equal(filtered.body.total, 1);
        assert.equal(filtered.body.data[0].number, r.body.number);
        assert.equal(
          (await admin.get("/api/sales").query({ paymentStatus: "unknown" }))
            .status,
          400,
        );
        await admin
          .patch(`/api/products/${p._id}`)
          .send({ name: "Renamed product", model: "New model" });
        assert.equal(
          (await admin.get(`/api/sales/${r.body._id}`)).body.lines[0].model,
          "SSD-256",
        );
        const ret = await admin
          .post(`/api/sales/${r.body._id}/returns`)
          .set("Idempotency-Key", key())
          .send({
            reason: "Snapshot return",
            lines: [{ product: id(p), quantity: 1 }],
          });
        assert.equal(ret.status, 201);
        assert.equal(ret.body.lines[0].guaranteeEnabled, true);
        assert.equal(ret.body.lines[0].warrantyDays, 15);
      });
      it("rejects malformed contact and warranty details without reducing stock", async () => {
        const p = await product();
        for (const details of [
          { warrantyEnabled: "true", warrantyMonths: 12 },
          { warrantyEnabled: true, warrantyMonths: -1 },
          { warrantyEnabled: true, warrantyDays: 1.5 },
          { warrantyEnabled: true, warrantyMonths: 0, warrantyDays: 0 },
          { guaranteeEnabled: "yes" },
        ])
          assert.equal(
            (
              await sale(p, {
                lines: [{ product: id(p), quantity: 1, ...details }],
              })
            ).status,
            400,
          );
        for (const details of [
          { partyEmail: "invalid-email" },
          { partyGstin: "invalid-gst" },
          { partyPhone: "invalid-phone" },
          { partyPhone: "" },
          { partyName: 123 },
        ])
          assert.equal((await sale(p, details)).status, 400);
        assert.equal(
          (await admin.get(`/api/products/${p._id}`)).body.stock,
          10,
        );
      });
      it("creates, searches, updates and downloads secure service-center bills", async () => {
        const shopBody = {
          customerName: "Service Buyer",
          customerEmail: "SERVICE@EXAMPLE.TEST",
          customerPhone: "+91 98765 43210",
          customerAddress: "Shop Street",
          product: "Laptop",
          model: "HCS-14",
          serviceType: "Receive Shop",
          problem: "Laptop will not start",
          solution: "This secret must never be saved or shared",
          totalAmount: 1500,
          paidAmount: 500,
        };
        const requestKey = key();
        const created = await admin
          .post("/api/service-center")
          .set("Idempotency-Key", requestKey)
          .send(shopBody);
        assert.equal(created.status, 201, JSON.stringify(created.body));
        assert.match(created.body.number, /-SVC-000001$/);
        assert.equal(created.body.customerEmail, "service@example.test");
        assert.equal(created.body.printShop.name, "HARISH COMPUTER");
        assert.equal(created.body.printShop.phones.length, 3);
        assert.equal(created.body.pendingAmount, 1000);
        assert.equal(created.body.solution, undefined);
        const duplicate = await admin
          .post("/api/service-center")
          .set("Idempotency-Key", requestKey)
          .send(shopBody);
        assert.equal(duplicate.body._id, created.body._id);
        assert.equal(
          (await admin.get(`/api/service-center/${created.body._id}`)).body.solution,
          undefined,
        );
        const search = await admin
          .get("/api/service-center")
          .query({ q: "98765", serviceType: "Receive Shop" });
        assert.equal(search.body.total, 1);
        const pdf = await admin.get(`/api/service-center/${created.body._id}/bill`);
        assert.equal(pdf.status, 200);
        assert.match(pdf.headers["content-type"], /application\/pdf/);
        assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
        const updated = await admin
          .patch(`/api/service-center/${created.body._id}`)
          .send({
            serviceType: "Receive Customer",
            solution: "Replaced the charging port",
            totalAmount: 1600,
            paidAmount: 1600,
          });
        assert.equal(updated.status, 200, JSON.stringify(updated.body));
        assert.equal(updated.body.solution, "Replaced the charging port");
        assert.equal(updated.body.pendingAmount, 0);
        const hiddenAgain = await admin
          .patch(`/api/service-center/${created.body._id}`)
          .send({ serviceType: "Receive Shop", solution: "Must be discarded" });
        assert.equal(hiddenAgain.body.solution, undefined);
        const stored = await store.read((tx) =>
          tx.get("ServiceCenter", created.body._id),
        );
        assert.equal(stored.solution, undefined);
      });
      it("validates service details and payments and requires admin authentication", async () => {
        const body = {
          customerName: "Service Buyer",
          customerEmail: "buyer@example.test",
          customerPhone: "9876543210",
          product: "Desktop",
          serviceType: "Receive Customer",
          problem: "No display",
          solution: "Replaced cable",
          totalAmount: 1000,
          paidAmount: 500,
        };
        for (const invalid of [
          { customerEmail: "not-an-email" },
          { customerPhone: "bad-phone!" },
          { serviceType: "Invalid" },
          { problem: "" },
          { solution: "" },
          { totalAmount: -1 },
          { paidAmount: 1001 },
        ]) {
          const response = await admin
            .post("/api/service-center")
            .set("Idempotency-Key", key())
            .send({ ...body, ...invalid });
          assert.equal(response.status, 400, JSON.stringify(response.body));
        }
        assert.equal(
          (
            await staff
              .post("/api/service-center")
              .set("Idempotency-Key", key())
              .send(body)
          ).status,
          401,
        );
        assert.equal(
          (await staff.get("/api/service-center")).status,
          401,
        );
      });
      it("tracks failed service-email delivery without exposing a shop-only solution", async () => {
        const record = await admin
          .post("/api/service-center")
          .set("Idempotency-Key", key())
          .send({
            customerName: "Email Buyer",
            customerEmail: "buyer@example.test",
            customerPhone: "9876543210",
            product: "Desktop",
            serviceType: "Receive Shop",
            problem: "No display",
            solution: "Private internal note",
            totalAmount: 1000,
            paidAmount: 0,
          });
        assert.equal(record.status, 201);
        const names = [
          "SMTP_HOST",
          "SMTP_USER",
          "SMTP_PASS",
          "SMTP_FROM",
          "SMTP_PORT",
          "SMTP_SECURE",
        ];
        const previous = Object.fromEntries(
          names.map((name) => [name, process.env[name]]),
        );
        names.forEach((name) => delete process.env[name]);
        try {
          const failure = await admin
            .post(`/api/service-center/${record.body._id}/send-email`)
            .set("Idempotency-Key", key())
            .send({});
          assert.equal(failure.status, 503);
          const saved = await admin.get(`/api/service-center/${record.body._id}`);
          assert.equal(saved.body.solution, undefined);
          assert.equal(saved.body.emailDeliveries[0].status, "failed");
        } finally {
          for (const [name, value] of Object.entries(previous))
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
      });
      it("records email configuration failures without changing a saved sale", async () => {
        const p = await product();
        const r = await sale(p, {
          partyName: "Email Buyer",
          partyPhone: "9876543210",
          partyEmail: "buyer@example.test",
        });
        assert.equal(r.status, 201);
        const smtp = Object.fromEntries(
          ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].map((name) => [
            name,
            process.env[name],
          ]),
        );
        for (const name of Object.keys(smtp)) delete process.env[name];
        try {
          const response = await admin
            .post(`/api/sales/${r.body._id}/send-email`)
            .set("Idempotency-Key", key())
            .send({});
          assert.equal(response.status, 503);
          const saved = await admin.get(`/api/sales/${r.body._id}`);
          assert.equal(saved.body.emailDeliveries[0].status, "failed");
          assert.match(saved.body.emailDeliveries[0].failureReason, /SMTP is not configured/);
          assert.equal((await admin.get(`/api/products/${p._id}`)).body.stock, 8);
        } finally {
          for (const [name, value] of Object.entries(smtp))
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
      });
      it("allocates bill discounts before GST and keeps pending balances and reversals exact", async () => {
        const a = await product({ purchasePrice: 60, sellingPrice: 100 }),
          b = await product({
            purchasePrice: 120,
            sellingPrice: 200,
            taxRate: 5,
          }),
          customer = await party();
        const r = await sale(a, {
          party: id(customer),
          invoiceDiscount: 39,
          paid: 100,
          lines: [
            { product: id(a), quantity: 2, rate: 100, discount: 10 },
            { product: id(b), quantity: 1, rate: 200 },
          ],
        });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.equal(r.body.subtotal, 400);
        assert.equal(r.body.lineDiscount, 10);
        assert.equal(r.body.invoiceDiscount, 39);
        assert.equal(r.body.discount, 49);
        assert.equal(r.body.tax, 39.78);
        assert.equal(r.body.total, 390.78);
        assert.equal(r.body.due, 290.78);
        assert.equal(r.body.grossProfit, 111);
        assert.equal(r.body.lines[0].discount, 29);
        assert.equal(r.body.lines[1].discount, 20);
        const ret = await admin
          .post(`/api/sales/${r.body._id}/returns`)
          .set("Idempotency-Key", key())
          .send({
            reason: "Discounted partial return",
            lines: [{ product: id(a), quantity: 1 }],
          });
        assert.equal(ret.status, 201);
        assert.equal(ret.body.total, 100.89);
        assert.equal(
          (await admin.get(`/api/sales/${r.body._id}`)).body.due,
          189.89,
        );
        const cancel = await admin
          .post(`/api/sales/${r.body._id}/cancel`)
          .set("Idempotency-Key", key())
          .send({ reason: "Discounted remaining reversal" });
        assert.equal(cancel.status, 201);
        assert.equal(cancel.body.refund, 100);
        const restored = (await admin.get(`/api/sales/${r.body._id}`)).body;
        assert.equal(restored.returned, 390.78);
        assert.equal(restored.due, 0);
        assert.equal(
          (await admin.get(`/api/customers/${customer._id}/history`)).body.party
            .balance,
          25,
        );
      });
      it("allocates a one-paise invoice discount deterministically", async () => {
        const products = [];
        for (let i = 0; i < 3; i++)
          products.push(
            await product({ sellingPrice: 0.01, purchasePrice: 0, taxRate: 0 }),
          );
        const r = await sale(products[0], {
          invoiceDiscount: 0.01,
          paid: 1,
          lines: products.map((p) => ({
            product: id(p),
            quantity: 1,
            rate: 0.01,
          })),
        });
        assert.equal(r.status, 201);
        assert.equal(r.body.total, 0.02);
        assert.deepEqual(
          r.body.lines.map((l) => l.discount),
          [0.01, 0, 0],
        );
      });
      it("uses discounted purchase cost for weighted valuation and purchase returns", async () => {
        const p = await product(),
          supplier = await party("suppliers");
        const r = await admin
          .post("/api/purchases")
          .set("Idempotency-Key", key())
          .send({
            party: id(supplier),
            invoiceDiscount: 200,
            lines: [
              {
                product: id(p),
                quantity: 10,
                rate: 200,
                guaranteeEnabled: true,
                warrantyEnabled: true,
                warrantyMonths: 6,
              },
            ],
            paid: 2124,
            method: "cash",
          });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        assert.equal(r.body.total, 2124);
        assert.equal(r.body.lines[0].unitCost, 180);
        assert.equal(
          (await admin.get(`/api/products/${p._id}`)).body.averageCost,
          140,
        );
        const ret = await admin
          .post(`/api/purchases/${r.body._id}/returns`)
          .set("Idempotency-Key", key())
          .send({
            reason: "Discounted purchase return",
            lines: [{ product: id(p), quantity: 2 }],
          });
        assert.equal(ret.status, 201);
        assert.equal(ret.body.total, 424.8);
        assert.equal(ret.body.refund, 424.8);
      });
      it("rejects excessive bill discounts and keeps the original customer record separate from receipt details", async () => {
        const p = await product(),
          customer = await party();
        assert.equal((await sale(p, { invoiceDiscount: 10000 })).status, 400);
        const r = await sale(p, {
          party: id(customer),
          partyName: "Receipt recipient",
          partyEmail: "receipt@gmail.com",
          partyAddress: "Delivery address",
        });
        assert.equal(r.status, 201);
        assert.equal(r.body.partyName, "Receipt recipient");
        const account = (
          await admin.get(`/api/customers/${customer._id}/history`)
        ).body.party;
        assert.equal(account.name, "Test account");
        assert.equal(account.address, "");
      });
      it("supports explicit admin approval for one pending sale without enabling staff credit", async () => {
        const p = await product(),
          customer = await party();
        await admin.patch("/api/settings").send({ allowCreditSales: false });
        try {
          assert.equal(
            (await sale(p, { party: id(customer), paid: 100 })).status,
            403,
          );
          const r = await sale(p, {
            party: id(customer),
            paid: 100,
            approveCredit: true,
          });
          assert.equal(r.status, 201);
          assert.equal(r.body.due, 584.4);
          assert.equal(String(r.body.creditApprovedBy), String(adminUser._id));
          assert.equal(
            (
              await sale(
                p,
                { party: id(customer), paid: 100, approveCredit: true },
                staff,
              )
            ).status,
            401,
          );
        } finally {
          await admin.patch("/api/settings").send({ allowCreditSales: true });
        }
      });
      it("revokes admin sessions when deactivated and enforces untrusted origins", async () => {
        assert.equal(
          (
            await admin
              .post("/api/products")
              .set("Origin", "https://untrusted.example")
              .send({})
          ).status,
          403,
        );
        const email = code().toLowerCase() + "@example.test";
        const account = await store.transaction((tx) =>
          tx.insert("User", {
            name: "Inactive test admin",
            email,
            password: staffUser.password,
            role: "admin",
          }),
        );
        const agent = request.agent(app);
        assert.equal(
          (await agent.post("/api/auth/login").send({ email, password }))
            .status,
          200,
        );
        await store.transaction(async (tx) => {
          const user = await tx.get("User", account._id);
          user.active = false;
          await tx.save("User", user);
        });
        assert.equal((await agent.get("/api/auth/me")).status, 401);
      });
    },
  );
