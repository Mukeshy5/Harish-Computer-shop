# HTTP API

Base: `/api`. JSON requests/responses. A successful create returns `201`, reads/updates return `200`, validation errors `400`, unauthenticated requests `401`, unauthorized requests `403`, missing records `404`, uniqueness/stock/concurrency conflicts `409`. Deliberate standalone-capacity exhaustion returns `507`. Errors have `{ "error": { "message": "..." }, "message": "..." }`.

Login sets an HTTP-only `hcs_session` JWT cookie with an eight-hour expiry. In production it is Secure; use HTTPS and a same-origin reverse proxy. Send cookies with subsequent requests (`credentials: include`). Initial admin setup is available only over a loopback socket in development, before an administrator or setup claim exists. It is closed in production and after initialization. Logout and password change revoke prior sessions using the user's token version. Only active administrators can authenticate. Non-admin credentials and all existing staff JWTs are rejected; no database migration or deletion is required.

List endpoints return `{ data, total, page, pages }`. Supported common query parameters: `q`, `page` (default 1), `limit` (1–100, default 20), `from`, `to`, `sort`, `order=asc|desc`. Product filters also include `active=true|false` and `category=<id>`; invoice lists accept `party=<id>` and `status`. Date-only report filters use Asia/Kolkata day boundaries. Reports return all matching rows in `{ data }`; inventory is a current snapshot rather than a date-limited balance.
The sales list additionally accepts `paymentStatus=paid|partial|unpaid`; its `q` search covers invoice number, customer name, mobile, and email.

## Authentication and permissions

| Method | Route | Body / result |
|---|---|---|
| POST | `/auth/login` | `email, password`; optional legacy `panel: admin` is accepted; `panel: staff` is rejected; returns admin `user` |
| GET | `/auth/setup-status` | Returns `canCreateAdmin` with caching disabled |
| POST | `/auth/setup` | Local development only: first administrator `name, email, password`; returns `user` and signs in |
| GET | `/auth/me` | Current administrator |
| POST | `/auth/logout` | Revoke current user's sessions |
| POST | `/auth/change-password` | `currentPassword, password`; invalidates sessions |
| GET | `/health` | Public readiness and storage mode |
| POST | `/enquiries` | Public validated `name, contact, message` |

Initial setup hashes the password, creates the admin and shop settings, and records an audit event in one atomic operation. A unique setup claim allows only one concurrent initialization to succeed. Existing inactive admins also close this flow; it is not a password-reset endpoint. Production initialization continues to use the controlled terminal script.

All protected endpoints require an active administrator session, checked against the current stored user role on every request. The frontend accepts admin sessions only. Existing staff records and their historical references remain stored, but permissions cannot grant login or API access. Staff creation/list/edit/status endpoints have been removed.

## Products and reference records

| Method | Route | Access |
|---|---|---|
| GET | `/products`, `/products/:id` | Admin |
| POST | `/products` | Admin |
| PATCH | `/products/:id`, `/products/:id/status` | Admin |
| GET | `/categories`, `/brands`, `/customers`, `/suppliers` | Admin |
| POST / PATCH | `/categories`, `/brands`, `/:id` | Admin |
| POST / PATCH | `/customers`, `/suppliers`, `/:id` | Admin |
| GET | `/customers/:id/history`, `/suppliers/:id/history` | Admin |
| POST | `/customers/:id/payments`, `/suppliers/:id/payments` | Admin; settle opening balance |

Product body: `name, sku, barcode?, category?, brand?, supplier?, description?, purchasePrice, sellingPrice, openingStock?, minStock?, unit?, taxRate?, image?, active?`. Empty optional references are allowed. Opening stock is used only on creation. Direct changes to `stock`, `openingStock`, and `averageCost` through product edits are ignored; use adjustments or counts. SKU is trimmed/uppercased and unique. Barcode is unique when present. Products are deactivated, not deleted. `status` body: `{ "active": false }`.

Contact creation supports `name, phone, address, gstin, openingBalance` (admin only). Suppliers also support `contactPerson, email`. Opening balances cannot be edited silently. Settlement body: `amount, method, reference?`, bounded by the uncollected/unpaid opening balance. Use invoice payment routes for invoice dues. History returns `party, invoices, payments, totalPurchases`.

## Billing and payments

Bill Clear is an additional admin-only workflow; normal bill lists exclude logically cleared bills. Financial reports and accounting references retain the original transaction. See [Bill Clear API, five-day eligibility and activation rules](BILL_CLEAR.md#api). Deletion is paused by default until backup/restore verification and server activation.

Use a new `Idempotency-Key` header (UUID recommended) for each intended create/payment/return/adjustment operation. Retain exactly the same key and body after a timeout; changing the body requires a new key. Successful duplicate requests return the previously committed record and do not change stock/balances again.

| Method | Route | Purpose |
|---|---|---|
| GET / POST | `/sales`, `/purchases` | History / create invoice |
| GET | `/sales/:id`, `/purchases/:id` | Invoice with payment and return history |
| GET | `/sales/:id/invoice` | Download the saved sales invoice as a PDF |
| POST | `/sales/:id/send-email` | Send the saved invoice PDF to the customer |
| POST | `/sales/:id/payments`, `/purchases/:id/payments` | Record partial/final payment |
| POST | `/sales/:id/returns`, `/purchases/:id/returns` | Admin item return |
| POST | `/sales/:id/cancel`, `/purchases/:id/cancel` | Admin remaining-item reversal |
| GET | `/payments` | Admin payment/refund history |

Example sale:

```json
{
  "partyName": "Customer Name",
  "partyPhone": "9876543210",
  "partyEmail": "customer@example.com",
  "party": "customer-object-id",
  "lines": [
    { "product": "product-object-id", "quantity": 2, "rate": 300, "discount": 20 }
  ],
  "charges": 0,
  "paid": 684.4,
  "method": "upi",
  "notes": "Optional note"
}
```

The example assumes a product with configured 18% GST. Product/customer IDs must come from the API. Sales require a customer name and valid mobile number; `party` remains optional for paid walk-in sales. Customer email is optional. `party` is required for purchases and credit sales. Purchases additionally accept `supplierInvoice`, optional `date`, and line `taxRate`. Sales ignore line tax overrides and use configured product GST. Both accept a valid past/present invoice `date`. Invoice numbers are assigned at commit, never reserved from the client.

Sales support item-level `guaranteeEnabled` and `warrantyEnabled` flags with integer `warrantyMonths` and `warrantyDays`. Enter only the coverage duration stated by the manufacturer. When coverage is enabled, the server records its start date from the invoice date and calculates a month-end-clamped expiry date; coverage dates are included in invoice PDFs and sales reports. The server validates the provided term but cannot independently verify a manufacturer's policy.

`GET /sales/:id/invoice` returns the PDF rendered from the saved invoice snapshot. `POST /sales/:id/send-email` requires an `Idempotency-Key`, a saved customer email, and SMTP configuration. Each attempt (including failed attempts) is recorded in `InvoiceEmailDelivery`; a failed attempt requires a new request key to retry. SMTP delivery failures do not change the saved sale or its stock. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` only in the backend environment. WhatsApp sharing is a frontend prefilled message link; the downloaded PDF must be attached manually.

## Service Center

All Service Center endpoints require an authenticated administrator.

| Method | Route | Purpose |
|---|---|---|
| GET | `/service-center?q=&page=&limit=&serviceType=&status=&from=&to=` | Search and paginate service bills |
| POST | `/service-center` | Create a service bill; requires `Idempotency-Key` |
| GET | `/service-center/:id` | Read a service bill and email delivery history |
| PATCH | `/service-center/:id` | Update service details, status, and payment amounts |
| GET | `/service-center/:id/bill` | Download the saved bill as PDF |
| POST | `/service-center/:id/send-email` | Send the saved PDF to the customer; requires `Idempotency-Key` |

Create/update accepts `customerName, customerEmail, customerPhone, customerAddress?, product, model?, serviceType, problem, solution?, totalAmount, paidAmount, status?`. Customer name, valid email, phone, product, service type, problem, total amount, and paid amount are required on create. `serviceType` is `Receive Shop` or `Receive Customer`; `solution` is required only for `Receive Customer`. For `Receive Shop`, solution is discarded even if a client submits it and is omitted from records, PDFs, emails, and WhatsApp text. `pendingAmount` is calculated on the server as `totalAmount - paidAmount`; client-provided pending values are ignored. `status` is `open|completed`.

New service bill numbers use the configured sales prefix and an independent persisted counter (for example `HCS-SVC-000001`). Repeating a create request with the same key and body returns the original bill without creating a duplicate. Updates preserve the bill number and creation timestamp and create an audit entry. Email uses the existing backend SMTP variables and stores sent/failed attempts in `ServiceEmailDelivery`; failed email does not modify the service bill. The frontend WhatsApp link pre-fills a message only; attach the downloaded PDF manually.

`method` is `cash|upi|card|bank|credit`. `credit` requires zero paid amount. Cash may exceed the bill total and records change. Other payment methods cannot exceed the invoice total. A payment body is `{ "amount": 100, "method": "upi", "reference": "optional" }`.

Return body: `{ "lines": [{ "product": "...", "quantity": 1 }], "reason": "Faulty item", "method": "cash" }`. Returns cannot exceed unreturned quantities. Purchase returns also require physically available stock and valid remaining cost valuation. Cancellation takes `reason, method` and reverses every remaining invoice line. A return first reduces outstanding dues, then records any refund required. Refunded money uses `sale-refund` or `purchase-refund` payment records. Refund methods exclude credit. Full returns also reverse remaining invoice charges. Original invoice totals are retained, with separate cumulative `returned`, current `paid`, `due`, and status values.

An admin exchange is a new sale with `exchangeOf` pointing to an original sale that already has a recorded return. It has its own payment; the original return/refund remains on the source invoice. There is no silent item replacement or invoice rewrite.

## Inventory

| Method | Route | Purpose |
|---|---|---|
| GET | `/inventory/summary` | Units/products/category totals; valuation for admin |
| GET | `/inventory/low-stock` | Alerts and reorder suggestions |
| GET | `/inventory/movements?product=<id>` | Admin movement ledger |
| POST | `/inventory/adjustments` | Admin stock correction |
| GET / POST | `/inventory/stock-counts` | Admin count history / start |
| PATCH | `/inventory/stock-counts/:id` | Save counted quantities/reasons |
| POST | `/inventory/stock-counts/:id/apply` | Authorize saved differences |

Adjustment: `{ "product": "...", "type": "increase|decrease", "quantity": 1, "reason": "Damaged unit", "reference": "optional" }`, with request key. Count start: `{ "lines": [{ "product": "..." }] }` (maximum 500 products). Count edit requires every selected line with `product, counted, reason`; a reason is mandatory for a difference. Applying an already-applied count is harmless. If current stock differs from its start snapshot, applying is rejected; start a fresh count.

## Reports and configuration

`GET /reports/dashboard` returns administrator totals. The following admin reports accept `from, to`: `/reports/sales`, `/purchases`, `/product-sales`, `/category-sales`, `/customer-sales`, `/supplier-purchases`, `/collections`, `/sale-returns`, `/purchase-returns`, `/movements`, `/profit`. These suffixes are all under `/reports`. `/reports/inventory` and `/reports/low-stock` return current snapshots.

Removed endpoints: `GET/POST /staff`, `PATCH /staff/:id`, and `PATCH /staff/:id/status` return `404` for authenticated administrators. Existing staff records are retained. Administrator setup and the profile password endpoint remain available.

Settings: `GET /settings`; admin `PATCH /settings` accepts `name, address, phone, email, gstin, logo, salePrefix, purchasePrefix, defaultTax, minStock, allowCreditSales, receiptFooter`. Sequences are server-controlled. Defaults affect newly created products; existing product tax/threshold values remain explicit.

Admin: `GET /audit-logs`, `GET/POST /expenses` (`description, amount, date?`). Audit logs and completed payment/stock records have no public modification/deletion endpoints.

## Detailed billing fields

Sales and purchases accept billing snapshots `partyName, partyPhone, partyEmail, partyAddress, partyGstin`. These fields affect the invoice snapshot; they do not silently alter saved contacts. Contact endpoints remain available to administrators. Customer records support email alongside supplier records.

Product defaults now include `productType, model`. Invoice lines can supply `productType, model, guaranteeEnabled, warrantyEnabled, warrantyMonths, warrantyDays`. Coverage flags must be booleans. Warranty months (0–1200) and days (0–36500) are whole numbers, and at least one must be positive when warranty is selected. Unselected warranty stores zero duration. The original contact, model, and coverage details remain on the saved invoice and its returned lines.

`invoiceDiscount` is an optional fixed bill discount in rupees, applied after individual line discounts and before GST. The server distributes it across remaining line values using exact paise and the largest-remainder method, so mixed-tax invoices, costs, returns, and profit reconcile. Stored `lineDiscount` is the original sum of item discounts, `invoiceDiscount` is the bill discount, and `discount` includes both. Each saved line's discount includes its allocated bill discount. A bill discount cannot exceed remaining product value.

Paid/pending amounts are recalculated by the server. An administrator can explicitly approve a single pending sale using `approveCredit: true`, without enabling shop-wide credit. The invoice records that administrator in `creditApprovedBy`; a saved customer is still mandatory. Purchase balances continue to be linked to the selected supplier.


## Print shop header

Invoice detail responses and Service Center record responses include a read-only `printShop` property with the public shop details from `config/print-shop.json`. Browser previews and downloaded/emailed PDFs use these same details. This property is not written into customer or transaction records.
