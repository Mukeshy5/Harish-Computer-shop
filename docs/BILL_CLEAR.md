# Bill Clear operations and recovery

Bill Clear covers Sales, Purchase and Service Center bills. Access is restricted to authenticated, active administrators. It is **paused by default**; this change does not enable deletion on the production database or modify local/hosted secrets.

## Deletion rules

- The retention window is exactly **120 hours** from the stored `createdAt` timestamp. Editable invoice `date`, calendar-day boundaries, browser time and frontend-supplied age are not used.
- Both manual and automatic deletion require five complete days. Missing, invalid or future creation timestamps never become eligible automatically. There is no bulk delete endpoint or under-age override.
- Each deletion uses the selected bill kind and canonical ObjectId. The conditional database update checks that same ID, `clearedAt: null` and `createdAt <= now - 120 hours` again inside the transaction. Manual requests must also confirm the selected bill number.
- Deletion is **logical/recoverable**: `clearedAt`, `clearSource` and optional admin ID mark the original bill. Normal Sales/Purchase/Service Center history and the dashboard's recent bills omit it. Bill Clear's Deleted filter retains its identity, timestamps and backup download.
- The complete pre-deletion bill snapshot, SHA-256 checksum and audit entry commit atomically with deletion. A failed snapshot/validation/audit write rolls back deletion. A unique `billKey` and transactional update prevent duplicate archives and audit entries on retries or competing requests.
- Original ledger records, payments/refunds, return links, customer/supplier balances, product quantities, costing, invoice sequences, warranty history and exchange references are retained. Financial reports continue counting the original business transaction exactly once. The archive collection is never included in reports. Clearing a bill does not cancel a sale, reverse GST, refund a payment or restore stock. Outstanding balances can still be settled against the original accounting ID.

Logical deletion intentionally does not reclaim database space. In standalone mode, bill snapshots count towards the existing 12 MiB aggregate limit; exceeding it safely rolls back the operation. Use a replica set for growing histories. Do not add TTL indexes or run `deleteMany` against bill/ledger collections.

## Scheduling and restart behavior

The persistent API starts a catch-up scan immediately after its MongoDB connection, then checks every minute. Each scan handles at most 100 oldest eligible bills; a large backlog drains over successive scans. It recalculates each bill's eligibility when deleting it. A database-backed singleton lease prevents competing API processes, an external job and manual requests from creating duplicate deletions. The lease is renewed before each bill; a crashed process's lease expires within two minutes. The next process/startup/scan retries remaining eligible bills. Failed bills stay eligible and retry on later scans. Counts, last scan timestamps and a safe error summary persist in `ScheduledJob`; server logs identify failed bill IDs and errors without logging snapshots.

Use an always-running backend supervised by the hosting platform. A process that is stopped or asleep cannot execute a timer: startup catches up when it resumes. If the host suspends the API, configure a separate scheduled worker every minute to run `npm run bill-clear:run` from the backend directory with the same database/secrets and activation configuration. It uses the same durable lease and rules. This repository does not provision or activate a hosted cron service.

`npm run bill-clear:preview` lists eligible bill metadata and counts without clearing bills, creating archives or acquiring a job lease. It still connects using the normal storage initializer; use a staging database for first verification. `npm run bill-clear:run` performs one bounded scan only when all activation conditions are satisfied.

## Verify backup and rules before production activation

1. Leave `BILL_CLEAR_ENABLED=false`. Take a consistent full database backup using the procedure in [DEPLOYMENT.md](DEPLOYMENT.md#backups), including every collection (or the full `StandaloneLedger` aggregate). Store an encrypted recovery copy outside the source checkout/web root and database host, with restricted access and a documented retention policy. The per-bill snapshot is an additional recovery aid, **not a replacement for an independent database backup**.
2. Restore that backup into a separate staging database. Verify inventory reconciliation, account balances, invoice/payment/return counts and totals. Record the backup/snapshot ID and successful restore-verification timestamp. Do not restore over production during this check.
3. Run `npm test` in the backend and frontend, `npm run build` in the frontend, and `npm run bill-clear:preview` against the staging database. Confirm eligible IDs against actual `createdAt`, including four-day and just-under-five-day bills. Staging tests cover exact five-day eligibility, selected-ID deletion, concurrent jobs/requests, financial integrity, backup rollback and scheduler restart after a database reconnect.
4. In staging first, set all three backend environment values below. They are operator attestations of a completed backup/restore check, not an automatic verification of an external backup file. A missing reference, invalid/future timestamp or disabled flag prevents **both** manual and automatic deletion.

```dotenv
BILL_CLEAR_ENABLED=true
BILL_CLEAR_BACKUP_REFERENCE=<verified external backup or snapshot ID>
BILL_CLEAR_BACKUP_VERIFIED_AT=<actual restore-verification time in ISO 8601 UTC>
```

5. Inspect a cleared bill's Deleted status and downloaded backup checksum, retry its deletion, restart the staging server and verify only independently eligible IDs change. Retain the staging verification record. Only then configure those values on production and restart/redeploy the API. Startup begins processing already eligible bills immediately, at most 100 per scan. Deployment approval/activation is a separate operational action; it has not been performed by implementing this feature.
6. Monitor the Bill Clear status card and server logs. To pause deletion, set `BILL_CLEAR_ENABLED=false` and restart every API/worker process. Keep verified full backups on a recurring schedule. Do not erase recovery archives or old accounting records.

## Recovery

For one bill, an admin can download its pre-deletion JSON snapshot from Bill Clear's Deleted filter. Verify its SHA-256 checksum against the compact JSON representation of `snapshot`. The original accounting record still exists under the same ID; clearing is not a financial reversal.

For a mistaken clear, pause **all** deletion workers first, take another full backup, and review the original record and snapshot on staging. An operator can restore visibility by removing only that record's clearing metadata in a reviewed transaction while recording a recovery audit entry; preserve subsequent payment/return changes rather than replacing the current financial record with an older snapshot. There is intentionally no automatic hard purge or unreviewed restore endpoint. Re-enabling the five-day job would make that old bill eligible again, so resolve the retention policy before resuming.

For database loss, restore the complete consistent external backup according to [DEPLOYMENT.md](DEPLOYMENT.md#backups). Keep deletion disabled until restored ledger integrity has been checked.

## API

- `GET /api/bill-clear?q=&kind=sale|purchase|service&status=pending|eligible|deleted&page=1&limit=20`: paginated metadata, status counts, server time and scheduler/activation status. Empty kind/status includes all. Native MongoDB mode projects metadata and pages each source; it does not load full invoice lines.
- `DELETE /api/bill-clear/:kind/:id`, JSON `{ "confirmNumber": "HCS-000001" }`: admin-only, exact-ID, eligible-only, idempotent logical deletion. `409` for an under-age bill, paused configuration or mismatched confirmation; `400` for invalid kinds/IDs; `404` for missing bills.
- `GET /api/bill-clear/:kind/:id/backup`: admin-only checksum-verified JSON attachment for a deleted bill. No snapshots are exposed through list endpoints.
