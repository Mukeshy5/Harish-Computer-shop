const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const {
  MongoMemoryServer,
  MongoMemoryReplSet,
} = require("mongodb-memory-server");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = "false";
const store = require("../config/store");
const models = require("../models");
const app = require("../app");
const { isLocalSetupRequest } = require("../services/initialization");
const installed = String.raw`C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe`;
const binary = process.env.MONGOMS_SYSTEM_BINARY
  ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
  : fs.existsSync(installed)
    ? { systemBinary: installed }
    : {};
const input = {
  name: "First Test Owner",
  email: "first@example.test",
  password: "TestOnlySecurePassword123",
};

for (const replica of [true, false])
  describe(
    replica
      ? "First admin: replica-set transactions"
      : "First admin: standalone atomic ledger",
    { concurrency: false },
    () => {
      let mongo;
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
        await store.connect(mongo.getUri("hcs_initialization_test"));
      }, 120000);
      beforeEach(async () => {
        process.env.NODE_ENV = "test";
        // These collections belong only to the disposable server started above.
        if (replica) {
          for (const model of Object.values(models)) await model.deleteMany({});
        } else
          await store.Aggregate.updateOne(
            { _id: "shop" },
            { $set: { data: {}, revision: 0 } },
          );
      });
      after(async () => {
        process.env.NODE_ENV = "test";
        await mongoose.disconnect();
        await mongo?.stop();
      });
      it("advertises first-account setup without creating any account", async () => {
        const status = await request(app).get("/api/auth/setup-status");
        assert.equal(status.status, 200);
        assert.equal(status.body.canCreateAdmin, true);
        assert.equal(status.headers["cache-control"], "no-store");
        assert.equal((await store.read((tx) => tx.list("User"))).length, 0);
      });
      it("rejects invalid credentials before creating an account or claim", async () => {
        const result = await request(app)
          .post("/api/auth/setup")
          .send({ name: "", email: "invalid", password: "weak" });
        assert.equal(result.status, 400);
        assert.equal((await store.read((tx) => tx.list("User"))).length, 0);
        assert.equal(
          (await store.read((tx) => tx.list("AdminSetup"))).length,
          0,
        );
      });
      it("creates a hashed administrator, signs in, and closes public setup", async () => {
        const agent = request.agent(app);
        const result = await agent.post("/api/auth/setup").send({
          ...input,
          role: "staff",
          active: false,
          permissions: { purchaseEntry: true },
        });
        assert.equal(result.status, 201, JSON.stringify(result.body));
        assert.equal(result.body.user.role, "admin");
        assert.equal(result.body.user.active, true);
        assert.equal(result.body.user.password, undefined);
        assert.ok(result.headers["set-cookie"][0].includes("HttpOnly"));
        const stored = (await store.read((tx) => tx.list("User")))[0];
        assert.notEqual(stored.password, input.password);
        assert.ok(await bcrypt.compare(input.password, stored.password));
        assert.equal(
          (await agent.get("/api/auth/me")).body.user.email,
          input.email,
        );
        assert.equal(
          (await request(app).get("/api/auth/setup-status")).body
            .canCreateAdmin,
          false,
        );
        assert.equal(
          (
            await store.read((tx) =>
              tx.list("AuditLog", { action: "admin.initialize" }),
            )
          ).length,
          1,
        );
      });
      it("rejects setup even when an existing administrator is inactive", async () => {
        await store.transaction((tx) =>
          tx.insert("User", {
            name: "Existing owner",
            email: "existing@example.test",
            password: "isolated-hash-fixture",
            role: "admin",
            active: false,
          }),
        );
        assert.equal(
          (await request(app).get("/api/auth/setup-status")).body
            .canCreateAdmin,
          false,
        );
        assert.equal(
          (await request(app).post("/api/auth/setup").send(input)).status,
          409,
        );
      });
      it("allows exactly one winner for concurrent first-account requests", async () => {
        const results = await Promise.all([
          request(app).post("/api/auth/setup").send(input),
          request(app)
            .post("/api/auth/setup")
            .send({ ...input, email: "second@example.test" }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal(
          (await store.read((tx) => tx.list("User", { role: "admin" }))).length,
          1,
        );
        assert.equal(
          (await store.read((tx) => tx.list("AdminSetup"))).length,
          1,
        );
      });
      it("rolls back the initialization claim when user creation fails", async () => {
        await store.transaction((tx) =>
          tx.insert("User", {
            name: "Existing staff",
            email: input.email,
            password: "isolated-hash-fixture",
            role: "staff",
          }),
        );
        assert.equal(
          (await request(app).post("/api/auth/setup").send(input)).status,
          409,
        );
        assert.equal(
          (await store.read((tx) => tx.list("AdminSetup"))).length,
          0,
        );
        assert.equal(
          (
            await request(app)
              .post("/api/auth/setup")
              .send({ ...input, email: "owner@example.test" })
          ).status,
          201,
        );
      });
      it("does not reopen a claimed setup if an account is removed outside the app", async () => {
        await store.transaction((tx) =>
          tx.insert("AdminSetup", { key: "first-admin" }),
        );
        assert.equal(
          (await request(app).get("/api/auth/setup-status")).body
            .canCreateAdmin,
          false,
        );
      });
      it("rejects passwords that exceed bcrypt UTF-8 limits", async () => {
        assert.equal(
          (
            await request(app)
              .post("/api/auth/setup")
              .send({
                ...input,
                password: "😀".repeat(40) + "SecurePassword123",
              })
          ).status,
          400,
        );
      });
      it("disables web initialization in production", async () => {
        process.env.NODE_ENV = "production";
        try {
          assert.equal(
            (await request(app).get("/api/auth/setup-status")).body
              .canCreateAdmin,
            false,
          );
          assert.equal(
            (await request(app).post("/api/auth/setup").send(input)).status,
            403,
          );
        } finally {
          process.env.NODE_ENV = "test";
        }
        assert.equal((await store.read((tx) => tx.list("User"))).length, 0);
      });
      it("uses the socket address rather than forwarded loopback claims", () => {
        assert.equal(
          isLocalSetupRequest({
            socket: { remoteAddress: "192.0.2.1" },
            ip: "127.0.0.1",
          }),
          false,
        );
        assert.equal(
          isLocalSetupRequest({
            socket: { remoteAddress: "::ffff:127.0.0.1" },
          }),
          true,
        );
      });
    },
  );
