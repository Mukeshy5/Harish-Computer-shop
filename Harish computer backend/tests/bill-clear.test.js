const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const {
  MongoMemoryServer,
  MongoMemoryReplSet,
} = require("mongodb-memory-server");
process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.NODE_ENV = "test";
process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = "false";
const store = require("../config/store");
const models = require("../models");
const app = require("../app");
const billing = require("../services/billing");
const serviceCenter = require("../services/service-center");
const { report } = require("../services/reports");
const clear = require("../services/bill-clear");
const installed = "C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe";
const binary = process.env.MONGOMS_SYSTEM_BINARY
  ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
  : fs.existsSync(installed)
    ? { systemBinary: installed }
    : {};
const enabledEnv = {
  BILL_CLEAR_ENABLED: "true",
  BILL_CLEAR_BACKUP_REFERENCE: "isolated-test-restore-verified",
  BILL_CLEAR_BACKUP_VERIFIED_AT: "2020-01-01T00:00:00Z",
};
const logger = { info() {}, error() {} };
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const replica of [true, false])
  describe(
    `Bill Clear: ${replica ? "replica set" : "standalone ledger"}`,
    { concurrency: false },
    () => {
      let mongo, user, agent, product, customer, supplier, now;
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
        await store.connect(mongo.getUri("hcs_bill_clear_isolated_test"));
      }, 120000);
      beforeEach(async () => {
        // This database belongs exclusively to the disposable MongoMemoryServer.
        if (replica)
          for (const model of Object.values(models)) await model.deleteMany({});
        else
          await store.Aggregate.updateOne(
            { _id: "shop" },
            { $set: { data: {} }, $inc: { revision: 1 } },
          );
        Object.assign(process.env, enabledEnv);
        now = new Date();
        await store.transaction(async (tx) => {
          user = await tx.insert("User", {
            name: "Test admin",
            email: "clear@example.test",
            password: "test-hash",
            role: "admin",
          });
          await tx.insert("ShopSettings", { allowCreditSales: true });
          product = await tx.insert("Product", {
            name: "Test product",
            sku: "CLEAR-TEST",
            stock: 20,
            openingStock: 20,
            averageCost: 50,
            purchasePrice: 50,
            sellingPrice: 100,
            taxRate: 18,
          });
          customer = await tx.insert("Customer", {
            name: "Test customer",
            phone: "9876543210",
          });
          supplier = await tx.insert("Supplier", { name: "Test supplier" });
        });
        agent = request.agent(app);
        agent.set(
          "Cookie",
          "hcs_session=" +
            jwt.sign({ version: user.tokenVersion }, process.env.JWT_SECRET, {
              subject: String(user._id),
              expiresIn: "1h",
              algorithm: "HS256",
            }),
        );
      });
      after(async () => {
        await mongoose.disconnect();
        await mongo?.stop();
      });
      async function age(model, bill, timestamp) {
        return store.transaction(async (tx) => {
          const value = await tx.get(model, bill._id);
          return tx.save(model, { ...value, createdAt: new Date(timestamp) });
        });
      }
      async function sale(days, extra = {}) {
        const bill = await billing.invoice(
          "sale",
          {
            party: String(customer._id),
            partyPhone: "9876543210",
            lines: [{ product: String(product._id), quantity: 1 }],
            paid: 20,
            method: "cash",
            ...extra,
          },
          user,
          crypto.randomUUID(),
        );
        return age("Sale", bill, now.valueOf() - days * clear.DAY);
      }
      const read = (model, id) => store.read((tx) => tx.get(model, id));
      const sweep = (options = {}) =>
        clear.runSweep({
          env: enabledEnv,
          clock: () => now,
          logger,
          ...options,
        });
      const remove = (bill) =>
        clear.clearBill("sale", String(bill._id), {
          user,
          confirmation: bill.number,
          now,
          env: enabledEnv,
        });

      it("never deletes a four-day bill, including one with a backdated editable bill date", async () => {
        const bill = await sale(4, { date: "2001-01-01" });
        assert.deepEqual(await sweep(), { deleted: 0, failed: 0 });
        assert.equal((await read("Sale", bill._id)).clearedAt, undefined);
        await assert.rejects(remove(bill), /five full days/);
        assert.equal(
          (
            await agent
              .delete(`/api/bill-clear/sale/${bill._id}`)
              .send({ confirmNumber: bill.number })
          ).status,
          409,
        );
        const list = await clear.listBills({}, { now, env: enabledEnv });
        assert.equal(list.data[0].status, "pending");
        assert.equal(list.data[0].ageDays, 4);
      });
      it("deletes only the bill that has completed exactly five full days", async () => {
        const five = await sale(5);
        const four = await sale(4);
        const justUnder = await sale(5 - 1 / clear.DAY);
        assert.deepEqual(await sweep(), { deleted: 1, failed: 0 });
        assert.ok((await read("Sale", five._id)).clearedAt);
        assert.equal((await read("Sale", four._id)).clearedAt, undefined);
        assert.equal((await read("Sale", justUnder._id)).clearedAt, undefined);
        const again = await sweep();
        assert.equal(again.deleted, 0);
        assert.equal(
          (await store.read((tx) => tx.list("BillClearArchive"))).length,
          1,
        );
      });
      it("manual deletion requires confirmation and affects only the selected ID", async () => {
        const selected = await sale(6);
        const other = await sale(6);
        const wrong = await agent
          .delete(`/api/bill-clear/sale/${selected._id}`)
          .send({ confirmNumber: other.number });
        assert.equal(wrong.status, 409);
        const deleted = await agent
          .delete(`/api/bill-clear/sale/${selected._id}`)
          .send({ confirmNumber: selected.number });
        assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
        assert.equal(deleted.body.deleted, true);
        assert.ok((await read("Sale", selected._id)).clearedAt);
        assert.equal((await read("Sale", other._id)).clearedAt, undefined);
        const retry = await agent
          .delete(`/api/bill-clear/sale/${selected._id}`)
          .send({ confirmNumber: selected.number });
        assert.equal(retry.body.deleted, false);
        assert.equal(
          (await store.read((tx) => tx.list("BillClearArchive"))).length,
          1,
        );
        const list = await agent.get("/api/sales");
        assert.deepEqual(
          list.body.data.map((row) => row._id),
          [String(other._id)],
        );
        const backup = await agent.get(
          `/api/bill-clear/sale/${selected._id}/backup`,
        );
        assert.equal(backup.status, 200);
        assert.match(backup.headers["content-disposition"], /attachment/);
        assert.equal(backup.body.snapshot.number, selected.number);
        assert.equal(
          crypto
            .createHash("sha256")
            .update(JSON.stringify(backup.body.snapshot))
            .digest("hex"),
          backup.body.checksum,
        );
      });
      it("retains financial reports, payments, accounts, products and stock references exactly once", async () => {
        const bill = await sale(6);
        const collections = [
          "Product",
          "Customer",
          "Supplier",
          "Payment",
          "StockMovement",
          "ShopSettings",
        ];
        const snapshots = () =>
          store.read(async (tx) =>
            Object.fromEntries(
              await Promise.all(
                collections.map(async (model) => [
                  model,
                  plain(await tx.list(model)),
                ]),
              ),
            ),
          );
        const before = await snapshots();
        const beforeProfit = await store.read((tx) =>
          report(tx, "profit", {}, user),
        );
        const beforeSales = await store.read((tx) =>
          report(tx, "sales", {}, user),
        );
        await remove(bill);
        assert.deepEqual(await snapshots(), before);
        assert.deepEqual(
          await store.read((tx) => report(tx, "profit", {}, user)),
          beforeProfit,
        );
        const afterSales = await store.read((tx) =>
          report(tx, "sales", {}, user),
        );
        assert.equal(afterSales.length, beforeSales.length);
        assert.equal(afterSales[0].total, beforeSales[0].total);
        assert.equal(afterSales[0].due, beforeSales[0].due);
        // Outstanding balances remain payable through the original accounting ID.
        await billing.payment(
          "sale",
          String(bill._id),
          { amount: 10, method: "cash" },
          user,
          crypto.randomUUID(),
        );
        const paid = await read("Sale", bill._id);
        assert.equal(paid.due, bill.due - 10);
        assert.ok(paid.clearedAt);
      });
      it("handles concurrent manual requests and automatic workers without duplicate deletion or backups", async () => {
        const bill = await sale(6);
        const results = await Promise.all([
          remove(bill),
          remove(bill),
          sweep(),
          sweep(),
        ]);
        assert.ok(results.some((result) => result.deleted));
        const archives = await store.read((tx) => tx.list("BillClearArchive"));
        assert.equal(archives.length, 1);
        const audit = await store.read((tx) =>
          tx.list("AuditLog", { action: "bill.clear" }),
        );
        assert.equal(audit.length, 1);
      });
      it("filters and pages status metadata without exposing recovery snapshots", async () => {
        const pending = await sale(4);
        const eligible = await sale(5);
        const deleted = await sale(6);
        await remove(deleted);
        const all = await clear.listBills(
          { limit: 1, page: 2 },
          { now, env: enabledEnv },
        );
        assert.equal(all.total, 3);
        assert.equal(all.pages, 3);
        assert.equal(all.data.length, 1);
        assert.equal(all.data[0]._id, String(eligible._id));
        assert.deepEqual(all.summary, { pending: 1, eligible: 1, deleted: 1 });
        for (const [status, bill] of [
          ["pending", pending],
          ["eligible", eligible],
          ["deleted", deleted],
        ]) {
          const list = await agent
            .get("/api/bill-clear")
            .query({ status, q: bill.number.toLowerCase() });
          assert.equal(list.body.total, 1);
          assert.equal(list.body.data[0]._id, String(bill._id));
          assert.equal(list.body.data[0].snapshot, undefined);
        }
        assert.equal(
          (await agent.get("/api/bill-clear").query({ status: "bad" })).status,
          400,
        );
      });
      it("catches up after a scheduler stop and restart using durable timestamps", async () => {
        const bill = await sale(4);
        const first = clear.startScheduler({
          env: enabledEnv,
          clock: () => now,
          logger,
        });
        await first.ready;
        await first.stop();
        assert.equal((await read("Sale", bill._id)).clearedAt, undefined);
        await mongoose.disconnect();
        await store.connect(mongo.getUri("hcs_bill_clear_isolated_test"));
        now = new Date(now.valueOf() + clear.DAY);
        const restarted = clear.startScheduler({
          env: enabledEnv,
          clock: () => now,
          logger,
        });
        try {
          await restarted.ready;
        } finally {
          await restarted.stop();
        }
        assert.ok((await read("Sale", bill._id)).clearedAt);
        const job = (await store.read((tx) => tx.list("ScheduledJob")))[0];
        assert.equal(job.deletedCount, 1);
        assert.equal(new Date(job.lastCompletedAt).valueOf(), now.valueOf());
      });
      it("recovers an expired process lease and respects an active process lease", async () => {
        const bill = await sale(6);
        const job = await store.transaction((tx) =>
          tx.insert("ScheduledJob", {
            key: clear.JOB_KEY,
            leaseOwner: "other-process",
            leaseUntil: new Date(now.valueOf() + 1000),
          }),
        );
        assert.equal((await sweep()).skipped, "locked");
        assert.equal((await read("Sale", bill._id)).clearedAt, undefined);
        now = new Date(now.valueOf() + 1001);
        assert.equal((await sweep()).deleted, 1);
        assert.equal(
          new Date((await read("ScheduledJob", job._id)).leaseUntil).valueOf(),
          0,
        );
      });
      it("handles sales, purchases and service bills individually without deleting linked data", async () => {
        const s = await sale(6);
        const p = await billing.invoice(
          "purchase",
          {
            party: String(supplier._id),
            lines: [
              {
                product: String(product._id),
                quantity: 1,
                rate: 50,
                taxRate: 18,
              },
            ],
            paid: 59,
            method: "cash",
          },
          user,
          crypto.randomUUID(),
        );
        await age("Purchase", p, now.valueOf() - 6 * clear.DAY);
        const service = await serviceCenter.create(
          {
            customerName: "Service customer",
            customerEmail: "test@example.test",
            customerPhone: "9876543210",
            product: "Laptop",
            serviceType: "Receive Shop",
            problem: "Power issue",
            totalAmount: 100,
            paidAmount: 0,
          },
          user,
          crypto.randomUUID(),
        );
        await age("ServiceCenter", service, now.valueOf() - 5 * clear.DAY);
        assert.equal((await sweep()).deleted, 3);
        for (const [model, bill] of [
          ["Sale", s],
          ["Purchase", p],
          ["ServiceCenter", service],
        ])
          assert.ok((await read(model, bill._id)).clearedAt);
        assert.equal((await agent.get("/api/purchases")).body.total, 0);
        assert.equal((await agent.get("/api/service-center")).body.total, 0);
        const list = await agent
          .get("/api/bill-clear")
          .query({ status: "deleted", kind: "service" });
        assert.equal(list.status, 200);
        assert.equal(list.body.total, 1);
        assert.equal(list.body.data[0].number, service.number);
        assert.equal((await read("Product", product._id)).stock, 20);
      });
      it("fails closed without a verified backup and never changes production activation settings", async () => {
        const bill = await sale(6);
        assert.equal((await sweep({ env: {} })).skipped, "disabled");
        assert.equal(
          (await sweep({ env: { BILL_CLEAR_ENABLED: "true" } })).skipped,
          "disabled",
        );
        assert.equal(
          clear.policy(
            { ...enabledEnv, BILL_CLEAR_BACKUP_VERIFIED_AT: "2999-01-01" },
            now,
          ).enabled,
          false,
        );
        delete process.env.BILL_CLEAR_BACKUP_REFERENCE;
        const response = await agent
          .delete(`/api/bill-clear/sale/${bill._id}`)
          .send({ confirmNumber: bill.number });
        assert.equal(response.status, 409);
        assert.equal((await read("Sale", bill._id)).clearedAt, undefined);
      });
      it("rolls back logical deletion when backup creation fails, records the failure, and retries later", async () => {
        const bill = await sale(6);
        const insert = store.Tx.prototype.insert;
        store.Tx.prototype.insert = function (name, data) {
          if (name === "BillClearArchive")
            throw new Error("Injected backup failure");
          return insert.call(this, name, data);
        };
        try {
          const result = await sweep();
          assert.equal(result.failed, 1);
          assert.equal(result.deleted, 0);
        } finally {
          store.Tx.prototype.insert = insert;
        }
        assert.equal((await read("Sale", bill._id)).clearedAt, undefined);
        const job = (await store.read((tx) => tx.list("ScheduledJob")))[0];
        assert.equal(job.failedCount, 1);
        assert.ok(job.lastError);
        assert.equal((await sweep()).deleted, 1);
      });
      it("protects all Bill Clear endpoints from anonymous and legacy staff sessions", async () => {
        const bill = await sale(6);
        const staff = await store.transaction((tx) =>
          tx.insert("User", {
            name: "Legacy staff",
            email: "staff-clear@example.test",
            password: "hash",
            role: "staff",
          }),
        );
        const token = jwt.sign(
          { version: staff.tokenVersion },
          process.env.JWT_SECRET,
          { subject: String(staff._id), expiresIn: "1h" },
        );
        for (const cookie of [undefined, `hcs_session=${token}`])
          for (const [method, path] of [
            ["get", "/api/bill-clear"],
            ["delete", `/api/bill-clear/sale/${bill._id}`],
            ["get", `/api/bill-clear/sale/${bill._id}/backup`],
          ]) {
            const pending = request(app)[method](path);
            if (cookie) pending.set("Cookie", cookie);
            assert.equal((await pending).status, 401);
          }
        assert.equal(
          (
            await agent
              .delete(`/api/bill-clear/product/${product._id}`)
              .send({ confirmNumber: product.sku })
          ).status,
          400,
        );
        assert.equal(
          (await agent.delete("/api/bill-clear/sale/not-an-id")).status,
          400,
        );
        assert.equal((await read("Sale", bill._id)).clearedAt, undefined);
      });
    },
  );
