/**
 * A bounded set that remembers the most recent keys in insertion order. Adding a key that is
 * already present changes nothing; adding past the capacity evicts the oldest key first.
 */
export function createSeenTracker(capacity = 1000): {
  has(key: string): boolean;
  add(key: string): void;
} {
  const seen = new Set<string>();
  const order: string[] = [];

  function add(key: string): void {
    if (seen.has(key)) return;

    seen.add(key);
    order.push(key);

    while (order.length > capacity) {
      const oldest = order.shift();
      if (oldest !== undefined) seen.delete(oldest);
    }
  }

  return { has: (key) => seen.has(key), add };
}
