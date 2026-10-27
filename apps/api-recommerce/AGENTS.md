# AGENTS.md

## Project Rules

- Never use real or scraped second-hand listing data.
- Never add real seller names, real shop names, real phone numbers, real addresses, or copied ad text.
- Real product brands and model names (Apple, IKEA, Fjällräven, Stokke, …) are allowed — they describe products, not people. Keep them in `PRODUCT_CATALOG` in `src/generation/text.js`.
- Prefer deterministic, testable implementations over clever abstractions.
- Keep all generation config-driven and reproducible by seed.
- If a requirement is ambiguous, choose the safest implementation that preserves privacy and reproducibility.
- Do not add any config path that points to row-level real listing data.
- Privacy checks are non-negotiable — do not weaken them to pass tests.
- Config change before code change when adjusting distributions.

## What This Project Is

A privacy-safe, reproducible synthetic recommerce (second-hand goods) search and discovery prototype: electronics, computers & gaming, home appliances, furniture, home decor, clothing, shoes & accessories, kids & baby, sports & outdoors, hobbies & music, books & media, antiques & collectibles, and garden & tools. All listings are generated at runtime from a fixed random seed and a JSON config file — no real listings, no real user data, no personal information exists anywhere in the system.

The service mirrors `api-realestate` and `api-mobility` in code structure and HTTP API surface; only the domain model and data differ.

## Prerequisites

- Node.js 22.5 or later (uses `node:sqlite` built-in)
- `npm install` from the repository root

## Starting the Server

```bash
npm start          # or: npm run dev (watch mode)
```

Starts the server on `http://0.0.0.0:3003` using `configs/items.base.json` and persisting data to `data.db`.

Optional flags:

```bash
node src/server.js --config configs/items.base.json --port 3003 --host 0.0.0.0 --db data.db
```

`PORT` and `HOST` environment variables are also honoured.

**First start (cold):** generates 5 000 item listings, behavior, computes embeddings, builds the FTS5 index, and persists everything to `data.db`. Evaluation runs deferred after the server begins accepting requests.

**Subsequent starts (warm):** all data is loaded from `data.db`; generation, embedding, and evaluation are skipped.

**If the config changes**, its hash changes and a new run is generated automatically. **If the schema changes**, delete `data.db` before starting.

## Repository Map

```
configs/items.base.json      Categories, conditions, segments, search, discovery, counties
src/rng.js                   Seeded PRNG (mulberry32) — same sequence for same seed
src/config.js                Config loading and overrideConfig()
src/schema/
  item.js                    Item schema validation and invariant checks
  interaction.js             Query, session, ranking label, and event schemas
src/generation/
  text.js                    PRODUCT_CATALOG (brands/models per subcategory) + title/text/description templates
  items.js                   Snapshot item generator
  timeline.js                Temporal inventory churn generator
  behavior.js                Synthetic query, session, and event generator
src/search/
  embeddingService.js        Deterministic hash-based embedding with result cache
  queryPreprocessor.js       Tokenisation (incl. æøåäöü) and Norwegian/English synonym expansion
  backend.js                 FTS5 lexical + cosine vector hybrid retrieval; bucket index; BM25 fallback
  reranker.js                Heuristic structured reranker
  adapters.js                Item → SearchDocument, SyntheticQuery → SearchRequest
  application.js             Orchestrates search and discovery requests
src/discovery/
  service.js                 Similar items, recommendations, cached browse (intent) feeds
src/privacy/
  checks.js                  Duplicate detection, quasi-identifier warnings, text scans
src/evaluation/
  metrics.js                 NDCG@K, Recall@K, MRR
  runner.js                  Baseline comparison and timeline snapshot evaluation
src/db/
  store.js                   SQLite persistence: items, behavior, embeddings, FTS5, evaluation, privacy
src/routes/
  api.js                     All JSON-returning routes (POST /search, /discover/*, GET /api/*)
  frontend.js                HTML demo route (GET /)
src/server.js                Entry point: buildDemoState, Hono sub-app composition, server start
```

## Configuration

All behaviour is driven by `configs/items.base.json`.

### `calibration`

- `categories[]` — `name`, `label`, `weight`, `depreciation_per_year`, `collectible` (antiques: no "new" condition, condition-based value instead of depreciation), optional `allow_for_parts: false`, and `subcategories[]`.
- `subcategories[]` — `name`, `label`, `weight`, `price_min`/`price_max` (new-equivalent NOK range), `age_min`/`age_max`, `bulky` (bulky items are pickup only), optional `size_scale` (`apparel`, `shoes`, `kids`).
- `conditions[]` — `new`, `like_new`, `good`, `fair`, `for_parts` with `price_multiplier` and `collectible_price_multiplier`.
- `shop_share`, `bidding_share`, `shipping_share`, price noise and feature bonus.

Every subcategory must have a matching key in `PRODUCT_CATALOG` (`src/generation/text.js`). Within a catalogue entry, models are ordered roughly cheapest → most expensive; the generator uses the position as a price hint.

### `behavior.user_segments[]`

Each segment (intent) declares `preferred_categories`, `preferred_features` (feature tag vocabulary), `preferred_regions`, budget ratios (relative to the category median price), and `exploratory_share`. The segment names are the intents exposed by `GET /api/intent`.

### `counties`

County name, municipalities, weight, `price_index` (multiplier on item prices) and `urban_share`.

## Schema

Defined in `src/schema/item.js`. Key invariants:

- `category` is one of the 13 configured categories; `subcategory` and `model` are non-empty
- `condition` in {`new`, `like_new`, `good`, `fair`, `for_parts`}; new items have `age_years` 0
- Antiques (`antiques_collectibles`) are at least 30 years old and never `new`
- `size` is only set for clothing, shoes, kids clothing and running shoes
- `warranty_remaining` / `has_warranty` only for items younger than 3 years
- `shipping_cost` > 0 when `shipping_available`, otherwise 0; `total_price = asking_price + shipping_cost`
- Generated text must not contain phone numbers, email addresses, or address-like strings

IDs follow the pattern of the other services: `itm-<seed>-<sequence>`, e.g. `itm-20260312-000001`.

## HTTP Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | HTML demo |
| `GET` | `/health` | `{"status":"ok"}` once ready (503 while building state) |
| `POST` | `/search` | Hybrid search — `{query_text, filters, page, page_size, language_hint}` |
| `POST` | `/discover/similar` | Similar items — `{listing_id, limit}` |
| `POST` | `/discover/recommendations` | Recommendations — same body as `/search` plus optional `limit` |
| `GET` | `/api/items/:id` | Single item document; `404` if not found |
| `GET` | `/api/items/:id/similar` | Similar items; query: `limit` |
| `GET` | `/api/search` | Search; query: `q`, `county` (repeatable), `category`, `subcategory`, `brand`, `condition`, `min_price`, `max_price`, `lat` + `lng` + `radius_km`, `shipping=true`, `sort` (`relevance`/`newest`), `page`, `page_size` |
| `GET` | `/api/intent` | Random intent browse feed; query: `limit` → `{intent, cluster, hits}` |
| `GET` | `/api/recommendations` | Browse feed when no `q` (query: `cluster`, `limit`; default `bargain_hunters`); search-derived recommendations when `q` is present |
| `GET` | `/api/sitemap` | All item IDs → `{listing_ids}` |

Search hits include `category_label`, `subcategory_label` and `condition_label` for display.

## SQLite Storage

Tables: `runs`, `items`, `items_fts`, `sessions`, `queries`, `ranking_labels`, `events`. Warm-start logic, WAL journaling and the store lifetime are identical to the other API services.

**FTS5:** `items_fts` is not contentless, so `listing_id` is stored and the BM25 scores can be joined back to documents. The MATCH expression ORs the query tokens with their synonym expansions. `openStore` detects and rebuilds an old contentless table automatically. The same implementation is used in api-realestate and api-mobility.

## Privacy

- No real listing rows, seller identities, shop names, addresses, or contact details
- Quasi-identifier warning: unique combination of county, municipality, category, subcategory, brand, age bucket and (log) price bucket with total price above NOK 50 000
- Duplicate and near-duplicate text detection as in the other services

## Design Principles

- Config change before code change when adjusting distributions.
- Privacy checks are non-negotiable — do not weaken them to pass tests.
- Keep the in-memory BM25 fallback intact; `store` may be null in tests.
- Keep the adapter layer (`src/search/adapters.js`) clean — it is the main seam between generation and search.
- All JSON-returning routes belong in `src/routes/api.js`; all HTML in `src/routes/frontend.js`; `src/server.js` is the orchestrator only.
- The store stays open for the server's lifetime — do not call `store.close()` inside request handlers.

## CORS

The API is open to every origin. `src/server.js` registers Hono's built-in `cors()` middleware first, for all routes: `Access-Control-Allow-Origin: *`, methods `GET, POST, OPTIONS`, header `Content-Type`, preflights cached for 24h, no credentials. Because it's registered first, preflights and the startup 503s also get CORS headers. Keep the API free of cookies and auth while it stays open like this.

## Performance

- **Response cache.** `src/routes/responseCache.js` is an in-memory LRU cache (1 000 entries, no expiry, since the data is static while the service runs). It holds search, similar, recommendation and POST discovery results, keyed by the validated request. `published_at`, `location` and `images` are added after the lookup, so cached results stay correct as the date rolls forward. Responses carry `X-Cache: HIT|MISS`. A cached response repeats the `latency_breakdown` of its original computation. Never mutate a cached result: `withDetails()` copies each hit.
- **Candidate pool.** `backend.search()` scores every candidate into light entries and keeps only the top `candidate_pool_size` with `selectTop()` (`src/search/topK.js`, a bounded heap with the same order as sort + slice). Hit objects are built only for those. Vector scoring is skipped for empty queries, whose query vector is zero.
- **FTS.** Prepared statements are reused per SQL variant. Relevance scores the best 200 text matches; `sort=newest` scores every match (`LIMIT` removed), so newest-first sees the whole match set.
- **`published_at`.** `publishedAt()` reuses its `Intl.DateTimeFormat` objects and memoizes "today" per minute and offsets per local hour, at about 1 µs per call. Creating formatters per call cost about 150 µs.
- **`/openapi.json`** is generated once, on first request, with `getOpenAPI31Document()`.
- `topK.js`, `responseCache.js`, `geoAndRecency.js` and `published.js` are identical in all three API services; keep them in sync.

## API Documentation (OpenAPI)

- `src/routes/api.js` is an `OpenAPIHono` router (`@hono/zod-openapi`). Every route is declared with `createRoute()` in `defineRoutes()` and registered with `app.openapi(route, handler)`.
- Request/response schemas live in `src/routes/schemas.js` (Zod 4), built from the loaded config so enums match the generated data.
- `GET /openapi.json` serves the generated OpenAPI 3.1 document; `GET /docs` serves the Scalar API reference (mounted in `server.js`).
- Validation errors return 400 `{ error: 'Invalid request', issues: [{ path, message }] }` via the shared `defaultHook`.
- When changing a response shape (adapters, search hits, discovery hits), update `schemas.js` in the same change so the docs stay accurate. Never register plain `app.get()`/`app.post()` routes in the API router — they won't be documented or validated.


## Location and Publish Time

api-realestate and api-mobility have copies of these modules (`geo.js`, `published.js`, `seed.js`, `derived.js`); keep them in sync.

- **Location.** `src/generation/geo.js` has a few populated areas per municipality (district or town centres, radius 0.4–0.9 km, weight). Each listing gets a point in a weighted area, denser towards its centre, rounded to 3 decimals (~100 m). Area centres are public place centres, never addresses. The privacy report warns (`geo_outside_area`) if a point falls outside its municipality's areas.
- **Publish time.** `src/generation/published.js` gives each listing a local publish minute (evening peak, quiet nights). The API builds `published_at` relative to today: `days_on_market` days ago at that minute, in Europe/Oslo time with offset. The date rolls forward daily. For ads published "today", the publish minute is scaled into the part of the day that has passed, so they're never in the future and don't bunch up on the current time.
- **Separate RNG streams.** Both are derived only from `listing_id` (+ municipality), each with its own RNG seeded via `seedFromString()`. `buildItem()` still draws the two RNG values of the old bounding-box sampler, so all other generated fields, and the image mapping, are unchanged. Don't remove those draws.
- **Stored and versioned.** `latitude`, `longitude`, `location_area` and `publish_minute` are columns on `items`. `runs.derived_version` records `DERIVED_FIELDS_VERSION` (`src/generation/derived.js`). When it differs, startup recomputes the fields in place and rebuilds the privacy report, with no regeneration. Bump the version after changing areas or the time distribution.
- **API.** Every item and hit has `location: { lat, lng, area, precision: 'approximate' }` and `published_at`. They're added in `routes/api.js` from `state.listingMeta`, not stored in the search documents, so the search index and embeddings are unaffected. `location_cluster` is unrelated to the position and unchanged.

### Geo, price and newest-first search

- **Price:** `min_price` / `max_price` become `total_price` `gte` / `lte` filters. `min_price > max_price` is a 400.
- **Radius:** `lat` + `lng` + `radius_km` (all three or none, radius up to 500 km) become `geo` on the search request. The backend drops candidates outside the radius before scoring, so facets and counts reflect the radius. Hits get `distance_km`, and the reranker's geo fit is `1 - distance / radius`. `POST /search` takes `geo: { lat, lng, radius_km }` directly.
- **Newest first:** `sort=newest` orders by `days_on_market` ascending, then `publish_minute` descending (`compareRecency` in `src/search/geoAndRecency.js`). It's applied before the 50-candidate pool is cut, so the pool holds the newest matches, and again after reranking. With a text query it only keeps real keyword or synonym matches (lexical score > 0), because vector similarity alone matches almost everything.
- The search documents carry `latitude`, `longitude` and `publish_minute` for this. They're not part of the search text or embeddings, and `routes/api.js` strips them from responses in favour of `location` / `published_at`.
- `/api/recommendations?q=` accepts the same price and radius parameters, but not `sort`.
- api-realestate and api-mobility have the same search options, and an identical copy of `geoAndRecency.js`; keep them in sync.

## Item Images

- On every start, `src/images/manifest.js` reads `images/manifest.json` (override with `--images <dir>`) and `store.replaceImages()` rewrites the `item_images` table (`listing_id, position, file, content_type, alt, width, height`). Without a manifest the table is cleared, so the API never references files that aren't served. A new manifest doesn't need a cold start; just restart the service.
- Every item and hit in the API responses (`/api/items/:id`, search, similar, intent, recommendations and the POST endpoints) has `images: [{ url, alt, width, height }]`, ordered with the main photo first. The list is `[]` when an item has no image. `url` is relative to the service base URL, e.g. `/images/<hash>.jpg`.
- `GET /images/:file` (`src/routes/images.js`) serves only files listed in `item_images`, with `Cache-Control: public, max-age=31536000, immutable`. File names are content hashes.

## Image Generation Tool

`tools/generate-images/` is a standalone CLI that generates ad images with Cloudflare Workers AI (`@cf/black-forest-labs/flux-2-klein-4b`) and writes them to `images/`. That folder is committed, so the deployed service serves the same images (about 200 MB, 433 JPEGs). Commit the changes after you regenerate images.

- **Independent of the service.** It reads items only through the HTTP API (`/health`, `/api/sitemap`, `/api/items/:id`) and never imports from `src/`. Code in `src/` must never import from `tools/`; the service only reads `images/manifest.json`, which is the only contract between the two (see Item Images).
- **Visual keys.** Ads that look the same share one image. `--granularity` A (default) = subcategory + brand + model, B = + colour, C = + material, D = one image per ad. Prompts leave out attributes that aren't in the key, so a shared image never contradicts an ad.
- **Output.** `images/files/<sha256>.<ext>` holds the raw model output (no re-encoding). `images/manifest.json` has `images` (visual key → file, prompt, alt, seed, attributes) and `listings` (listing_id → [visual key]). `images/index.html` is a contact sheet for visual QA.
- **Reproducible.** Seeds are derived from the visual key. Listing IDs are deterministic from the config seed, so the same manifest maps correctly both locally and on Render.
- **Flagged images.** Workers AI sometimes rejects a generated image with error `3030` ("output has been flagged"), typically for strongly branded subjects such as game covers, comic characters or logo-heavy products. The tool then tries two random seeds with the same prompt, and after that a brand-free generic prompt. The manifest records `prompt_variant: "branded-reseed"` or `"generic"`, and the contact sheet highlights those images.
- **Resumable.** Each run only generates keys that are missing from the manifest. Use `--regenerate "<key>"` (with `--new-seed` for a different result) to redo bad images.
- **Credentials.** `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Workers AI Read + Edit) are read from `.env.cloudflare` in the repo root (gitignored) or from the environment.

```bash
npm run dev:api-recommerce                                   # the tool reads from the running service
npm run images:generate -w apps/api-recommerce -- --dry-run  # counts and cost estimate, no calls
npm run images:generate -w apps/api-recommerce -- --limit 20 # small test batch
npm run images:generate -w apps/api-recommerce               # everything that is missing
npm run images:generate -w apps/api-recommerce -- --help
```
