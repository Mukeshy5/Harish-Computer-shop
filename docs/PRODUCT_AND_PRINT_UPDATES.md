# Product form and print updates

The workspace retains administrator-only authentication. No live shop records were created, removed, or migrated during verification.

## Add Product

`/app/products/new` contains exactly eleven fields and one final **Add Product** button. Categories come from MongoDB. The form keeps values on failure, shows field-specific validation, prevents concurrent submits, and clears after a successful save. Product lists refresh through the existing data-change event and refetch when opened.

| Form label | Existing API/database name |
|---|---|
| Product Name | `name` |
| Product Model | `model` |
| Product Size | `size` |
| Product Type | `productType` |
| Category | `category` (existing Category reference) |
| Company Name | `companyName` |
| Product Colour | `colour` |
| Product Price | `sellingPrice` |
| Stock | `stock` (initial stock is recorded through the stock ledger) |
| Minimum Stock Alert | `minStock` |
| GST Rate | `taxRate` |

`POST /api/products` requires an authenticated administrator and all eleven values. Text is trimmed and limited to 200 characters. Price must be positive, no more than 1,000,000,000, and use at most two decimals. Stock and minimum alert must be whole numbers between 0 and 100,000,000. GST must be between 0 and 100, with at most two decimals, matching the existing billing rules. Category must identify an existing active category.

The requested alternate names (`productName`, `productModel`, `productSize`, `productColour`, `productPrice`, `minimumStockAlert`, `gstRate`) map to the existing names above. Legacy `openingStock` maps to initial `stock`; conflicting aliases are rejected. Internal SKU is generated automatically when omitted. Existing optional backend costing/SKU/reference fields remain supported for existing integrations; they are absent from the Add Product form. Opening inventory cost keeps the existing purchase-cost default rather than treating selling price as cost.

Successful creation returns `201` with the saved product and success message; a replay of the same `Idempotency-Key` returns the existing product with `200`. Reusing a key with different data returns `409`. Invalid input returns `400` with `error.fields`; unauthorized sessions return `401`. Request keys are protected by uniqueness in both storage modes. Existing product IDs and legacy records remain valid without requiring a data backfill. New products use the existing model with a version marker for required detail fields.

## Sell and Service Center printing

The public shop details have one source: `Harish computer backend/config/print-shop.json`. Update this file and restart/redeploy the backend to change the printed name, contact numbers, title, services, address, and email. It contains only public shop information. Invoice detail and service record API responses supply it as `printShop`; the frontend does not import files from the backend directory.

Both frontend print previews use the reusable `ShopHeader` component. Invoice/customer/product/payment/coverage values and service/customer/problem/solution/receive-selection values come from the existing API records. The existing rule that a Receive Shop record does not expose a solution remains in effect.

Sell invoices retain their Print, PDF download, WhatsApp, and Email controls. Service Center now also offers a printable saved-record preview and A4/80mm format selection, while keeping its save, download, WhatsApp, and email handlers. Print CSS hides navigation, forms, and actions. It wraps long values, separates the centered shop header from the document body, and adapts the receipt to narrow paper.

Both backend PDF generators use a shared header renderer with the same shop config. The header repeats on continuation pages; long service text and totals have page-break handling. Existing download and email endpoints therefore use the updated header without changing their API contracts, SMTP flow, or MongoDB schemas.

## Files changed for these updates

Frontend:

- `src/management/pages/AddProduct.jsx` — eleven-field create form.
- `src/management/pages/Products.jsx` — select the new create form; preserve the edit form and show added product details.
- `src/management/api.js` — optional command error callback for inline field errors.
- `src/management/ui.jsx` — dropdown field errors.
- `src/management/management.css` — product feedback and layout styles.
- `src/management/print/ShopHeader.jsx`, `ServiceReceipt.jsx`, `print.css` — common header, saved service preview, print styles.
- `src/management/pages/Billing.jsx`, `ServiceCenter.jsx` — integrate the print header and service print controls.
- `vite.config.js` — allow the public shared print configuration.
- `src/management/tests/add-product.test.jsx`, `workspace.test.jsx`, `print-layouts.test.jsx`, `print-workspace.test.jsx` — regression checks.

Backend:

- `validators/products.js`, `services/products.js` — validation/mapping, creation and retry protection.
- `models/index.js`, `config/store.js` — compatible product metadata and request-key uniqueness.
- `app.js` — product creation integration and field-error responses.
- `tests/products.test.js`, `tests/workflows.test.js`, `scripts/smoke.js` — product and existing-workflow verification.
- `config/print-shop.json`, `services/print-header.js` — public shop data and reusable PDF header.
- `services/invoice-pdf.js`, `services/service-center-pdf.js` — updated downloaded/emailed documents.
- `tests/print-layouts.test.js` — inspect actual generated PDF content, page headers and continuation pages.

Documentation: this file, `docs/VERIFICATION.md`, and the product API documentation where updated.

## Validation limits

Automated checks use isolated frontend fixtures and disposable MongoDB databases. They do not add sample products or customer/service records to the live shop database. The in-app Browser cannot initialize in this environment. Browser print-preview visuals, real desktop/mobile viewports, and physical A4/thermal printer output therefore remain unverified; DOM/PDF content checks do not establish printer-driver compatibility.
