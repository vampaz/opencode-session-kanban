import type { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  BOARD_LOCK_KEY,
  BOARD_VERSION,
  DEFAULT_COLUMNS,
  REBALANCE_STEP,
  clearPlacement,
  columnOrder,
  commitBoard,
  defaultBoard,
  dropPlacement,
  movePlacement,
  parseBoard,
  pinPlacement,
  positionBetween,
  prunePlacements,
  readBoard,
  rebalanceColumn,
  removeColumn,
  type BoardDocument,
  type BoardStorage,
  type Placement,
} from './board';

function createStorage(initial?: Schema.Json) {
  let stored = initial;
  let writes = 0;

  const storage: BoardStorage = {
    async get() {
      return stored;
    },
    async set(_key, value) {
      stored = value;
      writes += 1;
    },
  };

  return {
    storage,
    get value() {
      return stored;
    },
    get writes() {
      return writes;
    },
  };
}

function placementAt(position: number): Placement {
  return {
    columnId: 'backlog',
    position,
    source: 'manual',
    pinned: false,
    ruleID: null,
    updatedAt: 0,
    lastRuleEventID: null,
    task: null,
  };
}

describe('DEFAULT_COLUMNS', () => {
  it('holds the settled default columns in order', () => {
    expect(DEFAULT_COLUMNS.map((column) => column.title)).toEqual([
      'Backlog',
      'In progress',
      'Waiting',
      'Done',
      'Failed',
    ]);
  });

  it('uses unique ids and a stable order', () => {
    expect(new Set(DEFAULT_COLUMNS.map((column) => column.id)).size).toBe(DEFAULT_COLUMNS.length);
    expect(DEFAULT_COLUMNS.map((column) => column.order)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('defaultBoard', () => {
  it('starts empty at revision 0 with the default columns', () => {
    const board = defaultBoard();

    expect(board.version).toBe(BOARD_VERSION);
    expect(board.revision).toBe(0);
    expect(board.columns).toBe(DEFAULT_COLUMNS);
    expect(board.defaultColumn).toBe('backlog');
    expect(board.placements).toEqual({});
    expect(board.rules).toEqual([]);
  });
});

describe('positionBetween', () => {
  it('centres a drop between two neighbours', () => {
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(1024, 2048)).toBe(1536);
  });

  it('places at either end', () => {
    expect(positionBetween(undefined, 3)).toBe(2);
    expect(positionBetween(3, undefined)).toBe(4);
    expect(positionBetween(undefined, undefined)).toBe(0);
  });
});

describe('movePlacement', () => {
  it('writes a manual placement and leaves the input alone', () => {
    const board = defaultBoard();
    const moved = movePlacement(board, {
      sessionKey: 'sidecar\nses_1',
      columnId: 'review',
      position: 1536.5,
      updatedAt: 1763000000000,
    });

    expect(moved.placements['sidecar\nses_1']).toEqual({
      columnId: 'review',
      position: 1536.5,
      source: 'manual',
      pinned: false,
      ruleID: null,
      updatedAt: 1763000000000,
      lastRuleEventID: null,
      task: null,
    });
    expect(board.placements).toEqual({});
    expect(moved.revision).toBe(board.revision);
  });

  it('keeps a queued task when the card moves', () => {
    const placed = boardWith({ columnId: 'backlog', source: 'auto', task: 'Fix the tests.' });

    const moved = movePlacement(placed, {
      sessionKey: 'sidecar\nses_1',
      columnId: 'done',
      position: 2,
      updatedAt: 5,
    });

    expect(moved.placements['sidecar\nses_1']?.task).toBe('Fix the tests.');
  });

  it('keeps a pin and clears a rule when a person moves the card', () => {
    const placed = boardWith({
      columnId: 'failed',
      source: 'rule',
      pinned: true,
    });

    const moved = movePlacement(placed, {
      sessionKey: 'sidecar\nses_1',
      columnId: 'done',
      position: 2,
      updatedAt: 2,
    });

    expect(moved.placements['sidecar\nses_1']).toMatchObject({
      columnId: 'done',
      position: 2,
      source: 'manual',
      pinned: true,
      ruleID: null,
      lastRuleEventID: null,
    });
  });

  it('replaces a placement instead of duplicating it', () => {
    const board = boardWith({ columnId: 'backlog' });
    const moved = movePlacement(board, {
      sessionKey: 'sidecar\nses_1',
      columnId: 'done',
      position: 9,
      updatedAt: 3,
    });

    expect(Object.keys(moved.placements)).toEqual(['sidecar\nses_1']);
    expect(moved.placements['sidecar\nses_1']?.columnId).toBe('done');
  });
});

describe('readBoard', () => {
  it('starts from the default document when the key is missing', async () => {
    const { storage } = createStorage();

    expect(await readBoard(storage)).toEqual(defaultBoard());
  });

  it('round-trips a committed document', async () => {
    const { storage } = createStorage();
    await commitBoard(storage, (board) =>
      movePlacement(board, {
        sessionKey: 'sidecar\nses_1',
        columnId: 'done',
        position: 0,
        updatedAt: 1,
      }),
    );

    const stored = await readBoard(storage);
    expect(stored.revision).toBe(1);
    expect(stored.placements['sidecar\nses_1']?.columnId).toBe('done');
  });

  it('refuses a document from a newer version', () => {
    expect(() => parseBoard({ ...defaultBoard(), version: BOARD_VERSION + 1 })).toThrowError(
      /Unsupported board version/,
    );
  });

  it('drops the legacy collapsed column field on read and on the next write', async () => {
    const legacy = defaultBoard();
    const store = createStorage({
      ...legacy,
      columns: legacy.columns.map((column) => ({ ...column, collapsed: true })),
    });

    const board = await readBoard(store.storage);
    expect(board.columns).toHaveLength(legacy.columns.length);
    for (const column of board.columns) expect(Object.hasOwn(column, 'collapsed')).toBe(false);

    await commitBoard(store.storage, (current) => ({ ...current, defaultColumn: 'done' }));
    expect(JSON.stringify(store.value)).not.toContain('collapsed');
  });

  it('normalizes a document from before the two-way fields', async () => {
    const modern = defaultBoard();
    const legacy = {
      ...modern,
      columns: modern.columns.map(({ id, title, order, color }) => ({ id, title, order, color })),
      placements: {
        'sidecar\nses_1': {
          columnId: 'done',
          position: 0,
          source: 'agent',
          pinned: false,
          ruleID: null,
          updatedAt: 1,
          lastRuleEventID: null,
        },
      },
      settings: {
        showSubagents: false,
        archived: 'hide',
        idleMinutes: 10,
        notifyOnRuleMove: true,
      },
    };

    const board = await readBoard(createStorage(legacy).storage);
    expect(board.columns.find((column) => column.id === 'in-progress')?.startAgent).toBe(true);
    expect(board.columns.find((column) => column.id === 'backlog')?.startAgent).toBe(false);
    expect(board.columns.every((column) => column.startPrompt === null)).toBe(true);
    expect(board.placements['sidecar\nses_1']?.task).toBeNull();
    expect(board.placements['sidecar\nses_1']?.source).toBe('agent');
    expect(board.settings.agentUpdatesCard).toBe(true);
  });

  it('refuses a malformed placement', () => {
    expect(() =>
      parseBoard({ ...defaultBoard(), placements: { 'sidecar\nses_1': { columnId: 1 } } }),
    ).toThrowError(/invalid placement/);
  });
});

describe('commitBoard', () => {
  it('writes once and bumps the revision', async () => {
    const store = createStorage();

    const board = await commitBoard(store.storage, (current) => ({
      ...current,
      defaultColumn: 'done',
    }));

    expect(store.writes).toBe(1);
    expect(board.revision).toBe(1);
    expect((await readBoard(store.storage)).defaultColumn).toBe('done');
  });

  it('skips the write when the mutation changes nothing', async () => {
    const store = createStorage();

    const board = await commitBoard(store.storage, (current) => current);

    expect(store.writes).toBe(0);
    expect(board.revision).toBe(0);
  });

  it('retries when another instance wrote first', async () => {
    const inner = createStorage();
    let meddle = true;
    const racing: BoardStorage = {
      get: inner.storage.get,
      async set(key, value) {
        await inner.storage.set(key, value);
        if (meddle) {
          meddle = false;
          const other = await inner.storage.get(key);
          await inner.storage.set(key, { ...(other as object), revision: 99 } as Schema.Json);
        }
      },
    };

    const board = await commitBoard(racing, (current) => ({
      ...current,
      defaultColumn: 'waiting',
    }));

    expect(board.revision).toBe(100);
    expect(inner.writes).toBe(3);
  });

  it('gives up after the attempt limit', async () => {
    const inner = createStorage();
    const racing: BoardStorage = {
      get: inner.storage.get,
      async set(key, value) {
        await inner.storage.set(key, value);
        const other = await inner.storage.get(key);
        await inner.storage.set(key, { ...(other as object), revision: 99 } as Schema.Json);
      },
    };

    await expect(
      commitBoard(racing, (current) => ({ ...current, defaultColumn: 'waiting' }), {
        attempts: 2,
      }),
    ).rejects.toThrowError(/2 write attempts/);
  });
});

function boardWith(placement: Partial<Placement> & { columnId: string }): BoardDocument {
  const board = defaultBoard();
  return {
    ...board,
    placements: {
      'sidecar\nses_1': { ...placementAt(1), ...placement },
    },
  };
}

describe('commitBoard under concurrency', () => {
  it('serializes writers so no update is lost', async () => {
    const inner = createStorage();
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const slow: BoardStorage = {
      async get(key) {
        await tick();
        return inner.storage.get(key);
      },
      async set(key, value) {
        await tick();
        await inner.storage.set(key, value);
      },
    };

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        commitBoard(slow, (board) =>
          movePlacement(board, {
            sessionKey: `sidecar\nses_${index}`,
            columnId: 'in-progress',
            position: index,
            updatedAt: index,
          }),
        ),
      ),
    );

    const stored = await readBoard(inner.storage);
    expect(Object.keys(stored.placements)).toHaveLength(10);
    expect(stored.revision).toBe(10);
  });

  it('publishes its lock on globalThis under a registered symbol', async () => {
    await commitBoard(createStorage().storage, (board) => board);

    expect(BOARD_LOCK_KEY).toBe(Symbol.for('opencode-session-kanban.board-lock'));
    expect((globalThis as unknown as Record<symbol, unknown>)[BOARD_LOCK_KEY]).toBeDefined();
  });
});

describe('dropPlacement', () => {
  function boardWithCards(...positions: number[]): BoardDocument {
    const placements: Record<string, Placement> = {};
    positions.forEach((position, index) => {
      placements[`sidecar\nses_${index}`] = { ...placementAt(position), columnId: 'done' };
    });
    return { ...defaultBoard(), placements };
  }

  it('writes the midpoint between the neighbours', () => {
    const board = boardWithCards(0, 10);
    const result = dropPlacement(board, {
      sessionKey: 'sidecar\nnew',
      columnId: 'done',
      index: 1,
      updatedAt: 1,
    });

    expect(result.rebalanced).toBe(false);
    expect(result.board.placements['sidecar\nnew']?.position).toBe(5);
    expect(columnOrder(result.board, 'done').map((card) => card.key)).toEqual([
      'sidecar\nses_0',
      'sidecar\nnew',
      'sidecar\nses_1',
    ]);
  });

  it('places at either end and clamps the index', () => {
    const board = boardWithCards(0, 10);

    const first = dropPlacement(board, {
      sessionKey: 'sidecar\nfirst',
      columnId: 'done',
      index: -4,
      updatedAt: 1,
    });
    expect(first.board.placements['sidecar\nfirst']?.position).toBe(-1);

    const last = dropPlacement(board, {
      sessionKey: 'sidecar\nlast',
      columnId: 'done',
      index: 99,
      updatedAt: 1,
    });
    expect(last.board.placements['sidecar\nlast']?.position).toBe(11);
  });

  it('keeps the moved card out of its own neighbour list', () => {
    const board = boardWithCards(0, 10, 20);
    const result = dropPlacement(board, {
      sessionKey: 'sidecar\nses_0',
      columnId: 'done',
      index: 2,
      updatedAt: 1,
    });

    expect(columnOrder(result.board, 'done').map((card) => card.key)).toEqual([
      'sidecar\nses_1',
      'sidecar\nses_2',
      'sidecar\nses_0',
    ]);
  });

  it('rebalances when the gap collapses, then places the card', () => {
    const board = boardWithCards(0, 1e-9, 2e-9);
    const result = dropPlacement(board, {
      sessionKey: 'sidecar\nnew',
      columnId: 'done',
      index: 1,
      updatedAt: 1,
    });

    expect(result.rebalanced).toBe(true);
    expect(
      columnOrder(result.board, 'done')
        .filter((card) => card.key !== 'sidecar\nnew')
        .map((card) => card.position),
    ).toEqual([0, REBALANCE_STEP, REBALANCE_STEP * 2]);
    expect(result.board.placements['sidecar\nnew']?.position).toBe(REBALANCE_STEP / 2);
  });
});

describe('rebalanceColumn', () => {
  it('spaces the column evenly and leaves other columns alone', () => {
    const board: BoardDocument = {
      ...defaultBoard(),
      placements: {
        'sidecar\na': { ...placementAt(0.1), columnId: 'done' },
        'sidecar\nb': { ...placementAt(0.2), columnId: 'done' },
        'sidecar\nc': { ...placementAt(7), columnId: 'failed' },
      },
    };

    const rebalanced = rebalanceColumn(board, 'done');
    expect(rebalanced.placements['sidecar\na']?.position).toBe(0);
    expect(rebalanced.placements['sidecar\nb']?.position).toBe(REBALANCE_STEP);
    expect(rebalanced.placements['sidecar\nc']?.position).toBe(7);
  });

  it('returns the same document when the column is already spaced', () => {
    const board: BoardDocument = {
      ...defaultBoard(),
      placements: { 'sidecar\na': { ...placementAt(0), columnId: 'done' } },
    };

    expect(rebalanceColumn(board, 'done')).toBe(board);
    expect(rebalanceColumn(defaultBoard(), 'done')).toEqual(defaultBoard());
  });
});

describe('pinPlacement', () => {
  it('pins an existing placement without moving it', () => {
    const board = boardWith({ columnId: 'done', position: 5 });
    const pinned = pinPlacement(board, 'sidecar\nses_1', true, 9);

    expect(pinned.placements['sidecar\nses_1']).toMatchObject({
      columnId: 'done',
      position: 5,
      pinned: true,
      updatedAt: 9,
    });
  });

  it('creates a placement in the default column for an unplaced session', () => {
    const board = defaultBoard();
    const pinned = pinPlacement(board, 'sidecar\nses_1', true, 3);

    expect(pinned.placements['sidecar\nses_1']).toMatchObject({
      columnId: 'backlog',
      pinned: true,
      source: 'manual',
    });
  });

  it('does nothing when unpinning an unplaced session', () => {
    const board = defaultBoard();

    expect(pinPlacement(board, 'sidecar\nses_1', false, 2)).toBe(board);
  });

  it('returns the same document when the pin already matches', () => {
    const board = boardWith({ columnId: 'done', pinned: true });

    expect(pinPlacement(board, 'sidecar\nses_1', true, 9)).toBe(board);
    expect(pinPlacement(board, 'sidecar\nmissing', true, 9)).not.toBe(board);
  });
});

describe('clearPlacement', () => {
  it('removes the placement and nothing else', () => {
    const board = boardWith({ columnId: 'done' });
    const cleared = clearPlacement(board, 'sidecar\nses_1');

    expect(cleared.placements).toEqual({});
    expect(clearPlacement(cleared, 'sidecar\nses_1')).toBe(cleared);
  });
});

describe('removeColumn', () => {
  it('moves its cards to the default column in order', () => {
    const board: BoardDocument = {
      ...defaultBoard(),
      placements: {
        'sidecar\na': { ...placementAt(1), columnId: 'done' },
        'sidecar\nb': { ...placementAt(2), columnId: 'done' },
        'sidecar\nc': { ...placementAt(0), columnId: 'backlog' },
      },
    };

    const removed = removeColumn(board, 'done');
    expect(removed.columns.some((column) => column.id === 'done')).toBe(false);
    expect(columnOrder(removed, 'backlog').map((card) => card.key)).toEqual([
      'sidecar\nc',
      'sidecar\na',
      'sidecar\nb',
    ]);
  });

  it('adopts a new default column and never removes the last one', () => {
    const board: BoardDocument = { ...defaultBoard(), defaultColumn: 'done' };
    const removed = removeColumn(board, 'done');

    expect(removed.defaultColumn).toBe('backlog');
    expect(removed.columns).toHaveLength(DEFAULT_COLUMNS.length - 1);

    const single: BoardDocument = { ...defaultBoard(), columns: [DEFAULT_COLUMNS[0]!] };
    expect(removeColumn(single, 'backlog')).toBe(single);
  });

  it('ignores an unknown column', () => {
    const board = defaultBoard();
    expect(removeColumn(board, 'nope')).toBe(board);
  });
});

describe('prunePlacements', () => {
  it('removes only the placements the caller reports', () => {
    const board: BoardDocument = {
      ...defaultBoard(),
      placements: {
        'sidecar\ngone': { ...placementAt(0), columnId: 'done' },
        'sidecar\nkept': { ...placementAt(1), columnId: 'done' },
      },
    };

    const result = prunePlacements(board, (key) => key.endsWith('gone'));
    expect(result.keys).toEqual(['sidecar\ngone']);
    expect(Object.keys(result.board.placements)).toEqual(['sidecar\nkept']);
  });

  it('returns the same document when nothing is prunable', () => {
    const board = defaultBoard();
    expect(prunePlacements(board, () => false)).toEqual({ board, keys: [] });
  });
});
