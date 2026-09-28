import { Hono } from 'hono';

/**
 * Escapes special HTML characters in a string to prevent XSS in template output.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders the HTML demo page as a string, running search and discovery for the current URL params.
 * @param {Object} state - Application state from buildDemoState.
 * @param {URLSearchParams} params
 * @returns {string} HTML string.
 */
function renderHomePage(state, params) {
  const queryText = params.get('q') || '';
  const counties = params.getAll('county').filter(Boolean);
  const propertyType = params.get('property_type') || '';
  const maxPrice = params.get('max_price') || '';
  const listingId = params.get('listing_id') || '';

  const filters = [];
  if (counties.length === 1) filters.push({ field: 'county', operator: 'eq', value: counties[0] });
  else if (counties.length > 1) filters.push({ field: 'county', operator: 'in', value: counties });
  if (propertyType) filters.push({ field: 'property_type', operator: 'eq', value: propertyType });
  if (maxPrice) filters.push({ field: 'total_price', operator: 'lte', value: parseInt(maxPrice) });

  const searchPayload = { query_text: queryText, filters, page: 1, page_size: 10, language_hint: 'no' };
  const searchResponse = (queryText || filters.length) ? state.app.search(searchPayload) : { hits: [], facets: {}, latency_breakdown: {} };
  const similar = listingId ? state.app.discoverSimilar({ listing_id: listingId, limit: 5 }) : { hits: [] };
  const recommendations = (queryText || filters.length) ? state.app.discoverRecommendations({ ...searchPayload, limit: 5 }, searchResponse.rerankedHits) : { hits: [] };
  const browse = state.app.browseIntentCluster({ cluster: 'family_upgraders', limit: 5 });

  let selectedDoc = null;
  if (listingId) {
    try { selectedDoc = state.app.documentRepository.get(listingId); } catch (e) {}
  }

  const buildUrl = (extraParams = {}) => {
    const p = new URLSearchParams();
    if (extraParams.q ?? queryText) p.set('q', extraParams.q ?? queryText);
    const urlCounties = 'county' in extraParams ? [].concat(extraParams.county).filter(Boolean) : counties;
    for (const c of urlCounties) p.append('county', c);
    if (extraParams.property_type ?? propertyType) p.set('property_type', extraParams.property_type ?? propertyType);
    if (extraParams.max_price ?? maxPrice) p.set('max_price', extraParams.max_price ?? maxPrice);
    if (extraParams.listing_id ?? listingId) p.set('listing_id', extraParams.listing_id ?? listingId);
    return `/?${p.toString()}`;
  };

  const resultItems = searchResponse.hits.length
    ? searchResponse.hits.map(hit =>
        `<li><a href="${escapeHtml(buildUrl({ listing_id: hit.listing_id }))}">${escapeHtml(hit.title)}</a> (${escapeHtml(hit.county)} / ${escapeHtml(hit.property_type)} / NOK ${hit.total_price.toLocaleString()})</li>`
      ).join('\n')
    : '<li>No search results yet.</li>';

  const similarItems = similar.hits.length
    ? similar.hits.map(h => `<li><a href="${escapeHtml(buildUrl({ listing_id: h.listing_id }))}">${escapeHtml(h.title)}</a> (${escapeHtml(h.county)} / ${escapeHtml(h.property_type)} / NOK ${h.total_price.toLocaleString()})</li>`).join('\n')
    : '<li>Select a listing to view similar homes.</li>';

  const recommendationItems = recommendations.hits.length
    ? recommendations.hits.map(h => `<li><a href="${escapeHtml(buildUrl({ listing_id: h.listing_id }))}">${escapeHtml(h.title)}</a> (${escapeHtml(h.county)} / ${escapeHtml(h.property_type)} / NOK ${h.total_price.toLocaleString()})</li>`).join('\n')
    : '<li>Run a search to view recommendations.</li>';

  const browseItems = browse.hits.length
    ? browse.hits.map(h => `<li><a href="${escapeHtml(buildUrl({ listing_id: h.listing_id }))}">${escapeHtml(h.title)}</a> (${escapeHtml(h.county)} / ${escapeHtml(h.property_type)} / NOK ${h.total_price.toLocaleString()})</li>`).join('\n')
    : '<li>No browse items.</li>';

  const selectedBlock = selectedDoc
    ? `<div><h3>Listing Detail</h3><p><strong>${escapeHtml(selectedDoc.title)}</strong></p><p>${escapeHtml(selectedDoc.county)} / ${escapeHtml(selectedDoc.municipality)} / ${escapeHtml(selectedDoc.property_type)}</p><p>Price: ${selectedDoc.total_price.toLocaleString()} | Bedrooms: ${selectedDoc.bedrooms} | Days on market: ${selectedDoc.days_on_market}</p></div>`
    : '<div><h3>Listing Detail</h3><p>Select a search result to inspect one listing in detail.</p></div>';

  const evalBaselines = state.evaluationSummary?.baselines || {};
  const hybridEval = evalBaselines.hybrid || {};

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Synthetic Real Estate Demo</title>
  <style>
    :root { --bg: #f6f1e8; --paper: #fffaf2; --ink: #1d2a2f; --accent: #155e63; --muted: #6a7478; --line: #d9cdb6; }
    body { margin: 0; font-family: Georgia, 'Iowan Old Style', serif; background: linear-gradient(135deg, #efe5d4, #f8f4ed); color: var(--ink); }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
    h1, h2, h3 { margin-bottom: 0.4rem; }
    p { color: var(--muted); }
    .hero { background: var(--paper); border: 1px solid var(--line); padding: 24px; border-radius: 18px; box-shadow: 0 18px 40px rgba(17,34,39,0.08); }
    .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-top: 18px; }
    .card { background: var(--paper); border: 1px solid var(--line); padding: 18px; border-radius: 16px; }
    form { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-top: 12px; }
    input, select { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: white; }
    select[multiple] { min-height: 80px; }
    button { padding: 10px 14px; border: none; border-radius: 10px; background: var(--accent); color: white; cursor: pointer; }
    ul { padding-left: 20px; }
    .two-col { display: grid; gap: 18px; grid-template-columns: 1.2fr 0.8fr; margin-top: 18px; }
    @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Synthetic Real Estate Search Demo</h1>
      <p>Privacy-safe, reproducible prototype for synthetic inventory, behavior, search, discovery, and evaluation. (Node.js / Hono / SQLite port)</p>
      <form method="get">
        <input type="text" name="q" placeholder="Search query" value="${escapeHtml(queryText)}">
        <select name="county" multiple title="County (hold Ctrl/⌘ to select multiple)">
          ${Object.keys(state.listingsSummary.by_county).sort().map(c =>
            `<option value="${escapeHtml(c)}"${counties.includes(c) ? ' selected' : ''}>${escapeHtml(c)}</option>`
          ).join('')}
        </select>
        <input type="text" name="property_type" placeholder="Property type" value="${escapeHtml(propertyType)}">
        <input type="number" name="max_price" placeholder="Max price" value="${escapeHtml(maxPrice)}">
        <button type="submit">Search</button>
      </form>
    </section>

    <section class="grid">
      <div class="card"><h3>Dataset</h3><p>${state.listingsSummary.listing_count} listings</p><p>Avg price: ${Math.round(state.listingsSummary.average_total_price).toLocaleString()}</p></div>
      <div class="card"><h3>Privacy</h3><p>${state.privacySummary.listing_count} checked</p><p>${state.privacySummary.warnings.length} warnings</p></div>
      <div class="card"><h3>Evaluation</h3><p>Hybrid NDCG@10: ${hybridEval.ndcg_at_10 ?? 'n/a'}</p><p>Hybrid Recall@10: ${hybridEval.recall_at_10 ?? 'n/a'}</p></div>
      <div class="card"><h3>Latency</h3><p>Search total ms: ${searchResponse.latency_breakdown?.total_ms ?? 'n/a'}</p><p>Facet groups: ${Object.keys(searchResponse.facets || {}).join(', ') || 'n/a'}</p></div>
    </section>

    <section class="two-col">
      <div class="card">
        <h2>Search Results</h2>
        <ul>${resultItems}</ul>
      </div>
      <div class="card">
        ${selectedBlock}
      </div>
    </section>

    <section class="grid">
      <div class="card"><h2>Similar Listings</h2><ul>${similarItems}</ul></div>
      <div class="card"><h2>Recommended For This Search</h2><ul>${recommendationItems}</ul></div>
      <div class="card"><h2>Browse: Family Upgraders</h2><ul>${browseItems}</ul></div>
    </section>
  </main>
</body>
</html>`;
}

/**
 * Creates the frontend sub-application serving the HTML demo page at GET /.
 * @param {Object} state - Application state from buildDemoState.
 * @returns {Hono}
 */
export function createFrontendRouter(state) {
  const app = new Hono();
  app.get('/', c => {
    const params = new URL(c.req.url, 'http://localhost').searchParams;
    return new Response(renderHomePage(state, params), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  return app;
}
