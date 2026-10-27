# Harish Computer Shop

A MongoDB-backed billing and inventory workspace, added alongside the existing public shop website. The original folder names and public pages are retained.

| Location | Application |
|---|---|
| `/` | Existing public shop website |
| `/app/login` | Administrator sign-in |
| `/app` | Authorized shop workspace |

## Windows setup

Install Node.js 24 and MongoDB Community Server, or use a MongoDB Atlas connection string. This implementation was tested with Node 24 and MongoDB 8.2. Run the following in PowerShell from this project directory:

```powershell
.\scripts\setup.ps1
```

The script installs the locked dependencies, creates an ignored backend `.env` with a cryptographically random JWT secret, and copies the frontend environment template. It preserves existing environment files. If PowerShell blocks scripts, allow them for this terminal only with `Set-ExecutionPolicy -Scope Process Bypass`.

Set `MONGODB_URI` in `Harish computer backend/.env`. The default is `mongodb://127.0.0.1:27017/harish_shop`. Start your existing MongoDB service, or start a separate local instance using the installed binary:

```powershell
.\scripts\start-mongo.ps1
# For another installation path:
# .\scripts\start-mongo.ps1 -MongoBinary 'C:\your-path\mongod.exe'
```

This starts MongoDB in the background, bound to loopback, with persistent data under `.runtime/mongo`. It does not replace an existing database service. Its process ID is recorded in `.runtime/mongo.pid`; its log is `.runtime/mongo.log`. Keep this data directory outside any source-control or cloud-file synchronization process in a real deployment.

After starting the backend and frontend below, open `/app/login` and click **Create admin account**. Enter your name, email, password, and password confirmation. Your account is saved to MongoDB and you enter the workspace automatically. This first-account form is available only locally in development and disappears permanently after initialization. Only administrator accounts can sign in. Staff login, staff sessions, and staff management endpoints have been removed; historical user records are retained.

Alternatively, create an administrator from the terminal using the hidden password prompt (also the initialization method for production):

```powershell
.\scripts\create-admin.ps1
```

The initializer asks for your name and email. Passwords require at least 12 characters, uppercase, lowercase, and a number, with a maximum of 72 UTF-8 bytes. No default administrator or password is shipped. Duplicate account emails are rejected.

Start the backend in one terminal:

```powershell
Set-Location 'Harish computer backend'
npm run dev
```

Start the frontend in a second terminal, starting from the project directory:

```powershell
Set-Location 'Harish computer frontend'
npm run dev -- --port 5173 --strictPort
```

Open **http://localhost:5173/app/login**. Use **Create admin account** on the first local visit, or select Admin login if an account already exists. The API listens on port **4000**. Frontend requests use Vite's `/api` proxy. Production uses the same-origin `/api` path behind a reverse proxy. For another development API target, set `API_TARGET` in the terminal before starting Vite. `VITE_API_URL` is the complete API base, including `/api`.

## First-use workflow

1. Sign in as admin and enter the shop address, phone, GSTIN, invoice prefixes, and policies in Shop settings.
2. Add categories and brands.
3. Add products and any opening physical stock. Supplier selection still uses existing supplier records. Opening stock immediately creates a stock movement.
4. Review stock reconciliation and the movement ledger in Stock & inventory. Use authorized stock adjustments or physical counts for corrections.
5. Review stock alerts and search products by name, SKU, or barcode.
6. Manage your password from Your profile and sign out when finished.

The workspace has a single **Admin login** form. Non-admin credentials and previously issued staff sessions are rejected by the backend. Staff panel navigation, routes, and staff-management APIs have been removed. Legacy staff users and their historical invoice/audit references remain stored without granting access.

The Sell workspace exposes the point-of-sale form, searchable sales history, saved invoice detail, payment collection, returns, and controlled cancellation. Other purchasing, customer/supplier management, payments, expenses, general reports, and staff-management screens remain absent from Admin Panel navigation. Their frontend URLs show **Page not found** to administrators. Existing related APIs remain protected and accessible to authenticated administrators. No historical invoices, purchases, customer/supplier data, or collections were deleted.

## Implemented functionality

The list below includes retained backend capabilities. The frontend exposes the admin screens listed above; all protected APIs now require an active administrator session.

- React/Vite, Tailwind integration, React Router, Axios, Lucide icons, responsive navigation, toast notifications, accessible forms, confirmations, and empty/loading/error states.
- JWT authentication in HTTP-only cookies, bcrypt password hashing, session revocation, password changes, backend role and permission checks, CORS/origin checks, security headers, and rate limits.
- Product create/edit/detail/deactivation; unique SKU/barcode validation; categories, brands, suppliers, customers; stock search, filtering, sorting, and pagination. Products and historic invoices are never permanently deleted through the API.
- Purchase and sales invoices with multiple lines, server-calculated discounts/tax/totals, invoice sequences, partial/full payments, named credit accounts, supplier credit, cash change, searchable sales history, warranty expiry tracking, A4 PDF download, printing, WhatsApp message prefill, and SMTP email delivery with recorded attempts.
- Admin-only Service Center with conditional Receive Shop / Receive Customer forms, required problem/solution rules, MongoDB-backed service bills, unique service numbers, server-calculated pending payments, searchable/editable history, printable PDF downloads, WhatsApp message prefill, and SMTP email delivery tracking.
- Stock movements for opening quantities, committed purchases/sales, adjustments, returns, and count discrepancies. Insufficient stock and negative adjustments are rejected.
- Purchase and sales returns, refund records, controlled cancellation, linked replacement/exchange invoices, and request-key protection against duplicate invoice, return, payment, and adjustment submissions.
- Current low/out-of-stock alerts, reorder suggestions, last purchase dates, inventory valuation, stock by category, movement history, ledger reconciliation, draft physical counts, discrepancy reasons, and authorization before applying counts. Stale counts are rejected.
- Customer/supplier account histories and balances, opening-balance settlements, expenses, payments, immutable application audit logs, shop settings, and profile.
- Dashboard totals and actual seven-day activity; date-filtered sales/purchases, product/category/customer/supplier reports, payment collections, returns, inventory, movements, and gross/net profit. CSV export escapes spreadsheet formula cells. Reports and invoices support browser printing.
- Public enquiries now persist to MongoDB rather than being logged to the console.

Invoice email delivery is optional and requires backend-only `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` settings. Without SMTP configuration, sales continue to save normally and email attempts are recorded as failed with an actionable status.
Service Center bill email uses the same optional SMTP settings. A solution is stored and shared only for **Receive Customer** service; Receive Shop submissions discard it.

## Integrity and costing

Every invoice, stock movement, account balance change, payment, sequence allocation, and audit entry for an operation is committed together. Reusing an invoice request key with different data is rejected. Completed invoice values cannot be edited or permanently deleted through the API; the controlled Bill Clear workflow can hide eligible bills while retaining their ledger records and recovery snapshots. Product names, SKUs, line values, costs, customer/supplier details, and shop details are snapshotted on the invoice so later edits cannot change the original receipt.

Quantities are whole units. Money is rounded to two decimals at defined line boundaries; total and rate limits prevent unsupported numeric precision. Sales use each product's configured GST rate. Administrators can enter a validated alternate selling rate. Discounts are absolute line amounts, bounded by line value. Totals sent by the frontend are ignored. Purchase rates and GST rates are explicitly entered and validated server-side.

Cost uses the weighted average of opening inventory and received purchase line value after discounts, excluding GST. Sales capture the current weighted cost. Sales returns restore original invoice cost and reverse original profit. Purchase returns remove original purchase cost; returns that would create a negative remaining inventory value are rejected for reconciliation. Other invoice charges are tracked separately and excluded from line gross profit and inventory costing. GST is treated as recoverable/pass-through; this application does not determine tax eligibility.

Gross profit is net line sales excluding GST, less allocated inventory cost, minus returned profit. Net profit additionally subtracts recorded shop expenses. Opening receivables/payables and their settlements do not create current-period sales/profit. Sale reports retain original invoice values and return/status fields; grouped sales and profit reports explicitly subtract returns in the selected period.

### MongoDB storage modes

- **Replica set / Atlas:** related Mongoose collections with native multi-document transactions, snapshot transaction reads, majority writes, uniqueness indexes, and transaction retries.
- **Standalone MongoDB:** one durable `StandaloneLedger` document stores the validated shop aggregate. Mutations use revision-based compare-and-swap. Concurrent conflicts retry from a fresh snapshot. A failed request cannot leave a half-written invoice, stock change, or payment. This mode is intentionally capped at **12 MiB** to leave room below MongoDB's document limit, and suits small installations. It refuses additional writes when full rather than splitting a transaction. `/api/health` reports the active mode.

Use a replica set for production growth. MongoDB standalone deployments do not support multi-document transactions; see [MongoDB transaction considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/) and [Mongoose transactions](https://mongoosejs.com/docs/transactions.html).

To migrate an existing standalone ledger, stop the API, take a verified backup, convert MongoDB to a replica set using MongoDB's documented procedure, then run `npm run migrate:standalone` in the backend before restarting it. The script copies the aggregate into empty related collections in a single transaction and refuses populated target collections. It retains the original aggregate as a recovery copy. Do not change database topology without this migration when standalone data already exists.

## Verification

```powershell
Set-Location 'Harish computer backend'
npm test
npm run test:http
Set-Location '..\Harish computer frontend'
npm test
npm run build
```

Backend tests start isolated real MongoDB processes, once as a replica set and once as a standalone server. They never connect to `MONGODB_URI` or seed shop production records. On Windows they reuse the installed MongoDB 8.2 binary when available; otherwise the test utility may download a compatible binary. Override the executable with `$env:MONGOMS_SYSTEM_BINARY = 'C:\path\mongod.exe'`.

The suite covers admin authentication, rejection of staff credentials and sessions, removed staff endpoints, products, purchase/sale stock changes, concurrent overselling, duplicate/concurrent submissions, insufficient stock, tax and profit calculations, fractional returns, refunds, account payments, low-stock alerts, manual adjustments, physical counts, stale snapshots, rollback after an injected failure, cancellations, exchanges, and session revocation. Frontend tests use isolated API fixtures with a DOM test environment for admin-only sign-in, rejected legacy staff sessions, removed admin routes and navigation, remaining admin features, CSV safety, and session expiry. `test:http` starts the actual API and Vite against a separate MongoDB instance, checks frontend serving and the proxy/API/database health, initializes an isolated admin, and exercises purchase, sale, retry, return, and reconciliation requests through that proxy, then closes its own processes. See [verification results](docs/VERIFICATION.md).

Visual browser inspection and physical A4/thermal printer output must still be checked in the target environment. The in-app browser tool was unable to initialize in this coding session; DOM tests do not establish pixel layout or printer compatibility.

## Deployment and operations

Bill Clear adds admin-only, recoverable deletion after five complete days from each bill's actual creation timestamp. It is paused by default. See [Bill Clear rules, backup verification and activation](docs/BILL_CLEAR.md) before enabling it on a production database. Financial ledger records remain intact.

See [deployment, backup, and restore](docs/DEPLOYMENT.md) and [API documentation](docs/API.md).

This project is maintained as one repository: [Mukeshy5/Harish-Computer-shop](https://github.com/Mukeshy5/Harish-Computer-shop). It includes `Harish computer frontend`, `Harish computer backend`, documentation, and setup scripts as regular source folders. Install and deploy each application from its own folder. Local `.env` files, dependencies, database files, and backups are excluded from Git; use the supplied `.env.example` templates when setting up a fresh clone.

Reports and list filtering currently materialize their matching shop records in server memory. For very large histories, add database-level pagination/aggregation and streaming exports before scaling. Images/logos are optional URL fields. Printed receipts use the browser print dialog; there is no printer-driver integration. The app records payment/refund events; it does not execute bank transfers or payment-gateway refunds.
