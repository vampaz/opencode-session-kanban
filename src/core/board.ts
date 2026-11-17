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

// The write guard needs only these two members, so tests can pass an in-memory stand-in.
export type BoardStorage = {
  get(key: string): Promise<Schema.Json | undefined>;
  set(key: string, value: Schema.Json): Promise<void>;
};

export type BoardMutation = (board: BoardDocument) => BoardDocument;

/**
 * Reads the document, applies `mutate`, and writes only if no other instance wrote meanwhile.
 * Storage has no compare-and-set, so the guard is a read-back: a revision that differs means a
 * competing write and the whole step is retried from a fresh read.
 */
export async function commitBoard(
  storage: BoardStorage,
  mutate: BoardMutation,
  options: { readonly attempts?: number } = {},
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
