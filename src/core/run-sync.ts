import {
  columnOrder,
  dropPlacement,
  READY_COLUMN,
  type BoardDocument,
  type Placement,
} from './board';
import { startsAgent } from './start';
import type { RuleTrigger } from './rules';

/** The run events the board itself can follow, whatever the agent reports. */
export type RunState = 'running' | 'waiting' | 'succeeded' | 'failed' | 'interrupted';

/** Where a card sits and who put it there, as the sync reads it. */
export type SyncPlacement = {
  readonly columnId: string;
  readonly source: Placement['source'];
  readonly pinned: boolean;
};

/** The state a server event means for the card, including the replies that have no rule trigger. */
export function runStateOfEvent(type: string): RunState | undefined {
  switch (type) {
    case 'session.execution.started':
      return 'running';
    case 'permission.asked':
    case 'form.created':
      return 'waiting';
    // The agent carries on once the user answers, so the card belongs back in the working column.
    case 'permission.replied':
    case 'form.replied':
    case 'form.cancelled':
      return 'running';
    case 'session.execution.succeeded':
      return 'succeeded';
    case 'session.execution.failed':
      return 'failed';
    case 'session.execution.interrupted':
      return 'interrupted';
    default:
      return undefined;
  }
}

/** Only run events move a card here: creation, idle time, and the tick stay with rules. */
export function runStateFor(trigger: RuleTrigger): RunState | undefined {
  switch (trigger) {
    case 'status.running':
      return 'running';
    case 'waiting.permission':
    case 'waiting.form':
      return 'waiting';
    case 'run.succeeded':
      return 'succeeded';
    case 'run.failed':
      return 'failed';
    case 'run.interrupted':
      return 'interrupted';
    default:
      return undefined;
  }
}

/**
 * The column a run state belongs in. A run that finishes without the agent moving the card lands
 * in Ready to deploy: the server knows the work stopped, not whether it is deployed, so Done stays
 * the agent's or the user's call.
 */
export function syncTarget(
  board: BoardDocument,
  state: RunState,
  placement: SyncPlacement,
): string | undefined {
  const from = placement.columnId;
  const exists = (id: string): string | undefined =>
    board.columns.some((column) => column.id === id) ? id : undefined;

  switch (state) {
    case 'running': {
      const start = [...board.columns]
        .sort((left, right) => left.order - right.order)
        .find((column) => startsAgent(column));
      return start && start.id !== from ? start.id : undefined;
    }
    case 'waiting':
      return exists('waiting') === from ? undefined : exists('waiting');
    case 'failed':
    case 'interrupted':
      return exists('failed') === from ? undefined : exists('failed');
    case 'succeeded': {
      // A card the agent or a person moved out of the working column stays: they know more than
      // the event does. A card the sync parked in In review for a question comes back to the queue.
      const starting = board.columns.find((column) => column.id === from);
      const working = starting !== undefined && startsAgent(starting);
      const parked = from === 'waiting' && placement.source === 'auto';
      if (!working && !parked) return undefined;
      return exists(READY_COLUMN) === from ? undefined : exists(READY_COLUMN);
    }
  }
}

/**
 * Moves a board-placed card to follow its run. A card the user moved or pinned is left alone, and a
 * card the user never placed on the board is not touched.
 */
export function applyRunSync(
  board: BoardDocument,
  sessionKey: string,
  state: RunState,
  now: number,
): BoardDocument {
  const placement: Placement | undefined = board.placements[sessionKey];
  if (!placement) return board;
  if (placement.pinned || placement.source === 'manual') return board;

  const target = syncTarget(board, state, placement);
  if (!target || target === placement.columnId) return board;

  return dropPlacement(board, {
    sessionKey,
    columnId: target,
    index: columnOrder(board, target).length,
    source: 'auto',
    updatedAt: now,
  }).board;
}
