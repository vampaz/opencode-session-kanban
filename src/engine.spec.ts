import { afterEach, describe, expect, it } from 'vitest';

import { ACTIVITY_KEY } from './activity';
import {
  BACKLOG_COLUMN,
  WAITING_COLUMN,
  commitBoard,
  defaultBoard,
  dropPlacement,
  type BoardDocument,
} from './core/board';
import { ENGINE_LEADER_KEY } from './core/leader';
import {
  INFLIGHT_KEY,
  PENDING_CREATE_KEY,
  beginBoardCreate,
  endBoardCreate,
  markBoardCreate,
} from './core/pending-create';
import type { Rule } from './core/rules';
import { sessionKeyOf } from './core/session-ref';
import { runIdleTick, startEngine, waitForPlacement, type EnginePorts } from './engine';
import { createFakeContext, fakeSession, type FakeContext } from './testing/fake-context';

const CREATED_RULE: Rule = {
  id: 'created',
  name: 'New work waits for review',
  enabled: true,
  priority: 0,
  trigger: ['created'],
  match: 'all',
  conditions: [],
  actions: [{ type: 'move', toColumn: WAITING_COLUMN }],
  overrideManual: false,
  cooldownMs: 0,
};

const IDLE_RULE: Rule = {
  ...CREATED_RULE,
  id: 'idle',
  name: 'Stale work waits for review',
  trigger: ['idle.for'],
};

function createdEvent(sessionID: string) {
  return { type: 'session.created', id: `created:${sessionID}`, data: { sessionID } };
}

function boardWith(rule: Rule, extra: Partial<BoardDocument> = {}): BoardDocument {
  return { ...defaultBoard(), rules: [rule], ...extra };
}

function recorder() {
  const changed: number[] = [];
  const notified: string[] = [];
  const ports: EnginePorts = {
    changed: async (revision) => {
      changed.push(revision);
    },
    notify: async (payload) => {
      notified.push(payload.id);
    },
  };

  return { ports, changed, notified };
}

async function seed(fake: FakeContext, sessionID: string): Promise<void> {
  await commitBoard(
    fake.ctx.storage,
    (board) =>
      dropPlacement(board, {
        sessionKey: sessionKeyOf(sessionID),
        columnId: BACKLOG_COLUMN,
        index: 0,
        source: 'auto',
        updatedAt: Date.now(),
      }).board,
  );
}

afterEach(() => {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  delete holder[ACTIVITY_KEY];
  delete holder[PENDING_CREATE_KEY];
  delete holder[INFLIGHT_KEY];
  delete holder[ENGINE_LEADER_KEY];
});

describe('created events', () => {
  it('waits for a board create placement before the created rule runs', async () => {
    const fake = createFakeContext({ sessions: [fakeSession({ id: 'ses_created' })] });
    await fake.writeBoard(boardWith(CREATED_RULE));
    markBoardCreate('ses_created');

    let resolveChanged!: () => void;
    const changedOnce = new Promise<void>((resolve) => {
      resolveChanged = resolve;
    });
    const stop = startEngine(fake.ctx, {
      changed: async () => resolveChanged(),
      notify: async () => undefined,
    });

    try {
      fake.emit(createdEvent('ses_created'));

      // The board create commits its placement after the event, as createInColumn does.
      setTimeout(() => {
        void seed(fake, 'ses_created');
      }, 30);

      await changedOnce;

      const board = await fake.board();
      expect(board.placements[sessionKeyOf('ses_created')]?.columnId).toBe(WAITING_COLUMN);
    } finally {
      stop();
      fake.closeEvents();
    }
  });

  it('waits for the placement when a create is in flight but the mark is not set yet', async () => {
    const fake = createFakeContext({ sessions: [fakeSession({ id: 'ses_early' })] });
    await fake.writeBoard(boardWith(CREATED_RULE));
    // The event is handled before the create response, so only the in-flight count is visible.
    beginBoardCreate();

    let resolveChanged!: () => void;
    const changedOnce = new Promise<void>((resolve) => {
      resolveChanged = resolve;
    });
    const stop = startEngine(fake.ctx, {
      changed: async () => resolveChanged(),
      notify: async () => undefined,
    });

    try {
      fake.emit(createdEvent('ses_early'));

      setTimeout(() => {
        void seed(fake, 'ses_early');
      }, 30);

      await changedOnce;

      const board = await fake.board();
      expect(board.placements[sessionKeyOf('ses_early')]?.columnId).toBe(WAITING_COLUMN);
    } finally {
      endBoardCreate();
      stop();
      fake.closeEvents();
    }
  });

  it('handles an unmarked created event without polling the board', async () => {
    const fake = createFakeContext({ sessions: [fakeSession({ id: 'ses_plain' })] });
    await fake.writeBoard(boardWith(CREATED_RULE));

    let resolveChanged!: () => void;
    const changedOnce = new Promise<void>((resolve) => {
      resolveChanged = resolve;
    });
    const stop = startEngine(fake.ctx, {
      changed: async () => resolveChanged(),
      notify: async () => undefined,
    });

    try {
      const before = fake.stats.gets;
      fake.emit(createdEvent('ses_plain'));
      await changedOnce;
      const reads = fake.stats.gets - before;

      const board = await fake.board();
      expect(board.placements[sessionKeyOf('ses_plain')]?.columnId).toBe(WAITING_COLUMN);
      // One read for the event, one for the commit, and one read-back: no placement polling.
      expect(reads).toBeLessThan(10);
    } finally {
      stop();
      fake.closeEvents();
    }
  });
});

describe('waitForPlacement', () => {
  it('returns as soon as the placement exists', async () => {
    const fake = createFakeContext({ sessions: [fakeSession({ id: 'ses_1' })] });
    await seed(fake, 'ses_1');

    await expect(
      waitForPlacement(fake.ctx.storage, sessionKeyOf('ses_1'), { capMs: 20, stepMs: 5 }),
    ).resolves.toBe(true);
  });

  it('stops at the cap and reports no placement', async () => {
    const fake = createFakeContext();

    const started = Date.now();
    const found = await waitForPlacement(fake.ctx.storage, sessionKeyOf('ses_missing'), {
      capMs: 20,
      stepMs: 5,
    });

    expect(found).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('idle tick', () => {
  it('moves every matching subject in one write and one changed emission', async () => {
    const fake = createFakeContext({
      sessions: [fakeSession({ id: 'ses_1' }), fakeSession({ id: 'ses_2' })],
    });
    await fake.writeBoard(boardWith(IDLE_RULE));
    const { ports, changed, notified } = recorder();

    await runIdleTick(fake.ctx, ports);

    expect(changed).toEqual([1]);
    expect(notified).toHaveLength(2);
    expect(fake.stats.sets).toBe(2);

    const board = await fake.board();
    expect(board.placements[sessionKeyOf('ses_1')]?.columnId).toBe(WAITING_COLUMN);
    expect(board.placements[sessionKeyOf('ses_2')]?.columnId).toBe(WAITING_COLUMN);
  });

  it('writes nothing on a second tick in the same bucket', async () => {
    const fake = createFakeContext({
      sessions: [fakeSession({ id: 'ses_1' }), fakeSession({ id: 'ses_2' })],
    });
    await fake.writeBoard(boardWith(IDLE_RULE));
    const { ports, changed } = recorder();
    await runIdleTick(fake.ctx, ports);

    const writes = fake.stats.sets;
    await runIdleTick(fake.ctx, ports);

    expect(fake.stats.sets).toBe(writes);
    expect(changed).toEqual([1]);
  });

  it('sends no notify when the board setting is off', async () => {
    const fake = createFakeContext({ sessions: [fakeSession({ id: 'ses_1' })] });
    await fake.writeBoard(
      boardWith(IDLE_RULE, {
        settings: { ...defaultBoard().settings, notifyOnRuleMove: false },
      }),
    );
    const { ports, notified } = recorder();

    await runIdleTick(fake.ctx, ports);

    expect(notified).toEqual([]);
  });

  it('writes nothing when no session matches', async () => {
    const fake = createFakeContext({ sessions: [fakeSession({ id: 'ses_1' })] });
    await fake.writeBoard(
      boardWith({
        ...IDLE_RULE,
        conditions: [{ type: 'title', op: 'contains', value: 'nothing matches this' }],
      }),
    );
    const { ports, changed, notified } = recorder();

    await runIdleTick(fake.ctx, ports);

    expect(changed).toEqual([]);
    expect(notified).toEqual([]);
    expect(fake.stats.sets).toBe(1);
  });

  it('returns early when no enabled rule watches idle.for', async () => {
    const fake = createFakeContext({ sessions: [fakeSession({ id: 'ses_1' })] });
    await fake.writeBoard(defaultBoard());
    const { ports, changed } = recorder();

    await runIdleTick(fake.ctx, ports);

    expect(changed).toEqual([]);
    expect(fake.stats.sets).toBe(1);
  });
});
