# Website performance

The public homepage renders immediately without the former fixed 700 ms splash
screen or incremental headline typing. Other public routes and the management
workspace load on demand. Management screens also load separately, so visiting
the login page does not download billing, inventory, and service screens.

The showroom photo has high fetch priority. Other photos load lazily and decode
asynchronously. Display JPEGs are generated at up to 960 pixels wide with quality
72; original photos remain in `src/assets`. To regenerate the display copies on
Windows, run `scripts/optimize-images.ps1` from the repository root.

Google Fonts connects early and loads without blocking the initial render. The
homepage's moving background and entrance animations no longer delay its first
screen; decorative light animation is disabled on smaller screens.

Admin searches wait for a 250 ms typing pause before requesting results. Initial
loads, pagination, and other filters remain immediate. Live refresh skips hidden
tabs and overlapping polling requests, resumes when the tab becomes visible,
and queues a refresh if a save occurs during an active request. Aborted responses
cannot replace newer results. Currency formatting reuses one formatter.

## Production build comparison

Measured using the same installed dependencies and `npm run build`:

| Asset | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Initial JavaScript entry | 483.69 KB | 274.47 KB | 43% |
| Initial stylesheet | 122.43 KB | 75.60 KB | 38% |
| Five public display photos combined | 724.90 KB | 390.35 KB | 46% |

These are asset sizes, not measured page load times or Core Web Vitals. Fonts,
network conditions, device performance, API latency, and hosting affect actual
load time. Deploy the frontend build through the existing Vercel setup to apply
the changes to the live website. No backend or hosting configuration changed.

## Verification

Run `npm test` and `npm run build` inside `Harish computer frontend`.
`performance.test.jsx` checks immediate homepage content, direct lazy routes,
search debouncing, immediate pagination, cancellation races, non-overlapping
polling, refresh after saves, and background tab behavior. Existing workspace,
billing, printing, and navigation tests cover the split management routes.
