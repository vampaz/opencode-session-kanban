import { afterEach, describe, expect, it, vi } from 'vitest';

import { IDLE_TICK_KEY, subscribeIdleTick } from './tick';

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as Record<symbol, unknown>)[IDLE_TICK_KEY];
});

describe('subscribeIdleTick', () => {
  it('elects one interval for every subscriber and clears it when the last leaves', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();

    const offFirst = subscribeIdleTick(first, 1_000);
    const offSecond = subscribeIdleTick(second, 1_000);

    vi.advanceTimersByTime(1_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    offFirst();
    vi.advanceTimersByTime(1_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    offSecond();
    vi.advanceTimersByTime(1_000);
    expect(second).toHaveBeenCalledTimes(2);
    expect((globalThis as unknown as Record<symbol, unknown>)[IDLE_TICK_KEY]).toBeUndefined();
  });

  it('starts a fresh tick after the last subscriber leaves', () => {
    vi.useFakeTimers();
    const run = vi.fn();

    const off = subscribeIdleTick(run, 1_000);
    off();
    const again = subscribeIdleTick(run, 1_000);

    vi.advanceTimersByTime(1_000);
    expect(run).toHaveBeenCalledTimes(1);
    again();
  });
});
