import {
  FAILED_COLUMN,
  IN_PROGRESS_COLUMN,
  READY_COLUMN,
  WAITING_COLUMN,
  type BoardDocument,
} from './board';
import type { CardStatus } from './status';

/** What the one-time sort reads about a session. Placed and pinned cards are never moved. */
export type SortSubject = {
  readonly sessionKey: string;
  readonly status: CardStatus;
  readonly placed: boolean;
  readonly pinned: boolean;
  /** The session has completed a run before. */
  readonly ran: boolean;
};

export type SortMove = { readonly sessionKey: string; readonly columnId: string };
export type SortCount = { readonly columnId: string; readonly count: number };
export type SortPlan = {
  readonly moves: readonly SortMove[];
  readonly counts: readonly SortCount[];
};

/** Which default column a state belongs in, or undefined to leave the card unplaced. */
function targetFor(subject: SortSubject): string | undefined {
  switch (subject.status) {
    case 'waiting':
      return WAITING_COLUMN;
    case 'running':
      return IN_PROGRESS_COLUMN;
    case 'failed':
    case 'interrupted':
      return FAILED_COLUMN;
    case 'idle':
      // Finished work waits for the deploy; Done means deployed.
      return subject.ran ? READY_COLUMN : undefined;
  }
}

/**
 * The one-time sort: unplaced cards follow their state, everything else is left alone. A session
 * that never ran stays unplaced, and a target column that no longer exists removes its moves.
 */
export function planSort(board: BoardDocument, subjects: readonly SortSubject[]): SortPlan {
  const moves: SortMove[] = [];
  const counts = new Map<string, number>();

  for (const subject of subjects) {
    if (subject.placed || subject.pinned) continue;

    const columnId = targetFor(subject);
    if (!columnId || !board.columns.some((column) => column.id === columnId)) continue;

    moves.push({ sessionKey: subject.sessionKey, columnId });
    counts.set(columnId, (counts.get(columnId) ?? 0) + 1);
  }

  const ordered = [...board.columns]
    .sort((left, right) => left.order - right.order)
    .filter((column) => counts.has(column.id))
    .map((column) => ({ columnId: column.id, count: counts.get(column.id)! }));

  return { moves, counts: ordered };
}
