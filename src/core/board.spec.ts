import type { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  BOARD_VERSION,
  DEFAULT_COLUMNS,
  commitBoard,
  defaultBoard,
  movePlacement,
  parseBoard,
  positionBetween,
  readBoard,
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
    });
    expect(board.placements).toEqual({});
    expect(moved.revision).toBe(board.revision);
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
