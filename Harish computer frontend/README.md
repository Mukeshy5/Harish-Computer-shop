# Harish Computer Shop frontend

The public shop website is preserved at `/`. The connected billing and inventory application is at `/app/login`.

The Admin Panel provides products, inventory, stock adjustments/alerts/counts, categories/brands, activity log, shop settings, and profile. The Sell workspace provides billing and saved invoices, and Service Center provides saved service records and receipts. Other removed management screens remain unavailable. Only administrators can sign in; staff login controls, sessions, routes, and staff-management endpoints have been removed. Existing historical data is preserved.

See the [complete project setup](../README.md), [API reference](../docs/API.md), [deployment and backup guide](../docs/DEPLOYMENT.md), and [verification record](../docs/VERIFICATION.md).

From this directory:

```powershell
npm ci
npm run dev -- --port 5173 --strictPort
npm test
npm run build
```

Start the backend and MongoDB using the root setup instructions before signing in. Vite proxies `/api` to `http://localhost:4000`; configure `API_TARGET` if needed. `VITE_API_URL` includes the `/api` suffix. The production build is written to `dist` and requires a same-origin API reverse proxy and SPA route fallback.

`src/management` contains the billing workspace, reusable UI, API/session hooks, responsive styles, and isolated interaction tests. Existing public components, pages, and assets remain in their original locations.
