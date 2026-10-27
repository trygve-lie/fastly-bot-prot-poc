/**
 * Returns the k best items in order, using a bounded binary heap: O(n log k) instead of sorting all n.
 * `compare(a, b)` must be a total order (< 0 when a ranks before b); the result equals
 * `[...items].sort(compare).slice(0, k)`.
 * @template T
 * @param {Iterable<T>} items
 * @param {number} k
 * @param {function(T, T): number} compare
 * @returns {T[]}
 */
export function selectTop(items, k, compare) {
  if (k <= 0) return [];
  const heap = []; // heap[0] is the worst of the kept items
  const worse = (a, b) => compare(a, b) > 0;
  const siftUp = i => {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!worse(heap[i], heap[parent])) break;
      [heap[i], heap[parent]] = [heap[parent], heap[i]];
      i = parent;
    }
  };
  const siftDown = i => {
    for (;;) {
      const left = 2 * i + 1, right = left + 1;
      let worst = i;
      if (left < heap.length && worse(heap[left], heap[worst])) worst = left;
      if (right < heap.length && worse(heap[right], heap[worst])) worst = right;
      if (worst === i) return;
      [heap[i], heap[worst]] = [heap[worst], heap[i]];
      i = worst;
    }
  };
  for (const item of items) {
    if (heap.length < k) {
      heap.push(item);
      siftUp(heap.length - 1);
    } else if (compare(item, heap[0]) < 0) {
      heap[0] = item;
      siftDown(0);
    }
  }
  return heap.sort(compare);
}
