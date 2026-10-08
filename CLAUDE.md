# CLAUDE.md — Agent instructions for fastly-bot-prot-poc

## What this repo is

A proof-of-concept marketplace PWA deployed on Render.com behind Fastly CDN. It consists of three Node.js services in an npm workspace:

- **`apps/frontend`** — public-facing Hono server. Server-renders HTML pages. Acts as BFF (backend-for-frontend), fetching data from the two private API services.
- **`apps/api-realestate`** — private Hono API. Generates and serves synthetic real estate listings.
- **`apps/api-mobility`** — private Hono API. Generates and serves synthetic vehicle listings.

The live domain is `typegear.app`, served via Fastly (Frankfurt region) → Render.com.

---

## Repository layout

```
/
├── CLAUDE.md
├── package.json          ← workspace root (private, no deps)
├── render.yaml           ← Render.com Blueprint (all three services)
├── .npmrc                ← save-exact=true, no package-lock
└── apps/
    ├── frontend/
    │   ├── server.js          ← Hono entry point, all routes
    │   ├── package.json
    │   ├── public/
    │   │   ├── client.js      ← browser JS: PWA install, drawer nav, pageswap handler
    │   │   ├── sw.js          ← minimal passthrough service worker (PWA installability only)
    │   │   ├── manifest.json  ← PWA manifest (id: marketplace, display: standalone)
    │   │   ├── awesome/3.13.0/  ← vendored WebAwesome; immutable, never edit
    │   │   └── icons/
    │   └── templates/
    │       ├── document.js    ← base HTML document; inlines CSS; loads WA
    │       ├── index.js       ← barrel re-export of all templates
    │       ├── css/
    │       │   ├── layout.css      ← app CSS; injected inline via readFileSync
    │       │   └── transitions.css ← cross-document view transition CSS; injected inline
    │       └── pages/
    │           ├── home.js          ← homePage({intentLabel, items, slug, typeKey})
    │           ├── realestate.js    ← intentVerticalPage(), apiSearchPage() — shared for realestate + mobility
    │           ├── realestate-item.js ← realestateItemPage(listing, similar)
    │           ├── mobility-item.js   ← mobilityItemPage(vehicle, similar)
    │           ├── vertical.js      ← verticalPage(vertical) — job and recommerce
    │           ├── search.js        ← searchPage(vertical, query) — job and recommerce
    │           ├── item.js          ← itemPage(vertical, listing) — job and recommerce
    │           ├── account.js
    │           └── messaging.js
    ├── api-realestate/
    │   ├── src/server.js      ← Hono entry; DEFAULT_PORT=3002, DEFAULT_HOST=0.0.0.0
    │   ├── src/routes/api.js  ← all JSON endpoints
    │   ├── src/routes/frontend.js ← HTML demo UI at /
    │   ├── src/generation/    ← synthetic data generators (seeded PRNG)
    │   ├── src/search/        ← hybrid FTS5 + vector search
    │   ├── src/db/store.js    ← SQLite persistence (node:sqlite built-in)
    │   ├── configs/listings.base.json ← seed, listing_count, calibration
    │   └── AGENTS.md          ← domain-specific rules (read before touching this service)
    └── api-mobility/
        ├── src/server.js      ← DEFAULT_PORT=3001, DEFAULT_HOST=0.0.0.0
        ├── src/routes/api.js
        └── ...                ← identical structure to api-realestate
```

---

## Running locally

All three services must be running simultaneously for the frontend to work fully.

```bash
# Terminal 1
npm run dev:api-realestate    # port 3002, --watch

# Terminal 2
npm run dev:api-mobility      # port 3001, --watch

# Terminal 3
npm run dev:frontend          # port 3000, --watch
```

Or start any single workspace:
```bash
npm run dev --workspace=apps/frontend
```

**First start of an API service is slow** (generates 5 000 items, computes embeddings, builds SQLite). Subsequent starts are fast (loads from `data.db`). Delete `data.db` to force a cold start after schema changes.

**`node:sqlite` is a Node.js built-in** — requires Node.js 22.5+. No npm package needed.

---

## Frontend: key patterns

### Route registration

All routes are in `apps/frontend/server.js`. Registration order matters — specific routes before generic ones.

- `/realestate`, `/mobility` — async, call the respective API service's `/api/intent?limit=10` before rendering.
- `/job`, `/recommerce` — synchronous, render from static `VERTICALS` object in `server.js`.
- All routes use `page()` or `subPage()` wrappers (defined in `server.js`) which automatically thread cache headers and asset paths.

### Template system

Templates are plain JS functions returning Hono `HtmlEscapedString` (via the `html` tagged template literal). There is no template engine.

```js
// Correct: use html`` for template content
return html`<div>${someValue}</div>`;

// Correct: use raw() to inject pre-escaped/trusted strings
return html`<div>${raw(trustedHtml)}</div>`;
```

`document.js` reads `layout.css` and `transitions.css` with `readFileSync` **at module load time** (once at startup). Changes to those CSS files require a server restart to take effect in development.

### CSS

All app CSS is inlined into every HTML response — there are no external CSS requests for app styles. `layout.css` and `transitions.css` are concatenated and emitted as a single `<style>` block in the `<head>`.

Do not add `<link rel="stylesheet">` for app CSS. Add CSS to `layout.css` or `transitions.css` instead.

### WebAwesome (WA) components

All UI components are `wa-*` custom elements from WebAwesome 3.13.0, vendored at `public/awesome/3.13.0/`. **Never modify files inside that directory.**

- The autoloader (`webawesome.loader.js`) is loaded as a deferred `<script type="module">` in `document.js`.
- `<html class="wa-theme-default wa-cloak">` hides WA elements until the autoloader removes `wa-cloak` after component registration.
- **Known issue:** WA's async autoloader is incompatible with cross-document view transitions on mobile Chrome. The `wa-cloak` removal happens after `pagereveal` fires, causing blank frames during transitions on pages with many WA components (specifically `wa-select`, `wa-option`). A solution involving `blocking="render"` + `webawesome.js` or a custom sync bundle is under investigation. **Do not add `wa-select` or `wa-option` to pages that participate in cross-document view transitions** — use native `<select>` and `<option>` instead.

### Cross-document view transitions

`transitions.css` enables horizontal slide animations between pages:
- `@view-transition { navigation: auto; }` inside `@media (prefers-reduced-motion: no-preference)`
- `pagereveal` event handler in `document.js` sets `forwards`/`backwards` type based on URL depth
- `pageswap` event handler in `client.js` sets the type on the outgoing page

Transitions work reliably for `/job` and `/recommerce`. `/realestate` and `/mobility` have the known WA cloak issue above.

### Public asset caching

```js
// In the /public/* middleware:
if (path.startsWith('/public/awesome/')) → immutable, max-age=31536000
else → no-cache
```

`client.js` and `sw.js` are served with `Cache-Control: no-cache` — they must always be fresh.

### Sitemap

Four routes: `/sitemap.xml` (index), `/sitemap-static.xml`, `/sitemap-realestate.xml`, `/sitemap-mobility.xml`. The two API sitemaps fetch all item IDs live from `GET /api/sitemap` on each private service. They use `Surrogate-Control: max-age=86400` so Fastly caches them for 24h.

---

## API services: key patterns

### Startup sequence

`buildDemoState()` in `src/server.js` is synchronous and runs before `serve()` is called. It may take several minutes on a cold start (generating 5 000 items). On warm start (data.db exists), it loads in seconds.

Both services bind to `0.0.0.0` (not `127.0.0.1`) so they are reachable from the frontend via Render's internal network.

### Data model

Every listing/vehicle has:
- `listing_id` — unique ID (`lst-YYYYMMDD-NNNNNN` / `veh-YYYYMMDD-NNNNNN`)
- `title` — short display title (e.g. "3-bed apartment in Oslo" / "2022 Volkswagen Polo")
- `text` — one-sentence description used in search and item pages
- `body` — long concatenated blob used only inside the search index
- `county`, `municipality`, `property_type`/`vehicle_type`, `total_price`, `asking_price`

Do not add real VINs, registration plates, addresses, phone numbers, or personal data. All data is synthetic.

### Key endpoints

Both services expose the same pattern under different entity names:

| Endpoint | Description |
|---|---|
| `GET /health` | `{status: "ok"}` |
| `GET /api/search?q=&county=&...` | Hybrid search with filters |
| `GET /api/listings/:id` (or `/api/vehicles/:id`) | Single item |
| `GET /api/listings/:id/similar` | Similar items |
| `GET /api/intent?limit=N` | Random intent browse feed — returns `{intent, cluster, hits}` |
| `GET /api/recommendations?cluster=&limit=` | Browse feed for a specific user segment |
| `GET /api/sitemap` | All item IDs for sitemap generation |
| `GET /` | HTML demo UI (not used by frontend) |

### Search filter params (api-realestate)
`q`, `county` (repeatable), `property_type`, `max_price`, `min_bedrooms`

### Search filter params (api-mobility)
`q`, `county` (repeatable), `vehicle_type`, `fuel_type`, `max_price`, `max_mileage`

### Adding a new endpoint

Add it in `src/routes/api.js` inside the `createApiRouter(state)` function. State fields available: `state.config`, `state.app` (search application), `state.store` (SQLite), `state.vehicles`/`state.listings`, `state.behavior`, `state.runId`.

Do not call `state.store.close()` inside request handlers — the store is kept open for the server's lifetime.

---

## Deployment (Render.com)

Defined in `render.yaml` at the repo root. Any change to this file takes effect on the next Blueprint sync.

| Service | Type | Start command |
|---|---|---|
| `frontend` | web | `cd apps/frontend && node server.js` |
| `api-mobility` | pserv | `cd apps/api-mobility && node src/server.js --db /data/data.db` |
| `api-realestate` | pserv | `cd apps/api-realestate && node src/server.js --db /data/data.db` |

All services: `region: frankfurt`, `NODE_VERSION: 24`, `buildCommand: npm install`.

**Private services are not publicly reachable.** The frontend accesses them via Render internal networking (`API_MOBILITY_URL` and `API_REALESTATE_URL` env vars, injected via `fromService: hostport`).

**Persistent disks** on both private services at `/data` (1GB). `data.db` is written there so warm starts survive deploys. If schema changes require a cold start, delete `/data/data.db` via the Render Shell tab.

**ORIGIN env var** on the frontend is set to `https://typegear.app` — used by `publicOrigin(c)` for sitemap URLs and robots.txt.

**Service region is set at creation time.** To change region, delete the service and recreate — it cannot be updated in-place.

---

## Fastly CDN

Fastly sits in front of the `frontend` service on `typegear.app`. The private API services are not behind Fastly — they are internal to Render.

Key HTTP cache headers set per route in `server.js`:

| Route group | Browser TTL | Fastly TTL | Surrogate-Key |
|---|---|---|---|
| `/realestate`, `/mobility` home | 30s | 60s + swr=10s | `realestate` / `mobility` |
| `*/search` | 60s | 300s + swr=30s | `realestate realestate-search` |
| `*/item/:id` | 60s | 600s + swr=60s | `realestate realestate-item-{id}` |
| `/sitemap*.xml` | 3600s | 86400s + swr=3600s | `sitemap` |
| `/account`, `/messaging` | `private, no-store` | — | — |

Use `Surrogate-Key` for targeted Fastly purges. Purge all realestate pages: `POST /service/{id}/purge/realestate`.

---

## PWA

- `manifest.json`: `display: standalone`, `id: marketplace`, four vertical shortcuts (realestate, mobility, job, recommerce), `theme_color: #ffffff`, `background_color: #ffffff`
- `sw.js`: minimal passthrough — exists only for PWA installability, does not cache anything
- `viewport-fit=cover` in the viewport meta, with `env(safe-area-inset-*)` used in `layout.css` for notch/home-indicator clearance
- `apple-mobile-web-app-status-bar-style: black-translucent` for iOS edge-to-edge

---

## Common tasks

### Add a new page to the frontend

1. Create `templates/pages/your-page.js` exporting a function
2. Export it from `templates/index.js`
3. Register the route in `server.js` (import the function; use `page()` or `subPage()` wrapper)
4. Add cache headers appropriate for the content type

### Add a new API endpoint to api-realestate or api-mobility

Add inside `createApiRouter(state)` in `src/routes/api.js`. Return JSON via `c.json(...)`. Keep all HTML in `src/routes/frontend.js`.

### Change CSS

Edit `apps/frontend/templates/css/layout.css` or `transitions.css`. Restart the frontend server — CSS is read at startup via `readFileSync`. Do not add external stylesheet links for app styles.

### Update the WA version

1. Replace the directory `public/awesome/3.13.0/` with the new version
2. Update `waBasePath` default in `templates/document.js`
3. The immutable cache headers in `server.js` already handle versioning via the path

### Run all services together (quick start)

```bash
npm run dev:api-realestate &
npm run dev:api-mobility &
npm run dev:frontend
```

---

## Things to avoid

- **Do not add `wa-select` or `wa-option`** to pages that use cross-document view transitions. Use native `<select>`/`<option>` instead (the WA cloak/view transition race condition causes blank frames on mobile Chrome).
- **Do not modify `public/awesome/3.13.0/`** — these are vendored files. Update by replacing the entire directory.
- **Do not call `state.store.close()`** inside API request handlers.
- **Do not add real personal data** to api-realestate or api-mobility — all data must remain synthetic. Read `apps/api-realestate/AGENTS.md` and `apps/api-mobility/AGENTS.md` before modifying those services.
- **Do not use `git push --force`** without checking with the user. Prefer `--force-with-lease`.
- **Do not add `<link rel="stylesheet">`** for app styles — all app CSS goes inline via `layout.css`.
- **`public/dist/` contains stale build artifacts** from a reverted build system. Ignore them; they are not referenced by any active code.
