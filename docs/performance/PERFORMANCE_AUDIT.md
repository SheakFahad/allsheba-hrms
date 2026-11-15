# Performance Audit — baseline (2026-11-15)

Production: https://allsheba-hrms.vercel.app · commit `429d758` (tag `v1.1.0-pre-perf`)

## How it was measured
- `curl` from Bangladesh, 10 samples per URL, time-to-first-byte (TTFB); min / median / max reported.
- Client JavaScript per route from the production build's client-reference manifests (raw and gzip).
- Request waterfalls counted by reading the actual code paths (no instrumentation in production).
- **Not measured** (no access in this session): authenticated pages end-to-end, Vercel function logs and
  analytics, Lighthouse in a signed-in browser, PostgreSQL `EXPLAIN ANALYZE` on production. Numbers for those
  are therefore not given; nothing below is estimated as a measurement.

## Baseline numbers (measured)

| Request | min | median | max |
|---|---|---|---|
| `/login` (server render + 1 database call) | 609 ms | **1031 ms** | 1121 ms |
| `/` (proxy session check + redirect) | 377 ms | 398 ms | 666 ms |
| `/brand/logo.png` (static, CDN) | 138 ms | 150 ms | 277 ms |
| Supabase RPC called directly from Bangladesh | 158 ms | 166 ms | 990 ms |

Response header `x-vercel-id: bom1::iad1::…` → requests enter Vercel's Mumbai edge (`bom1`) but **server code runs in
`iad1` (Washington DC, USA)**. The Supabase database is in **ap-northeast-1 (Tokyo)**.

| Route | Client JS (raw) | Client JS (gzip) |
|---|---|---|
| `/login` | 300 KB | 96 KB |
| `/entry` | 270 KB | 91 KB |
| `/admin` (dashboard) | 633 KB | **193 KB** |
| `/admin/attendance/history` | 634 KB | **193 KB** |
| `/admin/employees` | 233 KB | 79 KB |
| `/admin/reports/view` | 236 KB | 80 KB |

Largest chunks: ExcelJS 909 KB and jsPDF 409 KB (already loaded on demand only), **Recharts 399 KB (loaded with
the dashboard and history pages)**.

## Root causes (ranked)

1. **Server region far from the database.** Every database or auth call from a page travels USA ↔ Japan. A
   signed-in admin page makes ~8 sequential round trips (below), so network distance alone costs well over a second.
2. **Duplicate auth round trips.** `proxy.ts` and `getSessionUser()` both call `supabase.auth.getUser()`, which is a
   network call to Supabase Auth, on every request. The project signs tokens with ES256, so the token can be verified
   locally with `getClaims()` instead.
3. **Sequential waterfalls.**
   - Admin layout: session → profile → settings → counts, one after another.
   - Dashboard: settings → main queries → one holiday query **per date range** (7 ranges) → leave query only after
     everything else finished.
4. **Charts block the page.** The dashboard renders nothing until every chart's data is computed, and Recharts
   (~110 KB gzip) is in the initial bundle of the dashboard and history pages.
5. **No route-level loading UI.** Navigating between admin pages shows no feedback until the server finishes.

## Not found to be a problem
- Database indexes: every list/filter query uses an existing index (attendance by date and by employee+date, leave by
  employee/status/range, audit by time). Data volume is small (≈20 employees). No index changes are justified without
  `EXPLAIN ANALYZE` evidence.
- Export libraries (ExcelJS, jsPDF) are already dynamically imported.
- Fonts use `next/font` (self-hosted, no layout shift).
