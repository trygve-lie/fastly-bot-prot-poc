# Marketplace PoC

A server-rendered marketplace PWA demonstrating a multi-service architecture deployed on Render.com behind Fastly CDN. The app covers four verticals — Real Estate, Mobility, Jobs, and Recommerce — with Real Estate and Mobility powered by private synthetic-data API services.

Live at **[typegear.app](https://typegear.app)**
---

## Architecture

```
                    Fastly CDN (Frankfurt)
                          │
                    typegear.app
                          │
                    ┌─────▼──────┐
                    │  frontend  │  Render web service
                    │  (Hono)    │  port $PORT
                    └─────┬──────┘
                          │  internal Render network
              ┌───────────┴───────────┐
        ┌─────▼──────┐         ┌──────▼─────┐
        │api-realestate│         │api-mobility│
        │ (Hono, pserv)│         │(Hono, pserv)│
        │  port 3002   │         │  port 3001  │
        └─────────────┘         └─────────────┘
```

Three Node.js services in an npm workspace:

| Service | Type | Description |
|---|---|---|
| `apps/frontend` | Render web service | Server-renders all HTML pages, calls private APIs |
| `apps/api-realestate` | Render private service | Synthetic real estate listings (not publicly reachable) |
| `apps/api-mobility` | Render private service | Synthetic vehicle listings (not publicly reachable) |

---

## Getting started

**Prerequisites:** Node.js 22.5+ (uses the built-in `node:sqlite` module)

```bash
# Install all workspace dependencies from the repo root
npm install

# Start all three services (separate terminals)
npm run dev:api-realestate   # http://localhost:3002
npm run dev:api-mobility     # http://localhost:3001
npm run dev:frontend         # http://localhost:3000
```

The first start of an API service takes a few minutes — it generates 5 000 synthetic listings, computes embeddings, and builds the SQLite database. Subsequent starts load from the database and are fast. Delete `apps/api-realestate/data.db` or `apps/api-mobility/data.db` to force a fresh generation.

---

## Project structure

```
/
├── render.yaml              Render.com Blueprint (all three services)
├── CLAUDE.md                Agent instructions
├── apps/
│   ├── frontend/
│   │   ├── server.js        All routes and middleware
│   │   ├── templates/       Server-side HTML templates (JS functions)
│   │   │   ├── document.js  Base HTML document, loads WebAwesome, inlines CSS
│   │   │   ├── layouts/     page-layout.js, sub-page-layout.js
│   │   │   ├── pages/       One file per page type
│   │   │   └── css/         layout.css, transitions.css (inlined at startup)
│   │   └── public/
│   │       ├── client.js    Browser JS: PWA install, drawer nav, view transitions
│   │       ├── sw.js        Service worker (PWA installability only)
│   │       ├── manifest.json PWA manifest
│   │       └── awesome/     Vendored WebAwesome 3.13.0
│   ├── api-realestate/
│   │   ├── src/server.js    Entry point
│   │   ├── src/routes/      api.js (JSON endpoints), frontend.js (HTML demo)
│   │   ├── src/generation/  Synthetic data generators (seeded, reproducible)
│   │   ├── src/search/      Hybrid FTS5 + vector search
│   │   ├── src/db/store.js  SQLite persistence
│   │   └── configs/         listings.base.json (seed, counts, calibration)
│   └── api-mobility/
│       └── ...              Identical structure to api-realestate
```

---

## The verticals

### Real Estate and Mobility

Fully data-driven via the private API services. Each page load makes a server-side request to the appropriate API before rendering HTML.

- **Vertical home** (`/realestate`, `/mobility`): Shows a randomly selected "intent" browse feed (10 listings for a random user segment)
- **Search** (`/realestate/search?q=...`): Full-text hybrid search with filters
- **Item** (`/realestate/item/:id`): Listing detail with 5 similar items

### Jobs and Recommerce

Rendered from static in-memory data in `server.js`. No API calls.

---

## API services

Both API services expose identical endpoint patterns for their respective domains. The data is entirely synthetic — generated from a fixed random seed for reproducibility. No real listings, addresses, personal data, or identifiers exist anywhere in the system.

### Real Estate endpoints

```
GET /health
GET /api/search          ?q, county, property_type, max_price, min_bedrooms, page, page_size
GET /api/listings/:id
GET /api/listings/:id/similar
GET /api/intent          ?limit  →  {intent, cluster, hits[]}
GET /api/recommendations ?cluster, limit
GET /api/sitemap         →  {listing_ids[]}
GET /                    HTML demo UI
```

### Mobility endpoints

```
GET /api/search          ?q, county, vehicle_type, fuel_type, max_price, max_mileage
GET /api/vehicles/:id
GET /api/vehicles/:id/similar
GET /api/intent, /api/recommendations, /api/sitemap  (same pattern)
```

### Search

Each service uses a hybrid retrieval pipeline: FTS5 BM25 lexical scoring + hash-based cosine vector similarity + a business weight signal. A heuristic reranker adjusts scores based on geo fit, price fit, freshness, and synthetic behavioral data (clicks, saves, contacts).

Norwegian/English synonym expansion is applied to short queries.

### User segments (intent clusters)

**Real Estate:** first_time_buyers, family_upgraders, downsizers, investors, cabin_buyers, relocation_seekers, budget_constrained, amenity_seekers, exact_area_searchers, exploratory_browsers

**Mobility:** commuters, family_buyers, first_car_buyers, eco_drivers, sport_enthusiasts, luxury_seekers, budget_hunters, van_buyers, brand_loyalists, exploratory_browsers

---

## Frontend

### Templates

All pages are server-rendered HTML using [Hono](https://hono.dev)'s `html` tagged template literal. Templates are plain JS functions — no template engine. CSS is read from disk at startup and inlined into every HTML response.

### UI components

UI is built with [WebAwesome](https://webawesome.com) custom elements (`wa-card`, `wa-button`, `wa-input`, etc.). Components are lazy-loaded by the WebAwesome autoloader. The `wa-cloak` class on `<html>` prevents a flash of unstyled content (FOUC) during component registration.

> **Note:** There is a known incompatibility between WebAwesome's async autoloader and Chrome's cross-document view transitions on mobile. Pages with native `<select>` and `<input>` elements transition reliably; pages with `wa-select`/`wa-option` may show a blank frame during the transition.

### Page transitions

Cross-document view transitions are enabled via CSS (`@view-transition { navigation: auto }`) and produce a horizontal slide animation between pages. Requires Chrome 126+ or compatible browser.

### PWA

The app is installable as a PWA:
- **Android:** "Add to Home Screen" in Chrome
- **iOS:** Safari → Share → Add to Home Screen

After installation, the app runs in standalone mode (no browser chrome). The manifest includes shortcuts to all four verticals.

---

## Deployment

Defined in `render.yaml`. All services run in the Frankfurt region on Node.js 24.

### Frontend

- Build: `npm install`
- Start: `cd apps/frontend && node server.js`
- Env vars: `ORIGIN=https://typegear.app`, `API_MOBILITY_URL` and `API_REALESTATE_URL` (auto-injected from private service hostports)

### Private API services

- Start: `cd apps/api-realestate && node src/server.js --db /data/data.db`
- Both have a **1GB persistent disk** mounted at `/data` so `data.db` survives deploys. First deploy after provisioning the disk triggers a cold start (slow); all subsequent deploys are warm starts (fast).
- To force a cold start (e.g. after a schema change): delete `/data/data.db` via the Render Shell tab on that service.

### Fastly CDN

Fastly sits in front of the frontend. Cache strategy:

| Route | Browser | Fastly |
|---|---|---|
| Vertical homes (`/realestate`, `/mobility`) | 30s | 60s + stale-while-revalidate |
| Search pages | 60s | 5 min |
| Item pages | 60s | 10 min |
| Sitemaps | 1h | 24h |
| Account, Messaging | no-store | — |

Item pages are tagged with `Surrogate-Key: realestate-item-{id}` for targeted purging. All realestate pages share the `realestate` surrogate key.

---

## Development notes

### Changing CSS

Edit `templates/css/layout.css` or `transitions.css`. **Restart the dev server** — CSS is read at startup, not on each request.

### Adding a new frontend page

1. Create `templates/pages/your-page.js` (export a function returning HTML)
2. Export it from `templates/index.js`
3. Register the route in `server.js`

### Adding a new API endpoint

Add inside `createApiRouter(state)` in `src/routes/api.js` for either API service. Return JSON via `c.json(...)`. The `state` object has `state.app` (search), `state.store` (SQLite), `state.config`, and `state.listings`/`state.vehicles`.

### Privacy rules (API services)

The synthetic data must remain synthetic. Do not add:
- Real VINs, registration plates, or dealer names (mobility)
- Real addresses, broker names, or phone numbers (realestate)
- Any personally identifiable information

See each service's `AGENTS.md` for the full rule set.

---

## Tech stack

| Layer | Technology |
|---|---|
| HTTP framework | [Hono](https://hono.dev) + `@hono/node-server` |
| UI components | [WebAwesome 3.13.0](https://webawesome.com) (vendored) |
| Database | `node:sqlite` (Node.js built-in) |
| Hosting | [Render.com](https://render.com) |
| CDN | [Fastly](https://fastly.com) |
| Runtime | Node.js 24 |
