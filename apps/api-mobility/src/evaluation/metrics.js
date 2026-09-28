/**
 * Computes Discounted Cumulative Gain at rank k.
 * @param {number[]} relevances - Relevance scores in ranked order.
 * @param {number} k - Cutoff rank.
 * @returns {number}
 */
function dcgAtK(relevances, k) {
  let dcg = 0;
  for (let i = 0; i < Math.min(relevances.length, k); i++) {
    dcg += (Math.pow(2, relevances[i]) - 1) / Math.log2(i + 2);
  }
  return dcg;
}

/**
 * Computes Normalized DCG at rank k.
 * @param {Object.<string, number>} relevanceById - Map of listing_id to relevance score.
 * @param {string[]} rankedIds - Ranked list of listing IDs.
 * @param {number} k - Cutoff rank.
 * @returns {number}
 */
export function ndcgAtK(relevanceById, rankedIds, k) {
  const gains = rankedIds.slice(0, k).map(id => relevanceById[id] || 0);
  const ideal = Object.values(relevanceById).sort((a, b) => b - a);
  const idealDcg = dcgAtK(ideal, k);
  if (idealDcg === 0) return 0.0;
  return dcgAtK(gains, k) / idealDcg;
}

/**
 * Computes Recall at rank k.
 * @param {Object.<string, number>} relevanceById - Map of listing_id to relevance score.
 * @param {string[]} rankedIds - Ranked list of listing IDs.
 * @param {number} k - Cutoff rank.
 * @returns {number}
 */
export function recallAtK(relevanceById, rankedIds, k) {
  const relevantIds = new Set(Object.entries(relevanceById).filter(([, r]) => r > 0).map(([id]) => id));
  if (!relevantIds.size) return 0.0;
  const retrieved = rankedIds.slice(0, k).filter(id => relevantIds.has(id));
  return retrieved.length / relevantIds.size;
}

/**
 * Computes Mean Reciprocal Rank (1 / rank of first relevant result).
 * @param {Object.<string, number>} relevanceById - Map of listing_id to relevance score.
 * @param {string[]} rankedIds - Ranked list of listing IDs.
 * @returns {number}
 */
export function reciprocalRank(relevanceById, rankedIds) {
  for (let i = 0; i < rankedIds.length; i++) {
    if ((relevanceById[rankedIds[i]] || 0) > 0) return 1 / (i + 1);
  }
  return 0.0;
}
