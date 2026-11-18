import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INFLIGHT_KEY,
  PENDING_CREATE_KEY,
  PENDING_CREATE_TTL_MS,
  beginBoardCreate,
  boardCreatesInFlight,
  consumeBoardCreate,
  endBoardCreate,
  markBoardCreate,
} from './pending-create';

afterEach(() => {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  delete holder[PENDING_CREATE_KEY];
  delete holder[INFLIGHT_KEY];
  vi.useRealTimers();
});

describe('board create marks', () => {
  it('consumes a mark once', () => {
    markBoardCreate('ses_1');

    expect(consumeBoardCreate('ses_1')).toBe(true);
    expect(consumeBoardCreate('ses_1')).toBe(false);
  });

  it('reports a session that was never marked', () => {
    expect(consumeBoardCreate('ses_other')).toBe(false);
  });

  it('expires a mark older than the ttl and deletes it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    markBoardCreate('ses_old');

    vi.setSystemTime(PENDING_CREATE_TTL_MS + 1);

    expect(consumeBoardCreate('ses_old')).toBe(false);
    expect(consumeBoardCreate('ses_old')).toBe(false);
  });

  it('keeps a mark inside the ttl', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    markBoardCreate('ses_fresh');

    vi.setSystemTime(PENDING_CREATE_TTL_MS);

    expect(consumeBoardCreate('ses_fresh')).toBe(true);
  });

  it('drops a stale mark when the next create marks another session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    markBoardCreate('ses_stale');

    vi.setSystemTime(PENDING_CREATE_TTL_MS + 1);
    markBoardCreate('ses_next');

    const entries = (globalThis as unknown as Record<symbol, Map<string, unknown> | undefined>)[
      PENDING_CREATE_KEY
    ];

    expect(entries?.has('ses_stale')).toBe(false);
    expect(entries?.has('ses_next')).toBe(true);
  });
});

describe('in-flight creates', () => {
  it('counts creates between begin and end', () => {
    expect(boardCreatesInFlight()).toBe(0);

    beginBoardCreate();
    beginBoardCreate();
    expect(boardCreatesInFlight()).toBe(2);

    endBoardCreate();
    expect(boardCreatesInFlight()).toBe(1);

    endBoardCreate();
    expect(boardCreatesInFlight()).toBe(0);
  });

  it('never goes below zero', () => {
    endBoardCreate();
    expect(boardCreatesInFlight()).toBe(0);
  });
});
