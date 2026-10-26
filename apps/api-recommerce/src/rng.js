// Mulberry32 seeded PRNG — deterministic, same sequence for same seed

/**
 * @typedef {Object} Rng
 * @property {function(): number} random - Returns a uniform float in [0, 1).
 * @property {function(number, number): number} randint - Returns a random integer in [a, b].
 * @property {function(number, number): number} uniform - Returns a uniform float in [a, b).
 * @property {function(Array): *} choice - Returns one random element from an array.
 * @property {function(Array, number[], number): Array} choices - Returns k weighted random picks.
 * @property {function(Array, number): Array} sample - Returns k items without replacement.
 */

/**
 * Creates a seeded pseudo-random number generator (Mulberry32).
 * @param {number} seed - Integer seed value.
 * @returns {Rng}
 */
export function createRng(seed) {
  let s = seed >>> 0;

  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    random: () => next(),

    /**
     * Returns a random integer in the inclusive range [a, b].
     * @param {number} a
     * @param {number} b
     * @returns {number}
     */
    randint(a, b) {
      return Math.floor(next() * (b - a + 1)) + a;
    },

    /**
     * Returns a uniform float in [a, b).
     * @param {number} a
     * @param {number} b
     * @returns {number}
     */
    uniform(a, b) {
      return a + next() * (b - a);
    },

    /**
     * Returns one random element from arr.
     * @param {Array} arr
     * @returns {*}
     */
    choice(arr) {
      return arr[Math.floor(next() * arr.length)];
    },

    /**
     * Returns k weighted random picks (with replacement).
     * @param {Array} arr
     * @param {number[]} weights
     * @param {number} [k=1]
     * @returns {Array}
     */
    choices(arr, weights, k = 1) {
      const total = weights.reduce((a, b) => a + b, 0);
      const result = [];
      for (let i = 0; i < k; i++) {
        let r = next() * total;
        let idx = arr.length - 1;
        let cumulative = 0;
        for (let j = 0; j < arr.length; j++) {
          cumulative += weights[j];
          if (r < cumulative) {
            idx = j;
            break;
          }
        }
        result.push(arr[idx]);
      }
      return result;
    },

    /**
     * Returns k items sampled without replacement (Fisher-Yates).
     * @param {Array} arr
     * @param {number} k
     * @returns {Array}
     */
    sample(arr, k) {
      const copy = [...arr];
      const n = Math.min(k, copy.length);
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(next() * (copy.length - i));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, n);
    },
  };
}
