// Launch the actual API and Vite, verify HTTP serving, and close only processes
// started here. This uses a separate MongoDB test database, never shop data.
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { MongoMemoryServer } = require("mongodb-memory-server");
async function main() {
  const installed = String.raw`C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe`;
  const binary = process.env.MONGOMS_SYSTEM_BINARY
    ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY }
    : fs.existsSync(installed)
      ? { systemBinary: installed }
      : {};
  process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = "false";
  const mongo = await MongoMemoryServer.create({ binary });
  const children = [];
  const logs = [];
  const launch = (args, cwd, env) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (b) => logs.push(b.toString()));
    child.stderr.on("data", (b) => logs.push(b.toString()));
    children.push(child);
    return child;
  };
  try {
    const backend = path.resolve(__dirname, "..");
    const frontend = path.resolve(backend, "..", "Harish computer frontend");
    launch(["index.js"], backend, {
      MONGODB_URI: mongo.getUri("hcs_http_verification"),
      JWT_SECRET: crypto.randomBytes(48).toString("hex"),
      PORT: "4100",
      CLIENT_URL: "http://localhost:5174",
    });
    launch(
      [
        path.join(frontend, "node_modules", "vite", "bin", "vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        "5174",
        "--strictPort",
      ],
      frontend,
      { API_TARGET: "http://127.0.0.1:4100" },
    );
    const until = Date.now() + 20000;
    let ready = false;
    while (Date.now() < until) {
      try {
        const health = await fetch("http://127.0.0.1:5174/api/health");
        if (health.ok && (await health.json()).status === "ok") {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!ready) throw new Error("HTTP readiness failed: " + logs.join(""));
    for (const route of ["/", "/app/login", "/app/pos"]) {
      const response = await fetch("http://127.0.0.1:5174" + route);
      if (!response.ok || !(await response.text()).includes('<div id="root">'))
        throw new Error(`Frontend failed: ${route}`);
      console.log(`PASS HTTP ${route}`);
    }
    const printModule = await fetch("http://127.0.0.1:5174/src/management/print/ShopHeader.jsx");
    if (!printModule.ok) throw new Error("Print header module failed to load through Vite");
    const printSource = await printModule.text();
    if (!printSource.includes("m-shop-print-header")) throw new Error("Shared print header module is missing");
    console.log("PASS shared shop print header through Vite");
    const privateRoute = await fetch("http://127.0.0.1:5174/api/products");
    if (privateRoute.status !== 401)
      throw new Error("Unauthenticated API access was not blocked");
    console.log(
      "PASS frontend proxy → API → MongoDB health; protected API returns 401",
    );
    const password = crypto.randomBytes(24).toString("base64url") + "Aa1!";
    const initializer = launch(["scripts/create-admin.js"], backend, {
      MONGODB_URI: mongo.getUri("hcs_http_verification"),
      ADMIN_NAME: "Isolated HTTP test owner",
      ADMIN_EMAIL: "owner@http-test.example",
      ADMIN_PASSWORD: password,
    });
    const initialized = await new Promise((resolve) =>
      initializer.once("exit", resolve),
    );
    if (initialized !== 0)
      throw new Error(
        "Controlled administrator initialization failed: " + logs.join(""),
      );
    let sessionCookie = "";
    async function api(
      method,
      route,
      body,
      expected = 200,
      requestKey = crypto.randomUUID(),
    ) {
      const response = await fetch("http://127.0.0.1:5174/api" + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:5174",
          Cookie: sessionCookie,
          "Idempotency-Key": requestKey,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      if (response.status !== expected)
        throw new Error(
          `${method} ${route} expected ${expected}, received ${response.status}: ${data.message}`,
        );
      return { data, response };
    }
    const login = await api("POST", "/auth/login", {
      email: "owner@http-test.example",
      password,
      panel: "admin",
    });
    const cookieHeader = login.response.headers.get("set-cookie");
    if (!cookieHeader?.includes("HttpOnly"))
      throw new Error("Session cookie is not HTTP-only");
    sessionCookie = cookieHeader.split(";")[0];
    if ((await api("GET", "/auth/me")).data.user.role !== "admin")
      throw new Error("Administrator session failed");
    const category = (
      await api("POST", "/categories", { name: "Isolated HTTP category" }, 201)
    ).data;
    const product = (
      await api(
        "POST",
        "/products",
        {
          name: "Isolated test component",
          model: "HTTP-SSD",
          size: "256GB",
          productType: "Storage",
          category: category._id,
          companyName: "Test company",
          colour: "Black",
          sku: "HTTP-ONLY",
          purchasePrice: 100,
          sellingPrice: 300,
          openingStock: 3,
          minStock: 3,
          taxRate: 18,
        },
        201,
      )
    ).data;
    const supplier = (
      await api("POST", "/suppliers", { name: "Isolated HTTP supplier" }, 201)
    ).data;
    await api(
      "POST",
      "/purchases",
      {
        party: supplier._id,
        lines: [{ product: product._id, quantity: 2, rate: 200 }],
        method: "cash",
        paid: 472,
      },
      201,
    );
    let current = (await api("GET", `/products/${product._id}`)).data;
    if (current.stock !== 5 || current.averageCost !== 140)
      throw new Error("Live purchase or weighted average failed");
    const saleKey = crypto.randomUUID();
    const customer = (
      await api(
        "POST",
        "/customers",
        {
          name: "Isolated billing buyer",
          phone: "9876543210",
          email: "buyer@gmail.com",
          address: "Isolated billing address",
          gstin: "27ABCDE1234F1Z5",
        },
        201,
      )
    ).data;
    const saleBody = {
      party: customer._id,
      lines: [
        {
          product: product._id,
          quantity: 2,
          discount: 20,
          productType: "Storage",
          model: "HTTP-SSD",
          guaranteeEnabled: true,
          warrantyEnabled: true,
          warrantyMonths: 12,
          warrantyDays: 15,
        },
      ],
      invoiceDiscount: 40,
      approveCredit: true,
      method: "cash",
      paid: 200,
    };
    const sale = (await api("POST", "/sales", saleBody, 201, saleKey)).data;
    await api("POST", "/sales", saleBody, 201, saleKey);
    current = (await api("GET", `/products/${product._id}`)).data;
    if (
      current.stock !== 3 ||
      sale.total !== 637.2 ||
      sale.grossProfit !== 260 ||
      sale.due !== 437.2 ||
      sale.partyEmail !== "buyer@gmail.com" ||
      !sale.lines[0].guaranteeEnabled ||
      sale.lines[0].warrantyMonths !== 12
    )
      throw new Error("Live sale/idempotency/cost allocation failed");
    await api(
      "POST",
      "/sales",
      { ...saleBody, lines: [{ product: product._id, quantity: 99 }] },
      409,
    );
    await api(
      "POST",
      `/sales/${sale._id}/returns`,
      {
        reason: "Isolated return verification",
        lines: [{ product: product._id, quantity: 1 }],
        method: "cash",
      },
      201,
    );
    current = (await api("GET", `/products/${product._id}`)).data;
    if (current.stock !== 4) throw new Error("Live return stock failed");
    const returnedSale = (await api("GET", `/sales/${sale._id}`)).data;
    if (returnedSale.printShop?.name !== "HARISH COMPUTER" || returnedSale.printShop.phones?.length !== 3) throw new Error("Invoice response is missing the common shop print header");
    if (returnedSale.due !== 118.6)
      throw new Error("Live discounted return balance failed");
    await api(
      "POST",
      `/sales/${sale._id}/payments`,
      { amount: 118.6, method: "upi" },
      201,
    );
    if ((await api("GET", `/sales/${sale._id}`)).data.due !== 0)
      throw new Error("Live pending payment failed");
    const reconciliation = (await api("GET", "/reports/inventory")).data
      .data[0];
    if (reconciliation.discrepancy !== 0)
      throw new Error("Live inventory ledger does not reconcile");
    console.log(
      "PASS admin setup, session, purchase, weighted cost, billing contacts, coverage, bill discount, pending payment, duplicate retry, return, and ledger reconciliation through the frontend proxy",
    );
  } finally {
    for (const child of children) {
      child.kill();
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", resolve);
        setTimeout(resolve, 3000);
      });
    }
    await mongo.stop();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
