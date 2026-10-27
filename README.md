# Marketplace PoC

A server-rendered marketplace PWA demonstrating a multi-service architecture deployed on Render.com behind Fastly CDN. The app covers four verticals — Real Estate, Mobility, Jobs, and Recommerce — with Real Estate, Mobility and Recommerce powered by synthetic-data API services.

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
          ┌───────────────┼────────────────┐
   ┌──────▼───────┐ ┌─────▼──────┐ ┌───────▼──────┐
   │api-realestate│ │api-mobility│ │api-recommerce│
   │ (Hono, pserv)│ │(Hono,pserv)│ │ (Hono, web)  │
   │  port 3002   │ │ port 3001  │ │  port 3003   │
   └──────────────┘ └────────────┘ └──────────────┘
```

Four Node.js services in an npm workspace:

| Service | Type | Description |
|---|---|---|
| `apps/frontend` | Render web service | Server-renders all HTML pages, calls the APIs |
| `apps/api-realestate` | Render private service | Synthetic real estate listings (not publicly reachable) |
| `apps/api-mobility` | Render private service | Synthetic vehicle listings (not publicly reachable) |
| `apps/api-recommerce` | Render web service (public) | Synthetic second-hand item listings with images; may become private later |

---

## Getting started

**Prerequisites:** Node.js 22.5+ (uses the built-in `node:sqlite` module)

```bash
# Install all workspace dependencies from the repo root
npm install

# Start all four services (separate terminals)
npm run dev:api-realestate   # http://localhost:3002
npm run dev:api-mobility     # http://localhost:3001
npm run dev:api-recommerce   # http://localhost:3003
npm run dev:frontend         # http://localhost:3000
```

The first start of an API service takes a few minutes — it generates 5 000 synthetic listings, computes embeddings, and builds the SQLite database. Subsequent starts load from the database and are fast. Delete the service's `data.db` (e.g. `apps/api-recommerce/data.db`) to force a fresh generation.

---

## Project structure

```
/
├── render.yaml              Render.com Blueprint (all four services)
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
│   ├── api-mobility/
│   │   └── ...              Identical structure to api-realestate
│   └── api-recommerce/
│       ├── src/generation/text.js  Product catalogue (real brands and models)
│       ├── configs/         items.base.json (categories, conditions, segments)
│       └── ...              Identical structure to api-mobility
```

---

## The verticals

### Real Estate, Mobility and Recommerce

Fully data-driven via the private API services. Each page load makes a server-side request to the appropriate API before rendering HTML.

- **Vertical home** (`/realestate`, `/mobility`, `/recommerce`): Shows a randomly selected "intent" browse feed (10 listings for a random user segment)
- **Search** (`/realestate/search?q=...`): Full-text hybrid search with filters
- **Item** (`/realestate/item/:id`): Listing detail with 5 similar items

### Jobs

Rendered from static in-memory data in `server.js`. No API calls.

---

## API services

All three API services expose identical endpoint patterns for their respective domains. The data is entirely synthetic — generated from a fixed random seed for reproducibility. No real listings, addresses, personal data, or identifiers exist anywhere in the system.

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

### Recommerce endpoints

```
GET /api/search          ?q, county, category, subcategory, brand, condition, min_price, max_price,
                          lat, lng, radius_km, shipping=true, sort=relevance|newest
GET /api/items/:id
GET /api/items/:id/similar
GET /api/intent, /api/recommendations, /api/sitemap  (same pattern)
```

Recommerce covers 13 categories — electronics, computers & gaming, home appliances, furniture, home decor, clothing, shoes & accessories, kids & baby, sports & outdoors, hobbies & music, books & media, antiques & collectibles, garden & tools — with real product brands (Apple, IKEA, Fjällräven, Stokke, Trek, Fender, Husqvarna, …). Sellers, shops and locations are synthetic.

Every listing, vehicle and item (and every search, similar, intent and recommendation hit) in all three API services has:

| Field | Example | Notes |
|---|---|---|
| `images` | `[{ "url": "/images/b99b9c33….jpg", "alt": "Stokke Xplory", "width": 1024, "height": 768 }]` | **api-recommerce only.** AI-generated photos served by the service at `GET /images/:file`; `[]` when an item has none |
| `location` | `{ "lat": 59.923, "lng": 10.761, "area": "Grünerløkka", "precision": "approximate" }` | Rounded to ~100 m, inside a populated area of the municipality; never an exact address |
| `published_at` | `"2026-10-24T20:14:00+02:00"` | ISO 8601, Norwegian local time; relative to today (the ad keeps its age, the date rolls forward daily) |

The recommerce API has open CORS, so browsers on any origin can call it.

### API documentation

Every API service publishes an OpenAPI 3.1 document and an interactive reference generated from its route definitions (via `@hono/zod-openapi` and Scalar):

| Service | OpenAPI document | Interactive docs |
|---|---|---|
| api-realestate | http://localhost:3002/openapi.json | http://localhost:3002/docs |
| api-mobility | http://localhost:3001/openapi.json | http://localhost:3001/docs |
| api-recommerce | http://localhost:3003/openapi.json | http://localhost:3003/docs |

The same definitions validate incoming requests — invalid parameters return `400` with a list of issues. api-realestate and api-mobility are private on Render, so their docs are reachable locally (or from inside Render's network). api-recommerce is public, so its `/docs` is also available on its `onrender.com` URL.

### Search

Each service uses a hybrid retrieval pipeline: FTS5 BM25 lexical scoring + hash-based cosine vector similarity + a business weight signal. A heuristic reranker adjusts scores based on geo fit, price fit, freshness, and synthetic behavioral data (clicks, saves, contacts).

Norwegian/English synonym expansion is applied to short queries.

### User segments (intent clusters)

**Real Estate:** first_time_buyers, family_upgraders, downsizers, investors, cabin_buyers, relocation_seekers, budget_constrained, amenity_seekers, exact_area_searchers, exploratory_browsers

**Mobility:** commuters, family_buyers, first_car_buyers, eco_drivers, sport_enthusiasts, luxury_seekers, budget_hunters, van_buyers, brand_loyalists, exploratory_browsers

**Recommerce:** tech_upgraders, gamers, students_furnishing, new_parents, interior_decorators, fashion_resellers, outdoor_enthusiasts, musicians_hobbyists, collectors, diy_gardeners, bargain_hunters, exploratory_browsers

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
- Env vars: `ORIGIN=https://typegear.app`, `API_MOBILITY_URL`, `API_REALESTATE_URL` and `API_RECOMMERCE_URL` (auto-injected from the services' internal hostports)

### API services

- api-realestate and api-mobility are **private services** (`pserv`). api-recommerce is a **public web service** (`web`, `healthCheckPath: /health`) and may become private later. A service's type can't be changed in place on Render: delete it and re-sync the Blueprint.
- Start: `cd apps/api-realestate && node src/server.js --db /data/data.db`
- Each has a **1GB persistent disk** mounted at `/data` so `data.db` survives deploys. First deploy after provisioning the disk triggers a cold start (slow); all subsequent deploys are warm starts (fast).
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

Define the route with `createRoute()` in `src/routes/api.js` (and its schemas in `src/routes/schemas.js`), then register it with `app.openapi(route, handler)`. It then shows up automatically in `/openapi.json` and `/docs`. The `state` object has `state.app` (search), `state.store` (SQLite), `state.config`, and `state.listings`/`state.vehicles`.

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
