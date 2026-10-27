const crypto = require("node:crypto");
const mongoose = require("mongoose");
const models = require("../models");
const store = require("../config/store");
const { assert } = require("../utils/errors");

const DAY = 24 * 60 * 60 * 1000;
const RETENTION = 5 * DAY;
const JOB_KEY = "bill-clear-v1";
const SCAN_INTERVAL = 60 * 1000;
const LEASE_TIME = 2 * 60 * 1000;
const kinds = { sale: "Sale", purchase: "Purchase", service: "ServiceCenter" };
const clone = (value) => JSON.parse(JSON.stringify(value));
const checksum = (snapshot) =>
  crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
const stamp = (value) => (value == null ? NaN : new Date(value).valueOf());
const validCreatedAt = (bill) =>
  Number.isFinite(stamp(bill.createdAt)) && stamp(bill.createdAt) > 0;
const eligible = (bill, now) =>
  !bill.clearedAt &&
  validCreatedAt(bill) &&
  stamp(bill.createdAt) <= now.valueOf() - RETENTION;

function policy(env = process.env, now = new Date()) {
  const verified = stamp(env.BILL_CLEAR_BACKUP_VERIFIED_AT);
  const backupReference = String(env.BILL_CLEAR_BACKUP_REFERENCE || "")
    .trim()
    .slice(0, 500);
  const backupVerified =
    Boolean(backupReference) &&
    Number.isFinite(verified) &&
    verified > 0 &&
    verified <= now.valueOf();
  const enabled = env.BILL_CLEAR_ENABLED === "true" && backupVerified;
  return {
    enabled,
    retentionDays: 5,
    scanIntervalSeconds: SCAN_INTERVAL / 1000,
    deletionMode: "recoverable",
    backupVerified,
    backupVerifiedAt: backupVerified ? new Date(verified).toISOString() : null,
    backupReference: backupVerified ? backupReference : "",
    reason: enabled
      ? ""
      : env.BILL_CLEAR_ENABLED !== "true"
        ? "Deletion is paused. Verify a full database backup and restore before enabling Bill Clear on the server."
        : "Deletion is paused because a verified backup reference and timestamp are required.",
  };
}
function modelFor(kind) {
  assert(
    typeof kind === "string" && Object.hasOwn(kinds, kind),
    "Invalid bill type",
  );
  return kinds[kind];
}
function billView(kind, bill, now) {
  const known = validCreatedAt(bill);
  const status = bill.clearedAt
    ? "deleted"
    : eligible(bill, now)
      ? "eligible"
      : "pending";
  return {
    _id: String(bill._id),
    key: `${kind}:${bill._id}`,
    kind,
    number: bill.number,
    customerName:
      kind === "service"
        ? bill.customerName
        : bill.partyName || "Walk-in customer",
    billDate: bill.date || bill.createdAt || null,
    createdAt: bill.createdAt || null,
    total: kind === "service" ? bill.totalAmount : bill.total,
    ageDays: known
      ? Math.max(0, Math.floor((now.valueOf() - stamp(bill.createdAt)) / DAY))
      : null,
    eligibleAt: known
      ? new Date(stamp(bill.createdAt) + RETENTION).toISOString()
      : null,
    status,
    deletedAt: bill.clearedAt || null,
    source: bill.clearSource || null,
  };
}
const sortBills = (a, b) =>
  (stamp(b.createdAt) || 0) - (stamp(a.createdAt) || 0) ||
  a.key.localeCompare(b.key);
function statusFilter(status, now) {
  const cutoff = new Date(now.valueOf() - RETENTION);
  if (status === "deleted") return { clearedAt: { $ne: null } };
  if (status === "eligible")
    return { clearedAt: null, createdAt: { $gt: new Date(0), $lte: cutoff } };
  if (status === "pending")
    return {
      clearedAt: null,
      $or: [
        { createdAt: { $gt: cutoff } },
        { createdAt: null },
        { createdAt: { $lte: new Date(0) } },
      ],
    };
  return {};
}
async function listBills(
  query = {},
  { now = new Date(), env = process.env } = {},
) {
  assert(
    [undefined, "", "pending", "eligible", "deleted"].includes(query.status),
    "Invalid deletion status",
  );
  const selected = query.kind
    ? [[query.kind, modelFor(query.kind)]]
    : Object.entries(kinds);
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  assert(Number.isSafeInteger(page) && page <= 100000, "Invalid page number");
  const limit = Math.min(
    100,
    Math.max(1, Math.floor(Number(query.limit) || 20)),
  );
  const q = String(query.q || "")
    .trim()
    .toLowerCase()
    .slice(0, 150);
  const offset = (page - 1) * limit;
  const summary = { pending: 0, eligible: 0, deleted: 0 };
  const result = await store.read(async (tx) => {
    if (tx.data) {
      let rows = [];
      for (const [kind, model] of selected)
        rows.push(
          ...(await tx.list(model)).map((bill) => billView(kind, bill, now)),
        );
      rows = rows.filter(
        (row) =>
          !q || `${row.number} ${row.customerName}`.toLowerCase().includes(q),
      );
      for (const row of rows) summary[row.status]++;
      const filtered = rows
        .filter((row) => !query.status || row.status === query.status)
        .sort(sortBills);
      return {
        data: filtered.slice(offset, offset + limit),
        total: filtered.length,
      };
    }
    // Read only bill metadata, never every invoice's lines and payment history.
    const results = await Promise.all(
      selected.map(async ([kind, model]) => {
        const search = q
          ? {
              $or: [
                "number",
                kind === "service" ? "customerName" : "partyName",
              ].map((field) => ({
                [field]: {
                  $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  $options: "i",
                },
              })),
            }
          : {};
        const filter = { $and: [search, statusFilter(query.status, now)] };
        const [rows, counts] = await Promise.all([
          models[model]
            .find(filter)
            .select(
              "number partyName customerName date createdAt total totalAmount clearedAt clearSource",
            )
            .sort({ createdAt: -1, _id: 1 })
            .limit(offset + limit)
            .lean(),
          Promise.all(
            ["pending", "eligible", "deleted"].map(async (status) => [
              status,
              await models[model].countDocuments({
                $and: [search, statusFilter(status, now)],
              }),
            ]),
          ),
        ]);
        return { rows: rows.map((bill) => billView(kind, bill, now)), counts };
      }),
    );
    for (const { counts } of results)
      for (const [status, count] of counts) summary[status] += count;
    const total = query.status
      ? summary[query.status]
      : Object.values(summary).reduce((sum, count) => sum + count, 0);
    return {
      data: results
        .flatMap((result) => result.rows)
        .sort(sortBills)
        .slice(offset, offset + limit),
      total,
    };
  });
  const job = await store.read(
    async (tx) => (await tx.list("ScheduledJob", { key: JOB_KEY }))[0],
  );
  return {
    ...result,
    summary,
    page,
    pages: Math.max(1, Math.ceil(result.total / limit)),
    serverTime: now.toISOString(),
    automation: {
      ...policy(env, now),
      lastStartedAt: job?.lastStartedAt || null,
      lastCompletedAt: job?.lastCompletedAt || null,
      deletedCount: job?.deletedCount || 0,
      failedCount: job?.failedCount || 0,
      lastError: job?.lastError || "",
    },
  };
}

async function clearBill(
  kind,
  id,
  {
    user,
    source = "manual",
    now = new Date(),
    env = process.env,
    leaseOwner,
    confirmation,
  } = {},
) {
  const model = modelFor(kind);
  assert(mongoose.isObjectIdOrHexString(id), "Invalid bill ID");
  id = new mongoose.Types.ObjectId(String(id)).toHexString();
  assert(
    source === "automatic" || user?.role === "admin",
    "Administrator access required",
    403,
  );
  assert(policy(env, now).enabled, policy(env, now).reason, 409);
  assert(["manual", "automatic"].includes(source), "Invalid deletion source");
  return store.transaction(async (tx) => {
    if (source === "automatic") {
      assert(leaseOwner, "A scheduled-job lease is required", 409);
      const job = (
        await tx.list("ScheduledJob", { key: JOB_KEY, leaseOwner })
      )[0];
      assert(
        job && stamp(job.leaseUntil) > now.valueOf(),
        "Scheduled-job lease expired",
        409,
      );
    }
    const bill = await tx.get(model, id);
    if (source === "manual")
      assert(
        confirmation === bill.number,
        "Bill confirmation does not match the selected bill",
        409,
      );
    if (bill.clearedAt)
      return { deleted: false, bill: billView(kind, bill, now) };
    assert(
      eligible(bill, now),
      "This bill has not completed five full days since creation",
      409,
    );
    const snapshot = clone(bill);
    const cutoff = new Date(now.valueOf() - RETENTION);
    // This conditional update is scoped to ONE ID, with the age checked again
    // inside the same atomic operation that marks it deleted.
    const updated = await tx.updateIf(
      model,
      {
        _id: id,
        clearedAt: null,
        createdAt: {
          $gt: tx.data ? new Date(0).toISOString() : new Date(0),
          $lte: tx.data ? cutoff.toISOString() : cutoff,
        },
      },
      {
        clearedAt: now,
        ...(user ? { clearedBy: user._id } : {}),
        clearSource: source,
      },
    );
    assert(updated, "The bill changed. Refresh and try again", 409);
    const archive = await tx.insert("BillClearArchive", {
      billKey: `${kind}:${id}`,
      kind,
      billId: id,
      number: bill.number,
      billCreatedAt: bill.createdAt,
      deletedAt: now,
      source,
      ...(user ? { deletedBy: user._id } : {}),
      snapshot,
      checksum: checksum(snapshot),
    });
    assert(
      checksum(clone(archive.snapshot)) === archive.checksum,
      "Bill backup verification failed",
      500,
    );
    await store.audit(tx, user, "bill.clear", model, id, {
      source,
      archive: String(archive._id),
      checksum: archive.checksum,
    });
    return { deleted: true, bill: billView(kind, updated, now) };
  });
}
async function backup(kind, id) {
  modelFor(kind);
  return store.read(async (tx) => {
    const archive = (
      await tx.list("BillClearArchive", { billKey: `${kind}:${id}` })
    )[0];
    assert(archive, "Bill backup not found", 404);
    assert(
      checksum(archive.snapshot) === archive.checksum,
      "Bill backup verification failed",
      500,
    );
    return {
      kind,
      billId: String(archive.billId),
      number: archive.number,
      deletedAt: archive.deletedAt,
      checksum: archive.checksum,
      snapshot: archive.snapshot,
    };
  });
}

async function acquireLease(owner, now) {
  try {
    return await store.transaction(async (tx) => {
      let job = (await tx.list("ScheduledJob", { key: JOB_KEY }))[0];
      if (!job) job = await tx.insert("ScheduledJob", { key: JOB_KEY });
      if (stamp(job.leaseUntil) > now.valueOf()) return null;
      return tx.updateIf(
        "ScheduledJob",
        {
          _id: job._id,
          leaseUntil: { $lte: tx.data ? now.toISOString() : now },
        },
        {
          leaseOwner: owner,
          leaseUntil: new Date(now.valueOf() + LEASE_TIME),
          lastStartedAt: now,
        },
      );
    });
  } catch (error) {
    // Two fresh instances may race to create the singleton job document.
    if (error.code === 11000) return null;
    throw error;
  }
}
async function runSweep({
  clock = () => new Date(),
  env = process.env,
  logger = console,
  batchSize = 100,
} = {}) {
  if (!policy(env, clock()).enabled)
    return { skipped: "disabled", deleted: 0, failed: 0 };
  const owner = crypto.randomUUID();
  const job = await acquireLease(owner, clock());
  if (!job) return { skipped: "locked", deleted: 0, failed: 0 };
  let deleted = 0,
    failed = 0,
    lastError = "";
  try {
    const now = clock();
    const candidates = await store.read(async (tx) => {
      const rows = [];
      for (const [kind, model] of Object.entries(kinds)) {
        const bills = tx.data
          ? (await tx.list(model)).filter((bill) => eligible(bill, now))
          : await models[model]
              .find(statusFilter("eligible", now))
              .select("_id createdAt")
              .sort({ createdAt: 1, _id: 1 })
              .limit(batchSize)
              .lean();
        rows.push(
          ...bills.map((bill) => ({
            kind,
            id: String(bill._id),
            createdAt: bill.createdAt,
          })),
        );
      }
      return rows
        .sort((a, b) => stamp(a.createdAt) - stamp(b.createdAt))
        .slice(0, batchSize);
    });
    for (const bill of candidates) {
      // Extend the durable lease before each bill; a stopped process's lease
      // expires, and another instance/restart can safely resume the backlog.
      const checkTime = clock();
      const renewed = await store.transaction((tx) =>
        tx.updateIf(
          "ScheduledJob",
          {
            _id: job._id,
            leaseOwner: owner,
            leaseUntil: { $gt: tx.data ? checkTime.toISOString() : checkTime },
          },
          { leaseUntil: new Date(checkTime.valueOf() + LEASE_TIME) },
        ),
      );
      if (!renewed) throw new Error("Scheduled-job lease lost");
      try {
        const result = await clearBill(bill.kind, bill.id, {
          source: "automatic",
          now: clock(),
          env,
          leaseOwner: owner,
        });
        if (result.deleted) deleted++;
      } catch (error) {
        failed++;
        lastError =
          "A bill could not be cleared. Check server logs; the next scan will retry.";
        logger.error("[bill-clear] bill failed", {
          kind: bill.kind,
          id: bill.id,
          code: error.code || error.status || "error",
          message: String(error.message).slice(0, 500),
        });
      }
    }
    logger.info("[bill-clear] scan completed", { deleted, failed });
    return { deleted, failed };
  } catch (error) {
    failed++;
    lastError =
      "The deletion scan failed. Check server logs; the next scan will retry.";
    throw error;
  } finally {
    await store.transaction((tx) =>
      tx.updateIf(
        "ScheduledJob",
        { _id: job._id, leaseOwner: owner },
        {
          leaseUntil: new Date(0),
          lastCompletedAt: clock(),
          deletedCount: deleted,
          failedCount: failed,
          lastError,
        },
      ),
    );
  }
}
function startScheduler({
  clock = () => new Date(),
  env = process.env,
  logger = console,
  interval = SCAN_INTERVAL,
} = {}) {
  let pending = null;
  const tick = () => {
    if (!pending)
      pending = runSweep({ clock, env, logger })
        .catch((error) =>
          logger.error("[bill-clear] scan failed", {
            code: error.code || error.status || "error",
            message: String(error.message).slice(0, 500),
          }),
        )
        .finally(() => {
          pending = null;
        });
    return pending;
  };
  // Catch up immediately after every restart, then scan once a minute.
  const ready = tick();
  const timer = setInterval(tick, interval);
  timer.unref?.();
  return {
    ready,
    stop: async () => {
      clearInterval(timer);
      await pending;
    },
  };
}
module.exports = {
  DAY,
  RETENTION,
  JOB_KEY,
  policy,
  eligible,
  listBills,
  clearBill,
  backup,
  runSweep,
  startScheduler,
};
