import { afterEach, describe, expect, it } from 'vitest';

import { ENGINE_LEADER_KEY, electEngine } from './leader';

type State = { owner?: unknown; waiters: Map<symbol, unknown> };

function state(): State {
  return (globalThis as unknown as Record<symbol, State>)[ENGINE_LEADER_KEY]!;
}

afterEach(() => {
  delete (globalThis as unknown as Record<symbol, State | undefined>)[ENGINE_LEADER_KEY];
});

describe('electEngine', () => {
  it('starts one engine and hands over when its signal aborts', () => {
    const starts: string[] = [];
    const cleanups: string[] = [];
    const first = new AbortController();
    const second = new AbortController();

    electEngine(first.signal, () => {
      starts.push('first');
      return () => cleanups.push('first');
    });
    electEngine(second.signal, () => {
      starts.push('second');
      return () => cleanups.push('second');
    });

    expect(starts).toEqual(['first']);

    first.abort();
    expect(cleanups).toEqual(['first']);
    expect(starts).toEqual(['first', 'second']);

    second.abort();
    expect(cleanups).toEqual(['first', 'second']);
    expect(state().owner).toBeUndefined();
  });

  it('does not start a waiter that leaves before its turn', () => {
    const first = new AbortController();
    const second = new AbortController();

    electEngine(first.signal, () => () => undefined);
    const release = electEngine(second.signal, () => {
      throw new Error('the second engine must not start');
    });

    release();
    first.abort();

    expect(state().owner).toBeUndefined();
    expect(state().waiters.size).toBe(0);
  });

  it('ignores a signal that is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    let started = false;

    electEngine(controller.signal, () => {
      started = true;
      return () => undefined;
    });

    expect(started).toBe(false);
    expect(
      (globalThis as unknown as Record<symbol, State | undefined>)[ENGINE_LEADER_KEY],
    ).toBeUndefined();
  });
});
