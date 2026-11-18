import { describe, expect, it } from 'vitest';

import { defaultBoard, removeColumn, type BoardDocument } from './board';
import {
  INSTRUCTION_KEY,
  appendInstruction,
  boardInstruction,
  hasInstruction,
  type SystemText,
} from './instruction';

describe('boardInstruction', () => {
  it('names the current column, every column, and the state mapping', () => {
    const text = boardInstruction(defaultBoard(), 'waiting');

    expect(text).toContain('in the column "Waiting" (waiting)');
    expect(text).toContain('"Backlog" (backlog)');
    expect(text).toContain('"In progress" (in-progress)');
    expect(text).toContain('starting work → "In progress" (in-progress)');
    expect(text).toContain('blocked on the user → "Waiting" (waiting)');
    expect(text).toContain('finished → "Done" (done)');
    expect(text).toContain('failed or unable to continue → "Failed" (failed)');
    expect(text).toContain('anything else → "Backlog" (backlog)');
    expect(text).toContain('kanban_move');
    expect(text).toContain('sessionID "me"');
  });

  it('uses the live titles of renamed columns', () => {
    const board = defaultBoard();
    const renamed: BoardDocument = {
      ...board,
      columns: board.columns.map((column) =>
        column.id === 'in-progress' ? { ...column, title: 'Building' } : column,
      ),
    };

    expect(boardInstruction(renamed, 'in-progress')).toContain('starting work → "Building"');
  });

  it('omits a role whose column was deleted and falls back to the default', () => {
    const board = removeColumn(defaultBoard(), 'failed');
    const text = boardInstruction(board, 'nope');

    expect(text).not.toContain('failed or unable to continue');
    expect(text).toContain('in the column "Backlog" (backlog)');
    expect(text).toContain('anything else → "Backlog" (backlog)');
  });
});

describe('appendInstruction', () => {
  it('adds the instruction once and marks it', () => {
    const system: SystemText[] = [];

    expect(appendInstruction(system, 'first')).toBe(true);
    expect(appendInstruction(system, 'second')).toBe(false);
    expect(system).toHaveLength(1);
    expect(system[0]?.text).toBe('first');
    expect(system[0]?.metadata?.[INSTRUCTION_KEY]).toBe(true);
    expect(hasInstruction(system)).toBe(true);
  });

  it('sees an instruction another instance added', () => {
    const system: SystemText[] = [
      { type: 'text', text: 'other', metadata: { [INSTRUCTION_KEY]: true } },
    ];

    expect(hasInstruction(system)).toBe(true);
    expect(appendInstruction(system, 'mine')).toBe(false);
  });

  it('ignores unrelated system parts', () => {
    const system: SystemText[] = [{ type: 'text', text: 'core instructions' }];

    expect(hasInstruction(system)).toBe(false);
    expect(appendInstruction(system, 'mine')).toBe(true);
    expect(system).toHaveLength(2);
  });
});
