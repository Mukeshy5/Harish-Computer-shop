# Verification record

## Admin-only login — 24 October 2026

| Check | Result |
|---|---|
| Frontend interaction and calculation suite | 68 / 68 passed |
| Backend workflow and first-admin suites, both storage modes | 108 / 108 passed |
| Frontend production build | Passed |
| Frontend lint | Exit 0; 16 existing warnings |

The login page now has one Admin login form. Staff selectors, navigation, routes, and dashboard branches are removed. Both session restoration and sign-in responses must contain an administrator before the frontend opens the workspace. Tests cover the legacy staff query parameter, staff responses, and legacy staff sessions at the dashboard, settings, billing, purchase, and contact URLs. All remaining admin page render and interaction checks pass.

Backend login accepts active administrator accounts only, including when no panel parameter is supplied. Requests selecting the old staff panel are rejected. Every protected request reloads the stored user and requires an active admin role and matching token version, so staff cookies issued before this change are immediately unusable. Tests verify rejection of staff credentials with all former permission flags, rejection of signed legacy staff JWTs, and absence of a new session cookie after failed login.

Staff list/create/edit/status endpoints return 404 for authenticated administrators. Tests verify these requests leave existing users unchanged. Legacy staff roles and permission fields remain in the database schema to preserve historical user, invoice, and audit references; they do not grant login or API access. Billing/product/inventory APIs and records are preserved. Admin setup, password changes, logout, inactive-account rejection, origin protection, inventory changes, invoice totals, returns, and record preservation pass backend integration tests in replica-set and standalone modes.

All database tests used disposable MongoDB instances. The live shop database was not accessed or migrated, and no existing users or historical billing data were deleted. Visual browser inspection remains unavailable because of the previously recorded browser initialization failure; this change was validated through DOM tests, backend HTTP integration tests, lint, and production build.

## Earlier Admin Panel module removal — 24 October 2026

| Check | Result |
|---|---|
| Frontend interaction and calculation suite | 84 / 84 passed |
| Backend workflow and first-admin suites, both storage modes | 104 / 104 passed |
| Frontend production build | Passed |
| Frontend lint | Exit 0; 16 existing warnings |

Regression checks cover all nine removed Admin Panel navigation items, empty and populated dashboards, 22 old admin URLs (including detail/new URLs, nested paths, query strings, and case variation), and all 12 retained admin page routes. Removed admin pages render **Page not found** without fetching module records. The retained page render checks report no React console errors in the DOM environment.

Interaction tests cover product creation/editing and supplier selection, inventory valuation and movement tabs, stock adjustments, physical count creation/review/application, category/brand creation and edits, settings, profile password changes, product search, navigation open/close, admin/staff login, logout, session expiry, and unauthenticated access. Shared staff coverage includes checkout, credit permission, inline contact creation, customer/supplier editing permissions, delegated purchase entry/history, saved invoice details, receipt selection/printing, and retry keys.

Only frontend navigation, routing, the dashboard, and now-unused admin resource/report UI were changed. Shared billing components, inventory/product components, authentication/API hooks, responsive styles, backend source, and database schemas remain unchanged. The backend tests start their own disposable MongoDB servers; the live shop database was not accessed, migrated, or deleted. No historical invoices, purchases, customers, suppliers, or payments were changed.

The in-app Browser could not initialize because of an environment metadata error. Responsive CSS was preserved and navigation interactions passed DOM checks; real viewport layout, browser-console/network inspection, and physical printing were not verified. The HTTP smoke and dependency-audit results below belong to the earlier implementation and were not rerun for this change.

## Earlier implementation verification

Verified during implementation on Windows with Node 24.19.0 and the installed MongoDB 8.2 executable. Fixtures run in separate disposable test databases; no production admin, catalog, invoice, or other dummy records were created.

| Check | Result |
|---|---|
| Backend workflow suite, replica set | 42 / 42 passed |
| Backend workflow suite, standalone atomic storage | 42 / 42 passed |
| First-admin setup suite, replica set | 10 / 10 passed |
| First-admin setup suite, standalone atomic storage | 10 / 10 passed |
| Frontend interaction/calculation suite | 20 / 20 passed |
| Actual API + Vite + MongoDB HTTP smoke | Passed |
| Frontend production build | Passed |
| Backend dependency audit following removal of nodemon | 0 known vulnerabilities |
| Frontend dependency installation audit | 0 known vulnerabilities |

The backend suite covers concurrent attempts to sell the last unit, concurrent duplicate invoices, rejected insufficient-stock requests, rollback after a stock write followed by an injected failure, fractional return rounding, purchase returns after goods sold, duplicate return key reuse, credit balances, opening-balance settlements, delegated permissions, password/session revocation, and inventory reconciliation.

Additional billing checks cover saved contact/type/model/guarantee/warranty snapshots, invalid coverage/contact rejection, mixed-GST bill-discount allocation, exact paise rounding, pending payments and partial/full reversals, discounted purchase valuation, and explicit one-invoice admin credit approval. Frontend tests cover these form fields, inline contact creation, saved invoice display, and developer footer links. A deterministic calculation test compares client and server results over 150 mixed-tax invoice combinations.

Replica-set test processes use a 16 MiB oplog and a 16 MiB index-build disk reserve for their small disposable fixtures. This resolved a test startup failure on the low-space development machine without changing the shop database's configuration. The reserve is a [documented MongoDB test-process parameter](https://www.mongodb.com/docs/manual/reference/parameters/#mongodb-parameter-param.indexBuildMinAvailableDiskSpaceMB).

The first-admin suite checks credential validation, password hashing, automatic sign-in, existing/inactive admin lockout, concurrent initialization, rollback of failed setup, the permanent setup claim, UTF-8 password limits, production lockout, and the loopback socket boundary in both storage modes.

The frontend suite covers first-admin creation and password confirmation, admin/staff sign-in behavior, role-protected navigation, product details and creation, POS totals and confirmation, request-key retention after timeout, receipt format/print invocation, authorized return entry, and CSV formula neutralization. These are DOM tests using isolated API fixtures, with backend integration tested separately against real MongoDB.

The HTTP smoke check launches the actual Express entrypoint and Vite, confirms `/`, `/app/login`, and `/app/pos` serve the application, checks `/api/health` through Vite reaches MongoDB, and verifies a protected product request returns 401. It then runs the controlled admin initializer with random credentials in the isolated database, signs in through the frontend proxy, verifies the HTTP-only session, receives a purchase, checks weighted average cost, saves a sale, retries its request key, rejects insufficient stock, records a return, and checks the stock ledger reconciles. It closes only the processes it starts.

Visual browser inspection could not run because the available Browser tool failed to initialize with an environment metadata error. No screenshot, pixel layout, real browser end-to-end checkout, or physical printer verification is claimed. A4 and 80mm styles and print invocation are implemented; verify them with the shop's printer/driver before deployment.

Deployment, credentials, production database configuration, and real shop data remain user-controlled. See the root README for runnable Windows commands and current scale/printing limits.


## Product and shared print header verification

The final implementation passed 89 frontend tests and 139 backend tests, the production frontend build, and the HTTP smoke check using disposable MongoDB databases. Lint completed with no errors and 11 existing React warnings. Checks cover product validation and duplicate request handling, shared shop details in invoice and service responses, HTML print content, generated PDF headers and pagination, and existing billing/inventory workflows. No live database records were changed. Visual browser print previews and physical printer output remain unverified because the in-app Browser could not initialize.
