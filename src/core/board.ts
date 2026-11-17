import type { Schema } from 'effect';

import type { Rule } from './rules';

/** Bumped only when a stored document needs a migration. */
export const BOARD_VERSION = 1;

/** The single storage key. One board per server, across every project. */
export const BOARD_KEY = 'board';

/** A write retries when another instance replaced the document first. */
export const MAX_WRITE_ATTEMPTS = 5;

/** The settled default set. Written to a fresh document and editable afterwards. */
export const DEFAULT_COLUMNS: readonly Column[] = [
  { id: 'backlog', title: 'Backlog', order: 0, color: null, collapsed: false },
  { id: 'in-progress', title: 'In progress', order: 1, color: null, collapsed: false },
  { id: 'waiting', title: 'Waiting', order: 2, color: null, collapsed: false },
  { id: 'done', title: 'Done', order: 3, color: null, collapsed: false },
  { id: 'failed', title: 'Failed', order: 4, color: null, collapsed: false },
];

export type Column = {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly color: string | null;
  readonly collapsed: boolean;
};

export type PlacementSource = 'manual' | 'rule' | 'auto';

export type Placement = {
  readonly columnId: string;
  readonly position: number;
  readonly source: PlacementSource;
  readonly pinned: boolean;
  readonly ruleID: string | null;
  readonly updatedAt: number;
  readonly lastRuleEventID: string | null;
};

export type BoardSettings = {
  readonly showSubagents: boolean;
  readonly archived: 'hide' | 'column';
  readonly idleMinutes: number;
  readonly notifyOnRuleMove: boolean;
};

export const DEFAULT_SETTINGS: BoardSettings = {
  showSubagents: false,
  archived: 'hide',
  idleMinutes: 10,
  notifyOnRuleMove: true,
};

/**
 * The single stored document. A type alias, not an interface: plugin storage takes `Schema.Json`,
 * and only object types written as aliases get the implicit index signature it needs.
 * Placements are keyed by `SessionRef.key` (`<server id>\n<session id>`).
 */
export type BoardDocument = {
  readonly version: number;
  readonly revision: number;
  readonly columns: readonly Column[];
  readonly defaultColumn: string;
  readonly placements: Readonly<Record<string, Placement>>;
  readonly rules: readonly Rule[];
  readonly settings: BoardSettings;
};

export function defaultBoard(): BoardDocument {
  return {
    version: BOARD_VERSION,
    revision: 0,
    columns: DEFAULT_COLUMNS,
    defaultColumn: 'backlog',
    placements: {},
    rules: [],
    settings: DEFAULT_SETTINGS,
  };
}

export type MoveInput = {
  readonly sessionKey: string;
  readonly columnId: string;
  readonly position: number;
  readonly source?: PlacementSource;
  readonly updatedAt: number;
};

/** Applies one placement, without touching `revision`. A manual move clears the rule that placed it. */
export function movePlacement(board: BoardDocument, input: MoveInput): BoardDocument {
  const previous = board.placements[input.sessionKey];

  return {
    ...board,
    placements: {
      ...board.placements,
      [input.sessionKey]: {
        columnId: input.columnId,
        position: input.position,
        source: input.source ?? 'manual',
        pinned: previous?.pinned ?? false,
        ruleID: null,
        updatedAt: input.updatedAt,
        lastRuleEventID: null,
      },
    },
  };
}

/** A fractional position between two neighbours. Undefined means no neighbour on that side. */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** A column's placements, in display order. */
export type OrderedPlacement = { readonly key: string; readonly position: number };

export function columnOrder(
  board: BoardDocument,
  columnId: string,
  options: { readonly exclude?: string } = {},
): OrderedPlacement[] {
  return Object.entries(board.placements)
    .filter(([key, placement]) => placement.columnId === columnId && key !== options.exclude)
    .map(([key, placement]) => ({ key, position: placement.position }))
    .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key));
}

/** The spacing a rebalance writes. Fractions beyond it are lossless enough for any real column. */
export const REBALANCE_STEP = 1024;

/** Below this gap a midpoint is no longer distinguishable from its neighbours. */
export const MIN_POSITION_GAP = 1e-6;

/**
 * Rewrites a column's positions as `index * REBALANCE_STEP`. Only called when a midpoint would
 * collapse, so a normal drop writes one card.
 */
export function rebalanceColumn(board: BoardDocument, columnId: string): BoardDocument {
  const order = columnOrder(board, columnId);
  if (order.length === 0) return board;

  const placements = { ...board.placements };
  let changed = false;

  order.forEach((card, index) => {
    const placement = placements[card.key];
    const position = index * REBALANCE_STEP;
    if (placement && placement.position !== position) {
      placements[card.key] = { ...placement, position };
      changed = true;
    }
  });

  return changed ? { ...board, placements } : board;
}

export type DropInput = {
  readonly sessionKey: string;
  readonly columnId: string;
  /** The place among the column's other cards: 0 is first, the length is last. */
  readonly index: number;
  readonly source?: PlacementSource;
  readonly updatedAt: number;
};

export type DropResult = { readonly board: BoardDocument; readonly rebalanced: boolean };

/** Moves a card into a column at an index, rebalancing first when the neighbours are too close. */
export function dropPlacement(board: BoardDocument, input: DropInput): DropResult {
  const siblings = columnOrder(board, input.columnId, { exclude: input.sessionKey });
  const index = Math.max(0, Math.min(Math.trunc(input.index), siblings.length));
  const before = siblings[index - 1]?.position;
  const after = siblings[index]?.position;

  let working = board;
  let rebalanced = false;
  let position = positionBetween(before, after);

  if (collapsed(before, after, position)) {
    working = rebalanceColumn(board, input.columnId);
    rebalanced = true;
    const fresh = columnOrder(working, input.columnId, { exclude: input.sessionKey });
    position = positionBetween(fresh[index - 1]?.position, fresh[index]?.position);
  }

  return {
    board: movePlacement(working, {
      sessionKey: input.sessionKey,
      columnId: input.columnId,
      position,
      ...(input.source ? { source: input.source } : {}),
      updatedAt: input.updatedAt,
    }),
    rebalanced,
  };
}

function collapsed(
  before: number | undefined,
  after: number | undefined,
  position: number,
): boolean {
  if (before === undefined || after === undefined) return false;
  if (after - before < MIN_POSITION_GAP) return true;
  return position <= before || position >= after;
}

/** Pins or unpins a card. An unplaced card lands at the end of the default column. */
export function pinPlacement(
  board: BoardDocument,
  sessionKey: string,
  pinned: boolean,
  updatedAt: number,
): BoardDocument {
  const existing = board.placements[sessionKey];
  if (existing) {
    if (existing.pinned === pinned) return board;
    return {
      ...board,
      placements: { ...board.placements, [sessionKey]: { ...existing, pinned, updatedAt } },
    };
  }

  // Unpinning a card that has no placement changes nothing.
  if (!pinned) return board;

  const column =
    board.columns.find((candidate) => candidate.id === board.defaultColumn) ?? board.columns[0];
  if (!column) return board;

  const order = columnOrder(board, column.id);
  const position = order.length === 0 ? 0 : order[order.length - 1]!.position + 1;

  return {
    ...board,
    placements: {
      ...board.placements,
      [sessionKey]: {
        columnId: column.id,
        position,
        source: 'manual',
        pinned,
        ruleID: null,
        updatedAt,
        lastRuleEventID: null,
      },
    },
  };
}

/** Drops a card's manual placement, so it renders in the default column again. */
export function clearPlacement(board: BoardDocument, sessionKey: string): BoardDocument {
  if (!board.placements[sessionKey]) return board;

  const placements = { ...board.placements };
  delete placements[sessionKey];
  return { ...board, placements };
}

/** Deletes a column and appends its cards to the default column. The last column is never removed. */
export function removeColumn(board: BoardDocument, columnId: string): BoardDocument {
  const column = board.columns.find((candidate) => candidate.id === columnId);
  if (!column) return board;

  const fallback =
    board.columns.find(
      (candidate) => candidate.id === board.defaultColumn && candidate.id !== columnId,
    ) ?? board.columns.find((candidate) => candidate.id !== columnId);
  if (!fallback) return board;

  const moved = columnOrder(board, columnId);
  const target = columnOrder(board, fallback.id);
  let position = target.length === 0 ? 0 : target[target.length - 1]!.position + 1;

  const placements = { ...board.placements };
  for (const card of moved) {
    const placement = placements[card.key];
    if (!placement) continue;
    placements[card.key] = { ...placement, columnId: fallback.id, position };
    position += 1;
  }

  return {
    ...board,
    columns: board.columns.filter((candidate) => candidate.id !== columnId),
    defaultColumn: board.defaultColumn === columnId ? fallback.id : board.defaultColumn,
    placements,
  };
}

/** Removes the placements the caller reports as gone: deleted sessions, or an archived family. */
export function prunePlacements(
  board: BoardDocument,
  shouldPrune: (sessionKey: string) => boolean,
): { readonly board: BoardDocument; readonly keys: readonly string[] } {
  const keys = Object.keys(board.placements).filter((key) => shouldPrune(key));
  if (keys.length === 0) return { board, keys };

  const placements = { ...board.placements };
  for (const key of keys) delete placements[key];
  return { board: { ...board, placements }, keys };
}

export function upsertColumn(board: BoardDocument, column: Column): BoardDocument {
  const exists = board.columns.some((candidate) => candidate.id === column.id);
  const columns = exists
    ? board.columns.map((candidate) => (candidate.id === column.id ? column : candidate))
    : [...board.columns, column];

  return { ...board, columns: orderColumns(columns) };
}

export function reorderColumns(board: BoardDocument, ids: readonly string[]): BoardDocument {
  const order = new Map(ids.map((id, index) => [id, index]));
  const columns = board.columns.map((column) =>
    order.has(column.id) ? { ...column, order: order.get(column.id)! } : column,
  );

  return { ...board, columns: orderColumns(columns) };
}

function orderColumns(columns: readonly Column[]): Column[] {
  return [...columns].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

export function upsertRule(board: BoardDocument, rule: Rule): BoardDocument {
  const exists = board.rules.some((candidate) => candidate.id === rule.id);
  const rules = exists
    ? board.rules.map((candidate) => (candidate.id === rule.id ? rule : candidate))
    : [...board.rules, rule];

  return { ...board, rules };
}

export function removeRule(board: BoardDocument, ruleID: string): BoardDocument {
  if (!board.rules.some((candidate) => candidate.id === ruleID)) return board;
  return { ...board, rules: board.rules.filter((candidate) => candidate.id !== ruleID) };
}

export function reorderRules(board: BoardDocument, ids: readonly string[]): BoardDocument {
  const priority = new Map(ids.map((id, index) => [id, index]));

  return {
    ...board,
    rules: board.rules.map((rule) =>
      priority.has(rule.id) ? { ...rule, priority: priority.get(rule.id)! } : rule,
    ),
  };
}

export function updateSettings(board: BoardDocument, patch: Partial<BoardSettings>): BoardDocument {
  const settings: BoardSettings = { ...board.settings, ...patch };
  const unchanged = (Object.keys(settings) as (keyof BoardSettings)[]).every(
    (key) => settings[key] === board.settings[key],
  );

  return unchanged ? board : { ...board, settings };
}

/**
 * The board lock. Every location instance runs in the same server process, so one in-process
 * mutex serializes writes; `Symbol.for` shares it between separately loaded copies of this module.
 * The revision read-back in `commitBoard` stays as a second line of defence.
 */
export const BOARD_LOCK_KEY = Symbol.for('opencode-session-kanban.board-lock');

type LockState = { tail: Promise<void> };

function lockState(): LockState {
  const holder = globalThis as unknown as Record<symbol, LockState | undefined>;
  const existing = holder[BOARD_LOCK_KEY];
  if (existing) return existing;

  const created: LockState = { tail: Promise.resolve() };
  holder[BOARD_LOCK_KEY] = created;
  return created;
}

export async function withBoardLock<T>(task: () => Promise<T>): Promise<T> {
  const state = lockState();
  const previous = state.tail;
  let release!: () => void;
  state.tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

// The write guard needs only these two members, so tests can pass an in-memory stand-in.
export type BoardStorage = {
  get(key: string): Promise<Schema.Json | undefined>;
  set(key: string, value: Schema.Json): Promise<void>;
};

export type BoardMutation = (board: BoardDocument) => BoardDocument;

/**
 * Serializes the read, apply, write step across every instance in this process, then keeps the
 * revision read-back as a second line of defence. Storage has no compare-and-set.
 */
export function commitBoard(
  storage: BoardStorage,
  mutate: BoardMutation,
  options: { readonly attempts?: number } = {},
): Promise<BoardDocument> {
  return withBoardLock(() => commitUnlocked(storage, mutate, options));
}

async function commitUnlocked(
  storage: BoardStorage,
  mutate: BoardMutation,
  options: { readonly attempts?: number },
): Promise<BoardDocument> {
  const attempts = options.attempts ?? MAX_WRITE_ATTEMPTS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await readBoard(storage);
    const changed = mutate(current);
    if (changed === current) return current;

    const next: BoardDocument = { ...changed, revision: current.revision + 1 };
    await storage.set(BOARD_KEY, next);
    const stored = await readBoard(storage);
    if (stored.revision === next.revision) return next;
  }

  throw new Error(`The board changed during ${attempts} write attempts. Try again.`);
}

export async function readBoard(storage: BoardStorage): Promise<BoardDocument> {
  const stored = await storage.get(BOARD_KEY);
  if (stored === undefined || stored === null) return defaultBoard();
  return parseBoard(stored);
}

/** Rejects a document this version cannot read instead of overwriting it. */
export function parseBoard(value: unknown): BoardDocument {
  if (!isRecord(value)) throw new Error('The stored board is not an object.');
  if (value.version !== BOARD_VERSION) {
    throw new Error(
      `Unsupported board version ${String(value.version)}. Expected ${BOARD_VERSION}.`,
    );
  }
  if (typeof value.revision !== 'number') throw new Error('The stored board has no revision.');
  if (!Array.isArray(value.columns) || !value.columns.every(isColumn)) {
    throw new Error('The stored board has invalid columns.');
  }
  if (typeof value.defaultColumn !== 'string') {
    throw new Error('The stored board has no default column.');
  }
  if (!isRecord(value.placements)) {
    throw new Error('The stored board has invalid placements.');
  }
  for (const placement of Object.values(value.placements)) {
    if (!isPlacement(placement)) throw new Error('The stored board has an invalid placement.');
  }
  if (!Array.isArray(value.rules)) throw new Error('The stored board has invalid rules.');
  if (!isSettings(value.settings)) throw new Error('The stored board has invalid settings.');

  return value as unknown as BoardDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColumn(value: unknown): value is Column {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.order === 'number' &&
    (typeof value.color === 'string' || value.color === null) &&
    typeof value.collapsed === 'boolean'
  );
}

function isPlacement(value: unknown): value is Placement {
  return (
    isRecord(value) &&
    typeof value.columnId === 'string' &&
    typeof value.position === 'number' &&
    (value.source === 'manual' || value.source === 'rule' || value.source === 'auto') &&
    typeof value.pinned === 'boolean' &&
    (typeof value.ruleID === 'string' || value.ruleID === null) &&
    typeof value.updatedAt === 'number' &&
    (typeof value.lastRuleEventID === 'string' || value.lastRuleEventID === null)
  );
}

function isSettings(value: unknown): value is BoardSettings {
  return (
    isRecord(value) &&
    typeof value.showSubagents === 'boolean' &&
    (value.archived === 'hide' || value.archived === 'column') &&
    typeof value.idleMinutes === 'number' &&
    typeof value.notifyOnRuleMove === 'boolean'
  );
}
