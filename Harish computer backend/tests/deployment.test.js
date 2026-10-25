const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.NODE_ENV = "test";
process.env.CLIENT_URL = "https://additional.example/, http://localhost:5173/";
const app = require("../app");
const { frontendOrigin } = require("../config/deployment.json");

describe("Vercel to Render API access", () => {
  it("allows credentialed login preflight from the production frontend", async () => {
    const response = await request(app)
      .options("/api/auth/login")
      .set("Origin", frontendOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,idempotency-key");
    assert.equal(response.status, 204);
    assert.equal(
      response.headers["access-control-allow-origin"],
      frontendOrigin,
    );
    assert.equal(response.headers["access-control-allow-credentials"], "true");
    assert.match(
      response.headers["access-control-allow-headers"],
      /idempotency-key/,
    );
  });
  it("passes a production-origin login through to validation", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", frontendOrigin)
      .send({});
    assert.equal(response.status, 400);
    assert.equal(
      response.headers["access-control-allow-origin"],
      frontendOrigin,
    );
  });
  it("accepts configured additional origins with trailing slashes removed", async () => {
    for (const origin of [
      "https://additional.example",
      "http://localhost:5173",
    ]) {
      const response = await request(app)
        .get("/api/health")
        .set("Origin", origin);
      assert.equal(response.headers["access-control-allow-origin"], origin);
    }
  });
  it("rejects write requests from another Vercel project", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://untrusted-project.vercel.app")
      .send({});
    assert.equal(response.status, 403);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
  });
  it("does not cache authenticated API responses or authentication errors", async () => {
    const health = await request(app).get("/api/health");
    const session = await request(app).get("/api/auth/me");
    assert.equal(health.headers["cache-control"], "no-store");
    assert.equal(session.status, 401);
    assert.equal(session.headers["cache-control"], "no-store");
  });
});
