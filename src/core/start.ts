import type { Column, PlacementSource } from './board';

/** Sent to a session that has already run when its column sets no start message. */
export const DEFAULT_START_PROMPT = 'Continue with this task.';

/** Legacy columns default by id: `in-progress` starts the agent, the others do not. */
export function startsAgent(column: {
  readonly id: string;
  readonly startAgent?: boolean;
}): boolean {
  return column.startAgent ?? column.id === 'in-progress';
}

/** The message a continuing session receives: the column's own, or the built-in default. */
export function startMessage(column: Column): string {
  const prompt = column.startPrompt?.trim();
  return prompt ? prompt : DEFAULT_START_PROMPT;
}

/** What a user move into a starting column sends, if anything. */
export type StartDecision =
  | { readonly kind: 'task'; readonly text: string }
  | { readonly kind: 'continue'; readonly text: string }
  | { readonly kind: 'none' };

export type StartFacts = {
  readonly source: PlacementSource;
  /** The column the card rendered in before the move. */
  readonly from: string;
  readonly column: Column;
  /** A task queued on the placement before the move. */
  readonly task: string | null;
  readonly running: boolean;
  readonly waiting: boolean;
  /** The session has completed a run before. */
  readonly ran: boolean;
};

/**
 * Only a user move into a different starting column starts an agent. A queued task wins over the
 * continuation message, and a session that never ran is only placed.
 */
export function decideStart(facts: StartFacts): StartDecision {
  if (facts.source !== 'manual') return { kind: 'none' };
  if (facts.from === facts.column.id) return { kind: 'none' };
  if (!startsAgent(facts.column)) return { kind: 'none' };
  if (facts.running || facts.waiting) return { kind: 'none' };

  const task = facts.task?.trim();
  if (task) return { kind: 'task', text: task };
  if (!facts.ran) return { kind: 'none' };
  return { kind: 'continue', text: startMessage(facts.column) };
}

/** What a New session task does in its column: run now, wait on the placement, or neither. */
export type CreateDecision = { readonly send: boolean; readonly queue: boolean };

export function decideCreate(column: Column, task: string | null | undefined): CreateDecision {
  const text = task?.trim();
  if (!text) return { send: false, queue: false };
  return startsAgent(column) ? { send: true, queue: false } : { send: false, queue: true };
}
