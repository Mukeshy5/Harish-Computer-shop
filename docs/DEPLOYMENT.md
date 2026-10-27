# Deployment, backup, and restore

## Production topology

Use a persistent Node.js process behind an HTTPS reverse proxy, a static build of the frontend, and MongoDB Atlas or an authenticated replica set. Keep the frontend and API on the same origin (for example `https://shop.example.com` and `https://shop.example.com/api`). This matches the HTTP-only SameSite=Lax session cookie and avoids cross-site cookie dependence.

The repository contains both applications. For a frontend deployment such as Vercel, set the project Root Directory to `Harish computer frontend`, build with `npm run build`, and publish `dist`. For the Node.js backend host, set its root directory to `Harish computer backend` and start with `npm start`. Supply environment variables separately on each host; local `.env` files are not included in Git.

1. Deploy both existing source folders. In the backend, run `npm ci --omit=dev` and use `npm start` under your platform's process supervisor. Use full `npm ci` in CI to run the tests.
2. Configure backend secrets through the host's environment: `MONGODB_URI`, a random `JWT_SECRET` of at least 32 characters, `PORT=4000`, `CLIENT_URL=https://your-domain`, `NODE_ENV=production`, and `SHOP_NAME`. `TRUST_PROXY=1` is supported when there is exactly one trusted reverse proxy in front; otherwise leave it unset/0 and configure your proxy boundary appropriately.
3. With a full frontend dependency install, build using `VITE_API_URL=/api` and `npm run build`. Serve `Harish computer frontend/dist`. Never put database credentials or signing secrets in `VITE_*` variables; they are public build inputs.
4. Proxy `/api/` to the Node server and route other unknown frontend URLs to `index.html` for React Router. Do not expose MongoDB directly to the public internet.
5. Create an admin through the controlled setup script on a trusted terminal connected to the production database. Set `ADMIN_PASSWORD` only for the setup process, or use the supplied PowerShell wrapper. The local development first-admin form is disabled when `NODE_ENV=production`; no default password is shipped. Remove the temporary environment value afterward.
6. Verify sign-in, product creation, purchases, a sale, a return, payments, role restrictions, and backup/restore on a staging database before operating the shop. Configure shop identity and tax fields with the actual business details.

Example Nginx routing fragment (paths are illustrative):

```nginx
server {
    listen 443 ssl;
    server_name shop.example.com;
    # Supply your host's TLS certificate configuration here.
    root /srv/harish/frontend/dist;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / { try_files $uri $uri/ /index.html; }
}
```

This repository is prepared for Node/MongoDB hosting; it is not deployed to a cloud account by the setup scripts. Cloudflare Sites Workers do not run this Express/MongoDB TCP backend, so the existing MERN checkout is kept as a local/server-hosted project.

## Vercel frontend and Render backend

The production frontend is `https://harish673464iwidjd.vercel.app` and its backend is `https://harish-computer-shop.onrender.com`.

Vercel uses the committed `Harish computer frontend/vercel.json` to forward `/api/:path*` to the same path on Render, before falling back to the React application. The browser calls `/api` on the Vercel domain, so the existing HttpOnly, Secure, SameSite=Lax login cookie stays on the frontend origin. API responses bypass proxy caching. See [Vercel external rewrites](https://vercel.com/docs/routing/rewrites).

1. In Vercel, use root directory `Harish computer frontend`, build command `npm run build`, and output directory `dist`. Set `VITE_API_URL=/api` for Production. Redeploy after changing build environment variables.
2. In Render, use root directory `Harish computer backend`, build command `npm ci --omit=dev`, start command `npm start`, and health check path `/api/health`. Keep the existing `MONGODB_URI` and `JWT_SECRET`. Set `CLIENT_URL=https://harish673464iwidjd.vercel.app` and `NODE_ENV=production`. Render supplies `PORT` automatically. Configure `TRUST_PROXY` to match the trusted proxy boundary.
3. The backend explicitly allows this frontend in `config/deployment.json`. Additional exact origins can be supplied as a comma-separated `CLIENT_URL`; trailing slashes are normalized. Other origins remain rejected for writes.
4. In Atlas, allow the Render service's outbound IP ranges and wait for the access-list entries to become Active. Find the ranges in Render's **Connect > Outbound** tab; see [Render outbound IPs](https://render.com/docs/outbound-ip-addresses) and [Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
5. Deploy the backend and frontend changes. Both `https://harish-computer-shop.onrender.com/api/health` and `https://harish673464iwidjd.vercel.app/api/health` must return JSON with `status: "ok"` and `storage: "transactions"`. If the frontend endpoint returns HTML, its API rewrite has not been deployed. Then verify admin sign-in, refresh, and logout on the Vercel domain.

## Backups

The optional Bill Clear job is disabled by default. Follow [Bill Clear's backup verification and activation procedure](BILL_CLEAR.md) before enabling either manual or scheduled deletion. Keep the full database backup/restore checks below in addition to its per-bill recovery snapshots.

Install MongoDB Database Tools and use `mongodump`/`mongorestore` (separate tools from the MongoDB server). Keep backups encrypted and outside the web root/source checkout, restrict access, and test restoration to a separate database. Never publish database archives to source control.

For a local database, stop the API while taking a consistent shop backup, then run from the project directory:

```powershell
New-Item -ItemType Directory -Path '.\backups' -Force
$backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
mongodump --uri='mongodb://127.0.0.1:27017/harish_shop' --archive=".\backups\harish-$backupStamp.archive" --gzip
```

This includes **all** shop collections, including `standaloneledgers` when operating in standalone mode. Do not back up only products/invoices: the ledger, users, payments, settings, counters, and audit records must be preserved together. For Atlas use the platform's database snapshots/continuous backup and documented restore workflow; use a quiesced application window for a manual database-scoped dump.

Restore into a separate database first:

```powershell
mongorestore --uri='mongodb://127.0.0.1:27017' --archive='.\backups\your-backup.archive' --gzip --nsFrom='harish_shop.*' --nsTo='harish_restore_check.*'
```

Point a staging backend at `harish_restore_check`, preserve the matching JWT configuration if you intend to keep sessions, and check inventory reconciliation and invoice/account totals. To replace a live database, schedule downtime and follow a reviewed database restore procedure; the example deliberately does not drop or overwrite live data.

## Standalone-to-replica-set migration

1. Stop every API process that can write to the source shop database.
2. Back up the complete standalone database and test that backup.
3. Convert the MongoDB deployment to a replica set following MongoDB's documentation, then update `MONGODB_URI` if required.
4. In the backend, run `npm run migrate:standalone`. Related target collections must be empty; the initializer aborts if any are populated. All records are validated and inserted within one native transaction. The original aggregate is retained.
5. Run the application against the replica set, check `/api/health` reports `transactions`, verify administrator access, and inspect the inventory reconciliation report before allowing sales.

The retained aggregate becomes a historical recovery copy after migration; it is not updated by native transaction mode. Do not switch back to standalone mode as a rollback after accepting new writes, because that aggregate would be stale. Restore a complete consistent backup instead.

## Operational limits

The standalone atomic ledger caps writes at 12 MiB. Native transaction mode stores independent collections and avoids that document cap, but reports/list filtering are currently performed in application memory. Monitor record volume and introduce indexed database pagination/aggregation for large histories. Browser printing, printer margins, paper size, and shop-specific GST invoice requirements need verification on the target device and business configuration.
