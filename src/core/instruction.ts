import type { BoardDocument, Column } from './board';

/** Marks the instruction part this plugin adds, so every instance in the process adds it once. */
export const INSTRUCTION_KEY = 'kanban.board-instruction';

export type SystemText = {
  readonly type: 'text';
  readonly text: string;
  readonly metadata?: Record<string, unknown>;
};

/** The default role of each settled column, used to describe the mapping to the agent. */
const ROLES: readonly { readonly id: string; readonly state: string }[] = [
  { id: 'in-progress', state: 'starting work' },
  { id: 'waiting', state: 'blocked on the user' },
  { id: 'done', state: 'finished' },
  { id: 'failed', state: 'failed or unable to continue' },
];

function label(column: Column): string {
  return `"${column.title}" (${column.id})`;
}

/**
 * The short board instruction added to a card session's model requests. It names the card's
 * current column, every column, and the state-to-column mapping, and it uses the live titles.
 */
export function boardInstruction(board: BoardDocument, columnId: string): string {
  const columns = [...board.columns].sort((left, right) => left.order - right.order);
  const current =
    columns.find((column) => column.id === columnId) ??
    columns.find((column) => column.id === board.defaultColumn) ??
    columns[0];
  const fallback = columns.find((column) => column.id === board.defaultColumn) ?? columns[0];

  const roles = ROLES.flatMap((role) => {
    const column = columns.find((candidate) => candidate.id === role.id);
    return column ? [`${role.state} → ${label(column)}`] : [];
  });
  if (fallback) roles.push(`anything else → ${label(fallback)}`);

  const lines = [
    current
      ? `This session is a card on the session board, in the column ${label(current)}.`
      : 'This session is a card on the session board.',
    `Columns: ${columns.map(label).join(', ')}.`,
    roles.length > 0
      ? `Call kanban_move with sessionID "me" only when your state changes: ${roles.join('; ')}. Do not move when your card is already in the right column.`
      : 'Call kanban_move with sessionID "me" only when your state changes, and not when your card is already in the right column.',
    "Do not move other sessions' cards unless the user asks.",
  ];

  return lines.join('\n');
}

/** Whether this request already carries the board instruction, from this or another instance. */
export function hasInstruction(system: readonly SystemText[]): boolean {
  return system.some((part) => part.metadata?.[INSTRUCTION_KEY] === true);
}

/** Adds the instruction once per request; returns false when it was already present. */
export function appendInstruction(system: SystemText[], text: string): boolean {
  if (hasInstruction(system)) return false;
  system.push({ type: 'text', text, metadata: { [INSTRUCTION_KEY]: true } });
  return true;
}
