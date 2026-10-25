const express = require("express"),
  cors = require("cors"),
  helmet = require("helmet"),
  cookieParser = require("cookie-parser");
const { rateLimit } = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs"),
  jwt = require("jsonwebtoken"),
  mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const store = require("./config/store"),
  billing = require("./services/billing");
const { invoicePdf } = require("./services/invoice-pdf");
const serviceCenter = require("./services/service-center");
const { serviceBillPdf } = require("./services/service-center-pdf");
const printShop = require("./config/print-shop.json");
const deployment = require("./config/deployment.json");
const { report, dateRange } = require("./services/reports");
const { settleOpening } = require("./services/accounts");
const { contact, imageUrl } = require("./validators/records");
const { productInput } = require("./validators/products");
const { createProduct } = require("./services/products");
const {
  isLocalSetupRequest,
  needsAdmin,
  createFirstAdmin,
} = require("./services/initialization");
const { authenticate, permit, publicUser } = require("./middleware/auth");
const {
  AppError,
  assert,
  pick,
  round,
  amount,
  quantity,
} = require("./utils/errors");
const app = express();
app.param("id", (req, _res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    return next(new AppError(400, "Invalid record ID"));
  req.params.id = new mongoose.Types.ObjectId(id).toHexString();
  next();
});
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
const origins = [
  ...new Set([
    deployment.frontendOrigin,
    ...(
      process.env.CLIENT_URL ||
      (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173")
    )
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  ]),
];
app.use(helmet());
app.use(cors({ origin: origins, credentials: true }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: process.env.NODE_ENV === "test" ? 10000 : 500,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.use((req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    !origins.includes(req.headers.origin)
  )
    return next(new AppError(403, "Untrusted request origin"));
  next();
});
const run = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const valid = (req) => {
  const errors = validationResult(req);
  assert(
    errors.isEmpty(),
    errors
      .array()
      .map((e) => e.msg)
      .join("; "),
  );
};
const key = (req) => {
  const v = req.headers["idempotency-key"];
  assert(
    typeof v === "string" && /^[a-zA-Z0-9:_-]{8,150}$/.test(v),
    "A valid Idempotency-Key header is required",
  );
  return v;
};
const cookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 8 * 60 * 60 * 1000,
  path: "/",
};
const sanitize = (v, u) => {
  if (u.role === "admin") return v;
  if (Array.isArray(v)) return v.map((x) => sanitize(x, u));
  if (
    v &&
    typeof v === "object" &&
    !(v instanceof Date) &&
    !(v instanceof mongoose.Types.ObjectId)
  ) {
    const out = {};
    for (const [k, x] of Object.entries(v))
      if (
        ![
          "averageCost",
          ...(!u.permissions?.purchaseEntry ? ["purchasePrice"] : []),
          "grossProfit",
          "unitCost",
          "valuation",
          "inventoryValue",
        ].includes(k)
      )
        out[k] = sanitize(x, u);
    return out;
  }
  return v;
};
function page(
  rows,
  req,
  fields = ["name", "sku", "barcode", "number", "partyName", "phone"],
) {
  let out = rows;
  const q = String(req.query.q || "")
    .toLowerCase()
    .slice(0, 150);
  if (q)
    out = out.filter((r) =>
      fields.some((k) =>
        String(r[k] || "")
          .toLowerCase()
          .includes(q),
      ),
    );
  for (const f of ["active", "category", "party", "status"])
    if (req.query[f]) out = out.filter((r) => String(r[f]) === req.query[f]);
  if (req.query.paymentStatus) {
    const status = String(req.query.paymentStatus);
    assert(["paid", "partial", "unpaid"].includes(status), "Invalid payment status");
    out = out.filter((r) => {
      const paymentStatus = r.due <= 0 ? "paid" : r.paid > 0 ? "partial" : "unpaid";
      return paymentStatus === status;
    });
  }
  if (req.query.from || req.query.to) {
    const within = dateRange(req.query);
    out = out.filter((r) => within(r.date || r.createdAt));
  }
  const sort = [
    "name",
    "sku",
    "stock",
    "sellingPrice",
    "createdAt",
    "date",
    "total",
    "balance",
  ].includes(req.query.sort)
    ? req.query.sort
    : "createdAt";
  const dir = req.query.order === "asc" ? 1 : -1;
  out.sort((a, b) =>
    typeof a[sort] === "number"
      ? (a[sort] - b[sort]) * dir
      : String(a[sort] || "").localeCompare(String(b[sort] || "")) * dir,
  );
  const limit = Math.min(
      100,
      Math.max(1, Math.floor(Number(req.query.limit) || 20)),
    ),
    p = Math.max(1, Math.floor(Number(req.query.page) || 1));
  return {
    data: out.slice((p - 1) * limit, p * limit),
    total: out.length,
    page: p,
    pages: Math.max(1, Math.ceil(out.length / limit)),
  };
}
app.get(["/health", "/api/health"], (_req, res) =>
  res.json({
    status: mongoose.connection.readyState === 1 ? "ok" : "unavailable",
    storage: store.mode || "disconnected",
  }),
);
app.post(
  "/api/enquiries",
  rateLimit({ windowMs: 3600000, limit: 20 }),
  body("name").trim().isLength({ min: 1, max: 150 }),
  body("contact").trim().isLength({ min: 1, max: 150 }),
  body("message").trim().isLength({ min: 1, max: 2000 }),
  run(async (req, res) => {
    valid(req);
    await store.transaction((tx) =>
      tx.insert("Enquiry", pick(req.body, ["name", "contact", "message"])),
    );
    res.status(201).json({ message: "Enquiry received successfully." });
  }),
);
app.get(
  "/api/auth/setup-status",
  run(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({
      canCreateAdmin: isLocalSetupRequest(req) && (await needsAdmin()),
    });
  }),
);
app.post(
  "/api/auth/setup",
  rateLimit({ windowMs: 15 * 60000, limit: 20 }),
  (req, _res, next) => {
    if (!isLocalSetupRequest(req))
      return next(
        new AppError(
          403,
          "Initial account setup is available only on this computer in development. Use the administrator setup script for production.",
        ),
      );
    next();
  },
  body("name")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Enter your name (1–200 characters)"),
  body("email")
    .trim()
    .isEmail()
    .toLowerCase()
    .withMessage("Enter a valid email address"),
  body("password")
    .isStrongPassword({ minLength: 12, minSymbols: 0 })
    .withMessage(
      "Use at least 12 characters with uppercase, lowercase and a number",
    ),
  run(async (req, res) => {
    valid(req);
    const user = await createFirstAdmin(
      pick(req.body, ["name", "email", "password"]),
    );
    const token = jwt.sign(
      { version: user.tokenVersion },
      process.env.JWT_SECRET,
      { subject: String(user._id), expiresIn: "8h", algorithm: "HS256" },
    );
    res.set("Cache-Control", "no-store");
    res.cookie("hcs_session", token, cookie);
    res.status(201).json({ user: publicUser(user) });
  }),
);
app.post(
  "/api/auth/login",
  rateLimit({ windowMs: 15 * 60000, limit: 20 }),
  body("email").trim().isEmail().toLowerCase(),
  body("password").isString().isLength({ min: 1, max: 128 }),
  run(async (req, res) => {
    valid(req);
    const u = await store.read(
      async (tx) => (await tx.list("User", { email: req.body.email }))[0],
    );
    assert(
      u?.active &&
        u.role === "admin" &&
        (await bcrypt.compare(req.body.password, u.password)),
      "Invalid email or password",
      401,
    );
    if (req.body.panel !== undefined)
      assert(
        req.body.panel === "admin",
        "Only administrator login is available",
        403,
      );
    const token = jwt.sign(
      { version: u.tokenVersion },
      process.env.JWT_SECRET,
      { subject: String(u._id), expiresIn: "8h", algorithm: "HS256" },
    );
    res.cookie("hcs_session", token, cookie);
    await store.transaction((tx) =>
      store.audit(tx, u, "auth.login", "User", u._id),
    );
    res.json({ user: publicUser(u) });
  }),
);
app.use("/api", authenticate);
app.get("/api/auth/me", (req, res) => res.json({ user: publicUser(req.user) }));
app.post(
  "/api/auth/logout",
  run(async (req, res) => {
    await store.transaction(async (tx) => {
      const u = await tx.get("User", req.user._id);
      u.tokenVersion++;
      await tx.save("User", u);
    });
    res.clearCookie("hcs_session", {
      httpOnly: true,
      secure: cookie.secure,
      sameSite: "lax",
      path: "/",
    });
    res.json({ message: "Signed out" });
  }),
);
app.post(
  "/api/auth/change-password",
  body("password")
    .isStrongPassword({ minLength: 12, minSymbols: 0 })
    .withMessage(
      "Use at least 12 characters with uppercase, lowercase and a number",
    ),
  run(async (req, res) => {
    valid(req);
    assert(
      await bcrypt.compare(
        String(req.body.currentPassword || ""),
        req.user.password,
      ),
      "Current password is incorrect",
    );
    assert(
      Buffer.byteLength(req.body.password, "utf8") <= 72,
      "Password must be at most 72 UTF-8 bytes",
    );
    const hash = await bcrypt.hash(req.body.password, 12);
    await store.transaction(async (tx) => {
      const u = await tx.get("User", req.user._id);
      u.password = hash;
      u.tokenVersion++;
      await tx.save("User", u);
      await store.audit(tx, u, "auth.password", "User", u._id);
    });
    res.clearCookie("hcs_session");
    res.json({ message: "Password changed. Sign in again." });
  }),
);
app.get(
  "/api/products",
  run(async (req, res) =>
    res.json(
      sanitize(
        page(await store.read((tx) => tx.list("Product")), req),
        req.user,
      ),
    ),
  ),
);
app.get(
  "/api/products/:id",
  run(async (req, res) =>
    res.json(
      sanitize(
        await store.read((tx) => tx.get("Product", req.params.id)),
        req.user,
      ),
    ),
  ),
);
app.post(
  "/api/products",
  permit("admin"),
  run(async (req, res) => {
    const requestKey =
      req.headers["idempotency-key"] === undefined ? undefined : key(req);
    const result = await createProduct(req.body, req.user, requestKey);
    const { createRequestKey, createRequestHash, ...product } = result.product;
    res
      .status(result.replay ? 200 : 201)
      .json({ ...product, message: "Product added successfully." });
  }),
);
app.patch(
  "/api/products/:id",
  permit("admin"),
  run(async (req, res) =>
    res.json(
      await store.transaction(async (tx) => {
        const p = await tx.get("Product", req.params.id);
        Object.assign(p, await productInput(tx, req.body));
        const saved = await tx.save("Product", p);
        await store.audit(tx, req.user, "product.update", "Product", p._id);
        return saved;
      }),
    ),
  ),
);
app.patch(
  "/api/products/:id/status",
  permit("admin"),
  run(async (req, res) =>
    res.json(
      await store.transaction(async (tx) => {
        assert(typeof req.body.active === "boolean", "Active must be boolean");
        const p = await tx.get("Product", req.params.id);
        p.active = req.body.active;
        await tx.save("Product", p);
        await store.audit(tx, req.user, "product.status", "Product", p._id, {
          active: p.active,
        });
        return p;
      }),
    ),
  ),
);
for (const [path, model] of [
  ["categories", "Category"],
  ["brands", "Brand"],
  ["customers", "Customer"],
  ["suppliers", "Supplier"],
]) {
  const master = ["Category", "Brand"].includes(model),
    fields = master
      ? ["name", "active"]
      : model === "Customer"
        ? ["name", "phone", "email", "address", "gstin"]
        : ["name", "phone", "address", "gstin", "contactPerson", "email"];
  app.get(
    `/api/${path}`,
    run(async (req, res) =>
      res.json(page(await store.read((tx) => tx.list(model)), req)),
    ),
  );
  app.post(
    `/api/${path}`,
    permit(master ? "admin" : "manageContacts"),
    run(async (req, res) =>
      res.status(201).json(
        await store.transaction(async (tx) => {
          const opening =
            req.user.role === "admin"
              ? amount(req.body.openingBalance || 0)
              : 0;
          const row = await tx.insert(model, {
            ...contact(req.body, fields),
            ...(!master ? { openingBalance: opening, balance: opening } : {}),
          });
          await store.audit(tx, req.user, "record.create", model, row._id);
          return row;
        }),
      ),
    ),
  );
  app.patch(
    `/api/${path}/:id`,
    permit(master ? "admin" : "manageContacts"),
    run(async (req, res) =>
      res.json(
        await store.transaction(async (tx) => {
          const row = await tx.get(model, req.params.id);
          Object.assign(row, contact(req.body, fields));
          const saved = await tx.save(model, row);
          await store.audit(tx, req.user, "record.update", model, row._id);
          return saved;
        }),
      ),
    ),
  );
  if (!master)
    app.post(
      `/api/${path}/:id/payments`,
      permit("admin"),
      run(async (req, res) =>
        res
          .status(201)
          .json(
            await settleOpening(
              model,
              req.params.id,
              req.body,
              req.user,
              key(req),
            ),
          ),
      ),
    );
  if (!master)
    app.get(
      `/api/${path}/:id/history`,
      permit("admin"),
      run(async (req, res) =>
        res.json(
          await store.read(async (tx) => {
            const party = await tx.get(model, req.params.id),
              invoices = await tx.list(
                model === "Customer" ? "Sale" : "Purchase",
                { party: req.params.id },
              ),
              payments = await tx.list("Payment", { party: req.params.id });
            return {
              party,
              invoices,
              payments,
              totalPurchases: round(
                invoices.reduce((s, i) => s + i.total - i.returned, 0),
              ),
            };
          }),
        ),
      ),
    );
}
app.get(
  "/api/inventory/summary",
  run(async (req, res) =>
    res.json(
      sanitize(
        await store.read(async (tx) => {
          const p = await tx.list("Product");
          const categories = await tx.list("Category");
          const groups = new Map();
          for (const product of p) {
            const category =
              categories.find((c) => String(c._id) === String(product.category))
                ?.name || "Uncategorized";
            const group = groups.get(category) || {
              category,
              products: 0,
              units: 0,
              valuation: 0,
            };
            group.products++;
            group.units += product.stock;
            group.valuation = round(
              group.valuation + product.stock * product.averageCost,
            );
            groups.set(category, group);
          }
          return {
            categories: [...groups.values()],
            uniqueProducts: p.length,
            totalUnits: p.reduce((s, p) => s + p.stock, 0),
            valuation: round(
              p.reduce((s, p) => s + p.stock * p.averageCost, 0),
            ),
          };
        }),
        req.user,
      ),
    ),
  ),
);
app.get(
  "/api/inventory/low-stock",
  run(async (req, res) =>
    res.json(
      sanitize(
        page(
          await store.read(async (tx) =>
            (await tx.list("Product"))
              .filter((p) => p.active && p.stock <= p.minStock)
              .map((p) => ({
                ...p,
                status: p.stock === 0 ? "OUT OF STOCK" : "LOW STOCK",
                suggestedReorder: Math.max(1, p.minStock * 2 - p.stock),
              })),
          ),
          req,
        ),
        req.user,
      ),
    ),
  ),
);
app.get(
  "/api/inventory/movements",
  permit("admin"),
  run(async (req, res) =>
    res.json(
      page(
        await store.read((tx) =>
          tx.list(
            "StockMovement",
            req.query.product ? { product: String(req.query.product) } : {},
          ),
        ),
        req,
        ["type", "reason", "reference"],
      ),
    ),
  ),
);
app.post(
  "/api/inventory/adjustments",
  permit("admin"),
  run(async (req, res) =>
    res.status(201).json(
      await store.transaction(async (tx) => {
        const requestKey = key(req),
          hash = store.fingerprint(req.body);
        const prior = (
          await tx.list("AuditLog", {
            action: "inventory.adjust",
            entityId: requestKey,
          })
        )[0];
        if (prior) {
          assert(prior.details.hash === hash, "Request key reused", 409);
          return tx.get("Product", prior.details.product);
        }
        const p = await tx.get("Product", req.body.product),
          qty = quantity(req.body.quantity);
        assert(
          ["increase", "decrease"].includes(req.body.type),
          "Choose increase or decrease",
        );
        assert(
          String(req.body.reason || "").trim().length >= 3,
          "A reason is required",
        );
        await billing.movement(
          tx,
          p,
          req.body.type === "increase" ? qty : -qty,
          "adjustment",
          req.body.reason,
          req.body.reference || "",
          req.user,
        );
        await store.audit(
          tx,
          req.user,
          "inventory.adjust",
          "Product",
          requestKey,
          { product: String(p._id), hash },
        );
        return p;
      }),
    ),
  ),
);
app.get(
  "/api/inventory/stock-counts",
  permit("admin"),
  run(async (req, res) =>
    res.json(page(await store.read((tx) => tx.list("StockCount")), req)),
  ),
);
app.post(
  "/api/inventory/stock-counts",
  permit("admin"),
  run(async (req, res) =>
    res.status(201).json(
      await store.transaction(async (tx) => {
        assert(
          Array.isArray(req.body.lines) &&
            req.body.lines.length > 0 &&
            req.body.lines.length <= 500,
          "Select 1 to 500 products",
        );
        const lines = [],
          seen = new Set();
        for (const l of req.body.lines) {
          const p = await tx.get("Product", l.product);
          assert(!seen.has(String(p._id)), "Duplicate counted product");
          seen.add(String(p._id));
          lines.push({
            product: p._id,
            name: p.name,
            sku: p.sku,
            expected: p.stock,
            counted: p.stock,
            difference: 0,
            reason: "",
          });
        }
        const c = await tx.insert("StockCount", { lines, user: req.user._id });
        await store.audit(tx, req.user, "count.start", "StockCount", c._id);
        return c;
      }),
    ),
  ),
);
app.patch(
  "/api/inventory/stock-counts/:id",
  permit("admin"),
  run(async (req, res) =>
    res.json(
      await store.transaction(async (tx) => {
        const c = await tx.get("StockCount", req.params.id);
        assert(c.status === "draft", "Count already applied");
        assert(
          Array.isArray(req.body.lines) &&
            req.body.lines.length === c.lines.length,
          "Supply every count line",
        );
        const seen = new Set();
        for (const l of req.body.lines) {
          assert(!seen.has(l.product), "Duplicate product");
          seen.add(l.product);
          const target = c.lines.find((x) => String(x.product) === l.product);
          assert(target, "Unexpected product");
          target.counted = quantity(l.counted, "Counted stock", true);
          target.difference = target.counted - target.expected;
          target.reason = String(l.reason || "");
          if (target.difference)
            assert(
              target.reason.trim().length >= 3,
              "A discrepancy reason is required",
            );
        }
        return tx.save("StockCount", c);
      }),
    ),
  ),
);
app.post(
  "/api/inventory/stock-counts/:id/apply",
  permit("admin"),
  run(async (req, res) =>
    res.json(
      await store.transaction(async (tx) => {
        const c = await tx.get("StockCount", req.params.id);
        if (c.status === "applied") return c;
        for (const l of c.lines) {
          const p = await tx.get("Product", l.product);
          assert(
            p.stock === l.expected,
            `${p.name} changed since count started. Start a new count.`,
            409,
          );
          if (l.difference)
            await billing.movement(
              tx,
              p,
              l.difference,
              "stock-count",
              l.reason,
              String(c._id),
              req.user,
            );
        }
        c.status = "applied";
        c.appliedBy = req.user._id;
        await tx.save("StockCount", c);
        await store.audit(tx, req.user, "count.apply", "StockCount", c._id);
        return c;
      }),
    ),
  ),
);
for (const [path, kind, model] of [
  ["sales", "sale", "Sale"],
  ["purchases", "purchase", "Purchase"],
]) {
  const guard =
    kind === "purchase"
      ? permit("purchaseEntry")
      : (_req, _res, next) => next();
  app.get(
    `/api/${path}`,
    guard,
    run(async (req, res) => {
      const scope =
        req.user.role === "admin" || req.user.permissions?.viewAllHistory
          ? {}
          : { user: String(req.user._id) };
      res.json(
        sanitize(
          page(
            await store.read((tx) => tx.list(model, scope)),
            req,
            kind === "sale"
              ? ["number", "partyName", "partyPhone", "partyEmail"]
              : undefined,
          ),
          req.user,
        ),
      );
    }),
  );
  app.post(
    `/api/${path}`,
    guard,
    run(async (req, res) =>
      res
        .status(201)
        .json(
          sanitize(
            await billing.invoice(kind, req.body, req.user, key(req)),
            req.user,
          ),
        ),
    ),
  );
  app.get(
    `/api/${path}/:id`,
    guard,
    run(async (req, res) =>
      res.json(
        sanitize(
          await store.read(async (tx) => {
            const b = await tx.get(model, req.params.id);
            assert(
              req.user.role === "admin" ||
                req.user.permissions?.viewAllHistory ||
                String(b.user) === String(req.user._id),
              "Invoice is restricted",
              403,
            );
            return {
              ...b,
              printShop,
              payments: await tx.list("Payment", { invoice: req.params.id }),
              returns: await tx.list(`${model}Return`, {
                invoice: req.params.id,
              }),
              ...(kind === "sale"
                ? {
                    emailDeliveries: (
                      await tx.list("InvoiceEmailDelivery", {
                        invoice: req.params.id,
                      })
                    ).sort(
                      (a, b) =>
                        new Date(b.createdAt) - new Date(a.createdAt),
                    ),
                  }
                : {}),
            };
          }),
          req.user,
        ),
      ),
    ),
  );
    app.get(
      `/api/${path}/:id/invoice`,
      guard,
      run(async (req, res) => {
        assert(kind === "sale", "Invoice PDF is available for sales only", 404);
        const invoice = await store.read(async (tx) => {
          const record = await tx.get(model, req.params.id);
          assert(
            req.user.role === "admin" ||
              req.user.permissions?.viewAllHistory ||
              String(record.user) === String(req.user._id),
            "Invoice is restricted",
            403,
          );
          return record;
        });
        const pdf = await invoicePdf(invoice);
        const filename = `${invoice.number.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
        res
          .type("application/pdf")
          .set("Content-Disposition", `attachment; filename="${filename}"`)
          .send(pdf);
      }),
    );
    if (kind === "sale")
      app.post(
        "/api/sales/:id/send-email",
        guard,
        run(async (req, res) => {
          const requestKey = key(req);
          const invoice = await store.read(async (tx) => {
            const record = await tx.get("Sale", req.params.id);
            assert(
              req.user.role === "admin" ||
                req.user.permissions?.viewAllHistory ||
                String(record.user) === String(req.user._id),
              "Invoice is restricted",
              403,
            );
            assert(record.partyEmail, "Add a customer email before sending");
            return record;
          });
          const pdf = await invoicePdf(invoice);
          const delivery = await store.transaction(async (tx) => {
            const prior = (await tx.list("InvoiceEmailDelivery", { requestKey }))[0];
            if (prior) {
              assert(
                String(prior.invoice) === req.params.id &&
                  prior.recipient === invoice.partyEmail,
                "Request key already used for a different email",
                409,
              );
              assert(
                prior.status === "sent",
                "This email attempt is already recorded. Start a new attempt if it failed.",
                409,
              );
              return prior;
            }
            const inProgress = (
              await tx.list("InvoiceEmailDelivery", {
                invoice: req.params.id,
                status: "pending",
              })
            )[0];
            assert(
              !inProgress,
              "An invoice email attempt is already in progress",
              409,
            );
            return tx.insert("InvoiceEmailDelivery", {
              invoice: req.params.id,
              recipient: invoice.partyEmail,
              status: "pending",
              requestKey,
              attemptedBy: req.user._id,
            });
          });
          if (delivery.status === "sent")
            return res.json({ message: "Invoice email was already sent.", delivery });

          const smtpHost = process.env.SMTP_HOST;
          const smtpUser = process.env.SMTP_USER;
          const smtpPass = process.env.SMTP_PASS;
          const smtpPort = Number(process.env.SMTP_PORT || 587);
          const smtpFrom = process.env.SMTP_FROM || smtpUser;
          const secure = process.env.SMTP_SECURE === "true" || smtpPort === 465;
          let sendResult;
          let failureReason = "";
          if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
            failureReason =
              "SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM.";
          } else {
            try {
              const transport = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure,
                auth: { user: smtpUser, pass: smtpPass },
              });
              sendResult = await transport.sendMail({
                from: smtpFrom,
                to: invoice.partyEmail,
                subject: `Harish Computer Shop — Sales Invoice ${invoice.number}`,
                text: [
                  `Dear ${invoice.partyName},`,
                  "",
                  `Please find your sales invoice ${invoice.number} attached.`,
                  `Total: INR ${invoice.total.toFixed(2)}`,
                  `Paid: INR ${invoice.paid.toFixed(2)}`,
                  `Pending: INR ${invoice.due.toFixed(2)}`,
                  "",
                  "Harish Computer Shop",
                ].join("\n"),
                attachments: [
                  {
                    filename: `${invoice.number.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`,
                    content: pdf,
                    contentType: "application/pdf",
                  },
                ],
              });
            } catch (error) {
              failureReason = String(error.message || "SMTP delivery failed").slice(
                0,
                2000,
              );
            }
          }

          if (failureReason) {
            await store.transaction(async (tx) => {
              const record = await tx.get("InvoiceEmailDelivery", delivery._id);
              record.status = "failed";
              record.failureReason = failureReason;
              await tx.save("InvoiceEmailDelivery", record);
              await store.audit(
                tx,
                req.user,
                "invoice.email.failed",
                "Sale",
                invoice._id,
                { recipient: invoice.partyEmail },
              );
            });
            throw new AppError(
              failureReason.startsWith("SMTP is not configured") ? 503 : 502,
              failureReason.startsWith("SMTP is not configured")
                ? "Invoice saved, but email delivery is not configured. Ask the administrator to configure SMTP."
                : "Invoice saved, but email delivery failed. Review SMTP settings and retry with a new attempt.",
            );
          }

          const sent = await store.transaction(async (tx) => {
            const record = await tx.get("InvoiceEmailDelivery", delivery._id);
            record.status = "sent";
            record.messageId = String(sendResult.messageId || "").slice(0, 500);
            record.failureReason = "";
            record.sentAt = new Date();
            const saved = await tx.save("InvoiceEmailDelivery", record);
            await store.audit(
              tx,
              req.user,
              "invoice.email.sent",
              "Sale",
              invoice._id,
              { recipient: invoice.partyEmail },
            );
            return saved;
          });
          res.json({ message: "Invoice email sent successfully.", delivery: sent });
        }),
      );
  app.post(
    `/api/${path}/:id/payments`,
    guard,
    run(async (req, res) =>
      res
        .status(201)
        .json(
          await billing.payment(
            kind,
            req.params.id,
            req.body,
            req.user,
            key(req),
          ),
        ),
    ),
  );
  app.post(
    `/api/${path}/:id/returns`,
    permit("admin"),
    run(async (req, res) =>
      res
        .status(201)
        .json(
          await billing.returnInvoice(
            kind,
            req.params.id,
            req.body,
            req.user,
            key(req),
          ),
        ),
    ),
  );
  app.post(
    `/api/${path}/:id/cancel`,
    permit("admin"),
    run(async (req, res) =>
      res
        .status(201)
        .json(
          await billing.returnInvoice(
            kind,
            req.params.id,
            req.body,
            req.user,
            key(req),
            true,
          ),
        ),
    ),
  );
}
app.get(
  "/api/service-center",
  permit("admin"),
  run(async (req, res) => {
    let records = await store.read((tx) => tx.list("ServiceCenter"));
    const q = String(req.query.q || "").trim().toLowerCase().slice(0, 150);
    if (q)
      records = records.filter((record) =>
        [
          record.number,
          record.customerName,
          record.customerEmail,
          record.customerPhone,
          record.product,
          record.model,
          record.problem,
        ].some((value) => String(value || "").toLowerCase().includes(q)),
      );
    for (const filter of ["serviceType", "status"])
      if (req.query[filter])
        records = records.filter(
          (record) => record[filter] === String(req.query[filter]),
        );
    if (req.query.from || req.query.to) {
      const within = dateRange(req.query);
      records = records.filter((record) => within(record.createdAt));
    }
    records.sort(
      (a, b) => new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf(),
    );
    const limit = Math.min(
      100,
      Math.max(1, Math.floor(Number(req.query.limit) || 20)),
    );
    const pageNumber = Math.max(1, Math.floor(Number(req.query.page) || 1));
    res.json({
      data: records
        .slice((pageNumber - 1) * limit, pageNumber * limit)
        .map(serviceCenter.serviceView),
      total: records.length,
      page: pageNumber,
      pages: Math.max(1, Math.ceil(records.length / limit)),
    });
  }),
);
app.post(
  "/api/service-center",
  permit("admin"),
  run(async (req, res) => {
    const record = await serviceCenter.create(req.body, req.user, key(req));
    res.status(201).json(serviceCenter.serviceView(record));
  }),
);
app.get(
  "/api/service-center/:id",
  permit("admin"),
  run(async (req, res) => {
    const result = await store.read(async (tx) => ({
      ...(await tx.get("ServiceCenter", req.params.id)),
      emailDeliveries: (
        await tx.list("ServiceEmailDelivery", { service: req.params.id })
      ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    }));
    res.json(serviceCenter.serviceView(result));
  }),
);
app.patch(
  "/api/service-center/:id",
  permit("admin"),
  run(async (req, res) => {
    const record = await serviceCenter.update(req.params.id, req.body, req.user);
    res.json(serviceCenter.serviceView(record));
  }),
);
app.get(
  "/api/service-center/:id/bill",
  permit("admin"),
  run(async (req, res) => {
    const record = await store.read((tx) =>
      tx.get("ServiceCenter", req.params.id),
    );
    const pdf = await serviceBillPdf(record);
    const filename = `${record.number.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
    res
      .type("application/pdf")
      .set("Content-Disposition", `attachment; filename="${filename}"`)
      .send(pdf);
  }),
);
app.post(
  "/api/service-center/:id/send-email",
  permit("admin"),
  run(async (req, res) => {
    const requestKey = key(req);
    const record = await store.read((tx) =>
      tx.get("ServiceCenter", req.params.id),
    );
    const pdf = await serviceBillPdf(record);
    const delivery = await store.transaction(async (tx) => {
      const prior = (await tx.list("ServiceEmailDelivery", { requestKey }))[0];
      if (prior) {
        assert(
          String(prior.service) === req.params.id &&
            prior.recipient === record.customerEmail,
          "Request key already used for a different service email",
          409,
        );
        assert(
          prior.status === "sent",
          "This email attempt is already recorded. Retry with a new request key.",
          409,
        );
        return prior;
      }
      const active = (
        await tx.list("ServiceEmailDelivery", {
          service: req.params.id,
          status: "pending",
        })
      )[0];
      assert(!active, "A service bill email is already in progress", 409);
      return tx.insert("ServiceEmailDelivery", {
        service: req.params.id,
        recipient: record.customerEmail,
        requestKey,
        attemptedBy: req.user._id,
        status: "pending",
      });
    });
    if (delivery.status === "sent")
      return res.json({ message: "Service bill email was already sent.", delivery });

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpFrom = process.env.SMTP_FROM || smtpUser;
    const secure = process.env.SMTP_SECURE === "true" || smtpPort === 465;
    let sendResult;
    let failureReason = "";
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      failureReason = "SMTP is not configured. Configure backend SMTP environment variables.";
    } else {
      try {
        const transport = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure,
          auth: { user: smtpUser, pass: smtpPass },
        });
        const serviceDescription = [
          `Product: ${record.product}`,
          `Model: ${record.model || "—"}`,
          `Type: ${record.serviceType}`,
          `Problem: ${record.problem}`,
          ...(record.serviceType === "Receive Customer" && record.solution
            ? [`Solution: ${record.solution}`]
            : []),
          `Total: INR ${record.totalAmount.toFixed(2)}`,
          `Paid: INR ${record.paidAmount.toFixed(2)}`,
          `Pending: INR ${record.pendingAmount.toFixed(2)}`,
        ].join("\n");
        sendResult = await transport.sendMail({
          from: smtpFrom,
          to: record.customerEmail,
          subject: `Harish Computer Shop — Service Bill ${record.number}`,
          text: [
            `Dear ${record.customerName},`,
            "",
            `Please find service bill ${record.number} attached.`,
            "",
            serviceDescription,
            "",
            "Harish Computer Shop",
          ].join("\n"),
          attachments: [
            {
              filename: `${record.number.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`,
              content: pdf,
              contentType: "application/pdf",
            },
          ],
        });
      } catch (error) {
        failureReason = String(error.message || "Email delivery failed").slice(0, 2000);
      }
    }

    if (failureReason) {
      await store.transaction(async (tx) => {
        const attempt = await tx.get("ServiceEmailDelivery", delivery._id);
        attempt.status = "failed";
        attempt.failureReason = failureReason;
        await tx.save("ServiceEmailDelivery", attempt);
        await store.audit(
          tx,
          req.user,
          "service.email.failed",
          "ServiceCenter",
          record._id,
          { recipient: record.customerEmail },
        );
      });
      throw new AppError(
        failureReason.startsWith("SMTP is not configured") ? 503 : 502,
        failureReason.startsWith("SMTP is not configured")
          ? "Service bill is saved, but email delivery is not configured."
          : "Service bill is saved, but email delivery failed. Retry with a new request.",
      );
    }
    const sent = await store.transaction(async (tx) => {
      const attempt = await tx.get("ServiceEmailDelivery", delivery._id);
      attempt.status = "sent";
      attempt.failureReason = "";
      attempt.messageId = String(sendResult.messageId || "").slice(0, 500);
      attempt.sentAt = new Date();
      const saved = await tx.save("ServiceEmailDelivery", attempt);
      await store.audit(
        tx,
        req.user,
        "service.email.sent",
        "ServiceCenter",
        record._id,
        { recipient: record.customerEmail },
      );
      return saved;
    });
    res.json({ message: "Service bill emailed successfully.", delivery: sent });
  }),
);
app.get(
  "/api/settings",
  run(async (req, res) =>
    res.json(
      await store.read(
        async (tx) =>
          (await tx.list("ShopSettings"))[0] || {
            name: "Harish Computer Shop",
          },
      ),
    ),
  ),
);
app.patch(
  "/api/settings",
  permit("admin"),
  run(async (req, res) =>
    res.json(
      await store.transaction(async (tx) => {
        const s = await billing.settings(tx);
        Object.assign(
          s,
          contact(req.body, [
            "name",
            "address",
            "phone",
            "email",
            "gstin",
            "logo",
            "salePrefix",
            "purchasePrefix",
            "defaultTax",
            "minStock",
            "allowCreditSales",
            "receiptFooter",
          ]),
        );
        imageUrl(s.logo);
        s.defaultTax = amount(s.defaultTax, "Default GST");
        s.minStock = quantity(s.minStock, "Default stock alert", true);
        assert(
          typeof s.allowCreditSales === "boolean",
          "Credit policy must be boolean",
        );
        assert(
          /^[A-Za-z0-9-]{1,15}$/.test(s.salePrefix) &&
            /^[A-Za-z0-9-]{1,15}$/.test(s.purchasePrefix),
          "Invoice prefixes must use 1–15 letters, numbers or hyphens",
        );
        const saved = await tx.save("ShopSettings", s);
        await store.audit(
          tx,
          req.user,
          "settings.update",
          "ShopSettings",
          s._id,
        );
        return saved;
      }),
    ),
  ),
);
app.get(
  "/api/reports/dashboard",
  run(async (req, res) =>
    res.json(
      sanitize(
        await store.read((tx) => report(tx, "dashboard", req.query, req.user)),
        req.user,
      ),
    ),
  ),
);
app.get(
  "/api/reports/:type",
  permit("admin"),
  run(async (req, res) => {
    assert(
      [
        "sales",
        "purchases",
        "profit",
        "low-stock",
        "inventory",
        "product-sales",
        "category-sales",
        "customer-sales",
        "supplier-purchases",
        "sale-returns",
        "purchase-returns",
        "collections",
        "movements",
      ].includes(req.params.type),
      "Report not found",
      404,
    );
    res.json({
      data: await store.read((tx) =>
        report(tx, req.params.type, req.query, req.user),
      ),
    });
  }),
);
for (const [path, model, fields] of [
  ["payments", "Payment", ["reference", "kind", "method"]],
  ["audit-logs", "AuditLog", ["action", "entity", "entityId"]],
  ["expenses", "Expense", ["description"]],
])
  app.get(
    `/api/${path}`,
    permit("admin"),
    run(async (req, res) =>
      res.json(page(await store.read((tx) => tx.list(model)), req, fields)),
    ),
  );
app.post(
  "/api/expenses",
  permit("admin"),
  run(async (req, res) =>
    res.status(201).json(
      await store.transaction(async (tx) => {
        const e = await tx.insert("Expense", {
          description: req.body.description,
          amount: amount(req.body.amount, "Expense", false),
          date: req.body.date || new Date(),
          user: req.user._id,
        });
        await store.audit(tx, req.user, "expense.create", "Expense", e._id);
        return e;
      }),
    ),
  ),
);
app.use((_req, _res, next) => next(new AppError(404, "Endpoint not found")));
app.use((e, _req, res, _next) => {
  let status = e.status || 500,
    message = e.message;
  if (e.code === 11000) {
    status = 409;
    message = `Duplicate ${Object.keys(e.keyPattern || {})[0] || "record"}`;
  }
  if (["ValidationError", "CastError", "StrictModeError"].includes(e.name)) {
    status = 400;
    message = e.message;
  }
  if (status >= 500 && !(e instanceof AppError)) {
    console.error("Request failed:", e.name);
    message =
      "Unable to complete request. Please retry or contact the administrator.";
  }
  res.status(status).json({
    error: { message, ...(e.fields ? { fields: e.fields } : {}) },
    message,
  });
});
module.exports = app;
