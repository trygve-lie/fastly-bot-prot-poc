// In-memory LRU cache for computed search/discovery results. The data never changes while the service
// runs, so entries don't expire; time-dependent fields (published_at) are added after the lookup.
const MAX_KEY_LENGTH = 2000; // don't cache unusually large request bodies

/**
 * Creates a least-recently-used cache.
 * @param {number} maxEntries
 * @returns {{ getOrCompute: function(string, function(): *): { value: *, hit: boolean }, size: function(): number }}
 */
export function createResponseCache(maxEntries) {
  const entries = new Map(); // insertion order = recency order

  /**
   * Returns the cached value for key, or computes, stores and returns it.
   * @param {string} key
   * @param {function(): *} compute
   * @returns {{ value: *, hit: boolean }}
   */
  function getOrCompute(key, compute) {
    if (entries.has(key)) {
      const value = entries.get(key);
      entries.delete(key);
      entries.set(key, value);
      return { value, hit: true };
    }
    const value = compute();
    if (key.length <= MAX_KEY_LENGTH) {
      entries.set(key, value);
      if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    }
    return { value, hit: false };
  }

  return { getOrCompute, size: () => entries.size };
}
