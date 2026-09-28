# AGENTS.md

## Project Rules

- Never use real or scraped real estate listing data.
- Never add real addresses, real names, real phone numbers, or copied listing text.
- Prefer deterministic, testable implementations over clever abstractions.
- Keep all generation config-driven and reproducible by seed.
- If a requirement is ambiguous, choose the safest implementation that preserves privacy and reproducibility.
- Do not add any config path that points to row-level real-estate data.
- Privacy checks are non-negotiable — do not weaken them to pass tests.
- Config change before code change when adjusting distributions.

## What This Project Is

A privacy-safe, reproducible synthetic real estate search and discovery prototype. All listing data is generated at runtime from a fixed random seed and a JSON config file — no real listings, no real user data, no personal information exists anywhere in the system.

The purpose is to provide a realistic-but-fictional dataset and search stack that can be used to develop, evaluate, and compare search and recommendation approaches without touching production data.

## Prerequisites

- Node.js 22.5 or later (uses `node:sqlite` built-in)
- `npm install`

## Starting the Server

```bash
npm start
```

Starts the demo server on `http://127.0.0.1:4001` using `configs/listings.base.json` and persisting data to `data.db`.

Optional flags:

```bash
node src/server.js --config configs/listings.base.json --port 4001 --host 127.0.0.1 --db data.db
```

**First start (cold):** generates 5 000 listings, behavior, computes embeddings, builds the FTS5 index, and persists everything to `data.db`. Evaluation runs deferred after the server begins accepting requests.

**Subsequent starts (warm):** all data is loaded from `data.db`; generation, embedding, and evaluation are skipped. The store stays open for the server's lifetime and is closed cleanly on SIGTERM/SIGINT.

**If the schema has changed** (e.g. after a code update), delete `data.db` before starting so a clean cold start runs.

## Architecture

```
configs/listings.base.json + seed
        │
        ▼
  Listing generator ──► Privacy checks ──► SQLite (data.db)
        │                                        │
        ├──► Timeline generator                  │ warm start: load listings,
        │                                        │ behavior, embeddings,
        ├──► Behavior generator ──► SQLite ◄─────┘ evaluation, privacy report
        │
        ├──► Search-document adapter
        │           │
        │           ▼
        │     FTS5 index (SQLite) + in-memory vector index
        │           │
        │     Query preprocessor ──► Hybrid retrieval ──► Reranker ──► Discovery
        │
        └──► Evaluation runner (deferred, persisted to SQLite)
                                          │
                                          ▼
                              Hono HTTP server
                         (routes/api.js + routes/frontend.js)
```

## Repository Map

```
configs/listings.base.json   Generation, behavior, search, and discovery settings
src/rng.js                   Seeded PRNG (mulberry32) — same sequence for same seed
src/config.js                Config loading and overrideConfig()
src/schema/
  listing.js                 Listing schema validation and invariant checks
  interaction.js             Query, session, ranking label, and event schemas
src/generation/
  text.js                    Deterministic/stochastic title and description templates
  listings.js                Snapshot listing generator
  timeline.js                Temporal inventory churn generator
  behavior.js                Synthetic query, session, and event generator
src/search/
  embeddingService.js        Deterministic hash-based embedding with result cache
  queryPreprocessor.js       Tokenisation and Norwegian/English synonym expansion
  backend.js                 FTS5 lexical + cosine vector hybrid retrieval; bucket index; BM25 fallback
  reranker.js                Heuristic structured reranker
  adapters.js                Listing → SearchDocument, SyntheticQuery → SearchRequest
  application.js             Orchestrates search and discovery requests
src/discovery/
  service.js                 Similar listings (primary-set pruning), recommendations, cached browse feeds
src/privacy/
  checks.js                  Duplicate detection, quasi-identifier warnings, text scans
src/evaluation/
  metrics.js                 NDCG@K, Recall@K, MRR
  runner.js                  Baseline comparison and timeline snapshot evaluation
src/db/
  store.js                   SQLite persistence: listings, behavior, embeddings, FTS5, evaluation, privacy
src/routes/
  api.js                     All JSON-returning routes (POST /search, /discover/*, GET /api/*)
  frontend.js                HTML demo route (GET /)
src/server.js                Entry point: buildDemoState, Hono sub-app composition, server start
```

## Configuration

All behaviour is driven by `configs/listings.base.json`.

### Top-level controls

| Field | Purpose |
|---|---|
| `seed` | Reproducibility anchor for all generators |
| `snapshot_date` | Base date for snapshot and timeline runs |
| `listing_count` | Number of listings in the snapshot baseline |
| `text_mode` | `"deterministic"` or `"stochastic"` |
| `max_images_per_listing` | Maximum image stub count per listing |

### `calibration`

Controls listing realism: price noise, amenity bonus, new-home probability, broker share, per-property-type size/price priors, and condition build-year bands.

### `churn`

Controls temporal inventory evolution: timeline length, daily rates for new/update/removed/sold/relisted listings, and price change parameters.

### `behavior`

Controls synthetic query and session generation: session count, queries per session, result pool size, click/save/contact/abandonment thresholds, and user segment definitions.

Each user segment declares: property-type preferences, amenity preferences, county preferences, bedroom target, budget band ratios, and exploratory query share.

### `search`

Controls hybrid retrieval: embedding dimensions, lexical/vector/business weights, candidate pool size, rerank depth, and query expansion settings.

### `discovery`

Controls discovery result shaping: result limits per surface, diversity lambda, and behavior boost weight.

### `counties`

Defines geography priors: county name, municipality list, generation weight, county-level price prior, and urban share.

**Editing guidance:** change config before changing generator code when you want different distributions. Keep seed fixed while iterating to get stable diffs.

## Schema

### Listing

Defined in `src/schema/listing.js`. Key invariants:

- Derived `price_per_m2` from `total_price / size_m2`
- `total_price >= asking_price`
- House-style properties (`detached`, `semi_detached`, `cabin`) carry no floor metadata and zero common costs
- Apartment plots are `null` or ≤ 50 m²
- Cabins cannot have elevators
- Bedrooms bounded by `floor(size_m2 / 12)`
- Generated text must not contain phone numbers, email addresses, or address-like strings

### Temporal listing statuses

`created`, `active`, `updated`, `sold`, `removed`, `relisted`

`created`, `active`, `updated`, and `relisted` are the indexable search states.

### Search contracts

**`StructuredFilter`** — operators: `eq`, `lte`, `gte`, `in`. The `in` operator on `county` enables multi-county filtering. Allowed fields: `county`, `municipality`, `property_type`, `bedrooms`, `asking_price`, `total_price`, `energy_rating`, `days_on_market`, `listing_status`, `amenity_tags`.

**`SearchRequest`** — carries `query_text`, `filters`, `page`, `page_size`, `profile_context`, `language_hint`.

**Search hit** — blended score: FTS5 BM25 lexical (or in-memory fallback) + cosine vector + business weight; augmented by reranker with filter match, geo fit, price fit, freshness, popularity.

### Discovery contracts

Three surfaces — similar listings, recommended for search, browse by intent cluster — each returning listing identity, basic metadata, score, and an explanation string.

## HTTP Endpoints

All JSON-returning endpoints live in `src/routes/api.js`. The HTML demo lives in `src/routes/frontend.js`. Both are composed into the main Hono app via `app.route('/', ...)`.

### HTML demo

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | HTML demo: search form with multi-county select, results, detail, similar, recommendations, browse |

### Legacy POST API (unchanged, stays at root)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | `{"status":"ok"}` |
| `POST` | `/search` | Hybrid search — `{query_text, filters, page, page_size, language_hint}` |
| `POST` | `/discover/similar` | Similar listings — `{listing_id, limit}` |
| `POST` | `/discover/recommendations` | Recommendations — same body as `/search` plus optional `limit` |

### REST API (for third-party consumers)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/listings/:id` | Single listing document; `404` if not found |
| `GET` | `/api/listings/:id/similar` | Similar listings; query: `limit` |
| `GET` | `/api/search` | Search; query: `q`, `county` (repeatable), `property_type`, `max_price`, `page`, `page_size` |
| `GET` | `/api/recommendations` | Browse feed when no `q` (query: `cluster`, `limit`); search-derived recommendations when `q` is present |

Multi-county: `?county=Oslo&county=Vestland` — the `county` param is repeatable and produces an `in` filter internally.

## SQLite Storage

The store (`data.db` by default) is opened at startup and stays open for the lifetime of the server. It is closed on SIGTERM/SIGINT.

### Tables

| Table | Purpose |
|---|---|
| `runs` | One row per config+seed combination; stores `config_hash`, `summary_json`, `evaluation_json`, `privacy_json` |
| `listings` | 5 000 generated listing rows; includes `embedding TEXT` (JSON float array) and `county` index |
| `listings_fts` | FTS5 virtual table — `listing_id UNINDEXED`, `county UNINDEXED`, `text_content` |
| `sessions` | Synthetic sessions |
| `queries` | Synthetic queries |
| `ranking_labels` | Per-query per-listing relevance labels |
| `events` | Click/save/contact/abandon events |

All behavior tables have `run_id` indexes. WAL journaling is enabled on every open.

### Warm-start skip logic

On startup the server checks `runs.config_hash`:
- **Listings** — loaded from `listings` table if run exists
- **Behavior** — loaded from `sessions`, `queries`, `ranking_labels`, `events` if populated
- **Embeddings** — loaded from `listings.embedding` and set on search documents before indexing
- **FTS5** — pre-built in the SQLite file; only populated on cold start
- **Summary** — loaded from `runs.summary_json`
- **Privacy report** — loaded from `runs.privacy_json`
- **Evaluation** — loaded from `runs.evaluation_json`; deferred evaluation is skipped entirely

The in-memory search index (bucket index, inverted index, vector store) is always rebuilt from the loaded data on each startup.

### FTS5 lexical search

At search time, `queryFTS5()` in `search/backend.js` queries `listings_fts` with `WHERE text_content MATCH ? AND county IN (...)` (county values extracted from the active filter). This ensures the BM25 candidate pool is scoped to the selected counties, preventing good county-specific matches from being displaced by global top-N limits.

If FTS5 is unavailable (no store, or query is empty), the backend falls back to in-memory BM25 using `invertedIndex`, `documentTermsMap`, and `termFreqMap`.

### Schema migrations

`openStore` applies `ALTER TABLE` migrations for any new columns added after an existing `data.db` was created. The FTS5 table is automatically dropped and rebuilt if the `county` column is missing.

## Privacy

### Core guarantees

- No real listing rows are ever ingested
- No exact address fields exist in the listing schema
- Listing text is generated from synthetic structured attributes only
- No real images, floorplans, or broker identities are used
- Search indexes operate only on data generated inside this repository

### Never add

- Production listing exports or scraped ad text
- Real seller, broker, or buyer identity
- Exact real-world addresses, phone numbers, or email addresses

### Enforced checks (`src/privacy/checks.js`)

- Phone-number, email, and address-like pattern detection in generated text
- Exact duplicate text detection across listings
- Near-duplicate text detection (token Jaccard ≥ 0.96)
- High-risk quasi-identifier warnings (rare high-price county/type/size combinations)

Treat rising warning counts after a generation change as a signal to inspect before merging.

## Evaluation

`src/evaluation/runner.js` compares three retrieval baselines against synthetic behavioral ground truth:

| Baseline | Weights |
|---|---|
| `lexical` | lexical=1.0, vector=0.0, business=0.0 |
| `vector` | lexical=0.0, vector=1.0, business=0.0 |
| `hybrid` | from config |

Metrics per baseline and per user segment: NDCG@10, Recall@10, MRR, filter satisfaction rate, price-fit rate, diversity, catalog coverage, freshness sensitivity, conversion proxy.

The runner accepts pre-generated `listings` and `behavior` to avoid redundant regeneration. Results are persisted to `runs.evaluation_json` and loaded on warm starts.

## Reproducibility

Fully reproducible from `seed` + `snapshot_date` + config. The mulberry32 PRNG in `src/rng.js` is the single source of randomness. All caches, FTS5 indexes, and evaluation results are derived from this seed and are stable across restarts once persisted.

## Design Principles

- Config change before code change when adjusting distributions.
- Privacy checks are non-negotiable — do not weaken them to pass tests.
- Keep the FTS5 in-memory BM25 fallback path intact; the `store` parameter to `createSearchBackend` may be null in tests.
- Keep the adapter layer (`src/search/adapters.js`) clean — it is the main seam between generation and search.
- All JSON-returning routes belong in `src/routes/api.js`; all HTML in `src/routes/frontend.js`; `src/server.js` is the orchestrator only.
- The store stays open for the server's lifetime — do not call `store.close()` inside request handlers.
