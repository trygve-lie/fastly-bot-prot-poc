import { createHash } from 'node:crypto';

/**
 * @typedef {Object} EmbeddingService
 * @property {function(string): number[]} embedText - Embeds text to a normalised float vector.
 * @property {function(number[], number[]): number} cosineSimilarity - Dot-product of two pre-normalised vectors.
 */

/**
 * Creates a deterministic hash-based embedding service (no ML model required).
 * @param {{ embedding_dimensions: number }} searchConfig
 * @returns {EmbeddingService}
 */
export function createEmbeddingService(searchConfig) {
  const dimensions = searchConfig.embedding_dimensions;

  /**
   * Embeds text to a normalised fixed-dimension float vector (a SHA-256 hash, cheap enough not to cache).
   * @param {string} text
   * @returns {number[]}
   */
  function embedText(text) {
    const normalized = (text || '').trim().toLowerCase();
    if (!normalized) return new Array(dimensions).fill(0);
    const digest = createHash('sha256').update(normalized, 'utf-8').digest();
    const vector = new Array(dimensions);
    for (let i = 0; i < dimensions; i++) {
      const byte = digest[i % digest.length];
      vector[i] = (byte / 255.0) * 2.0 - 1.0;
    }
    return normalize(vector);
  }

  /**
   * L2-normalises a vector in place and returns it.
   * @param {number[]} values
   * @returns {number[]}
   */
  function normalize(values) {
    const magnitude = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) || 1.0;
    return values.map(v => v / magnitude);
  }

  /**
   * Computes the cosine similarity of two pre-normalised vectors.
   * @param {number[]} left
   * @param {number[]} right
   * @returns {number}
   */
  function cosineSimilarity(left, right) {
    // Plain loop: called once per candidate on every search, and much faster than reduce().
    let sum = 0;
    for (let i = 0; i < left.length; i++) sum += left[i] * right[i];
    return sum;
  }

  return { embedText, cosineSimilarity };
}
