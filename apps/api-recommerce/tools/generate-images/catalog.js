// Reads the item catalogue from the service's public HTTP API (the OpenAPI contract).
// The tool never imports service code.

/**
 * Fetches all active items from a running api-recommerce instance.
 * @param {string} apiBase - e.g. http://localhost:3003
 * @param {{ concurrency?: number, onProgress?: (done: number, total: number) => void }} [options]
 * @returns {Promise<Object[]>}
 */
export async function fetchCatalog(apiBase, { concurrency = 16, onProgress } = {}) {
  const health = await getJson(`${apiBase}/health`, { allowStatus: [503] });
  if (health.status !== 'ok') {
    throw new Error(`Service at ${apiBase} is not ready yet (status: ${health.status}). Wait for "Demo state ready." and retry.`);
  }

  const { listing_ids: ids } = await getJson(`${apiBase}/api/sitemap`);
  const items = new Array(ids.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < ids.length) {
      const index = next++;
      items[index] = await getJson(`${apiBase}/api/items/${encodeURIComponent(ids[index])}`);
      done++;
      if (onProgress && (done % 250 === 0 || done === ids.length)) onProgress(done, ids.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return items;
}

async function getJson(url, { allowStatus = [] } = {}) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Could not reach ${url} (${err.cause?.code ?? err.message}). Is the service running?`);
  }
  if (!res.ok && !allowStatus.includes(res.status)) {
    throw new Error(`GET ${url} failed with ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}
