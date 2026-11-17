import type { Rule } from './rules';

/** Bumped only when a stored document needs a migration. */
export const BOARD_VERSION = 1;

/** The settled default set. Written to a fresh document and editable afterwards. */
export const DEFAULT_COLUMNS: readonly Column[] = [
  { id: 'backlog', title: 'Backlog', order: 0, color: null, collapsed: false },
  { id: 'in-progress', title: 'In progress', order: 1, color: null, collapsed: false },
  { id: 'waiting', title: 'Waiting', order: 2, color: null, collapsed: false },
  { id: 'done', title: 'Done', order: 3, color: null, collapsed: false },
  { id: 'failed', title: 'Failed', order: 4, color: null, collapsed: false },
];

export interface Column {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly color: string | null;
  readonly collapsed: boolean;
}

export type PlacementSource = 'manual' | 'rule' | 'auto';

export interface Placement {
  readonly columnId: string;
  readonly position: number;
  readonly source: PlacementSource;
  readonly pinned: boolean;
  readonly ruleID: string | null;
  readonly updatedAt: number;
  readonly lastRuleEventID: string | null;
}

export interface BoardSettings {
  readonly showSubagents: boolean;
  readonly archived: 'hide' | 'column';
  readonly idleMinutes: number;
  readonly notifyOnRuleMove: boolean;
}

/** The single stored document. Placements are keyed by `SessionRef.key`. */
export interface BoardDocument {
  readonly version: number;
  readonly revision: number;
  readonly columns: readonly Column[];
  readonly defaultColumn: string;
  readonly placements: Readonly<Record<string, Placement>>;
  readonly rules: readonly Rule[];
  readonly settings: BoardSettings;
}
