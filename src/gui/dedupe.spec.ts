import { describe, expect, it } from 'vitest';

import { createSeenTracker } from './dedupe';

describe('createSeenTracker', () => {
  it('adds keys and reports them seen', () => {
    const tracker = createSeenTracker();

    tracker.add('a');

    expect(tracker.has('a')).toBe(true);
    expect(tracker.has('b')).toBe(false);
  });

  it('dedupes repeated keys', () => {
    const tracker = createSeenTracker(2);

    tracker.add('a');
    tracker.add('a');
    tracker.add('b');

    expect(tracker.has('a')).toBe(true);
    expect(tracker.has('b')).toBe(true);
  });

  it('evicts the oldest key past capacity', () => {
    const tracker = createSeenTracker(2);

    tracker.add('a');
    tracker.add('b');
    tracker.add('c');

    expect(tracker.has('a')).toBe(false);
    expect(tracker.has('b')).toBe(true);
    expect(tracker.has('c')).toBe(true);
  });
});
