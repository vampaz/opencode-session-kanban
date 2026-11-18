import { describe, expect, it } from 'vitest';

import { defaultBoard, removeColumn } from './board';
import { planSort, type SortSubject } from './sort';

function subject(overrides: Partial<SortSubject> = {}): SortSubject {
  return {
    sessionKey: 'sidecar\nses_1',
    status: 'idle',
    placed: false,
    pinned: false,
    ran: true,
    ...overrides,
  };
}

describe('planSort', () => {
  it('maps each state to its default column', () => {
    const plan = planSort(defaultBoard(), [
      subject({ sessionKey: 'sidecar\nses_running', status: 'running' }),
      subject({ sessionKey: 'sidecar\nses_waiting', status: 'waiting' }),
      subject({ sessionKey: 'sidecar\nses_failed', status: 'failed' }),
      subject({ sessionKey: 'sidecar\nses_interrupted', status: 'interrupted' }),
      subject({ sessionKey: 'sidecar\nses_ready', status: 'idle', ran: true }),
    ]);

    expect(plan.moves).toEqual([
      { sessionKey: 'sidecar\nses_running', columnId: 'in-progress' },
      { sessionKey: 'sidecar\nses_waiting', columnId: 'waiting' },
      { sessionKey: 'sidecar\nses_failed', columnId: 'failed' },
      { sessionKey: 'sidecar\nses_interrupted', columnId: 'failed' },
      { sessionKey: 'sidecar\nses_ready', columnId: 'ready' },
    ]);
    expect(plan.counts).toEqual([
      { columnId: 'in-progress', count: 1 },
      { columnId: 'waiting', count: 1 },
      { columnId: 'ready', count: 1 },
      { columnId: 'failed', count: 2 },
    ]);
  });

  it('leaves a session that never ran unplaced', () => {
    expect(planSort(defaultBoard(), [subject({ ran: false })])).toEqual({
      moves: [],
      counts: [],
    });
  });

  it('never touches placed or pinned cards', () => {
    const plan = planSort(defaultBoard(), [
      subject({ sessionKey: 'sidecar\nses_placed', placed: true, status: 'running' }),
      subject({ sessionKey: 'sidecar\nses_pinned', pinned: true, status: 'waiting' }),
      subject({ sessionKey: 'sidecar\nses_free', status: 'running' }),
    ]);

    expect(plan.moves).toEqual([{ sessionKey: 'sidecar\nses_free', columnId: 'in-progress' }]);
    expect(plan.counts).toEqual([{ columnId: 'in-progress', count: 1 }]);
  });

  it('skips a target column that was deleted', () => {
    const board = removeColumn(defaultBoard(), 'in-progress');
    const plan = planSort(board, [subject({ status: 'running' })]);

    expect(plan.moves).toEqual([]);
    expect(plan.counts).toEqual([]);
  });

  it('reports counts in column order', () => {
    const plan = planSort(defaultBoard(), [
      subject({ sessionKey: 'sidecar\nses_a', status: 'waiting' }),
      subject({ sessionKey: 'sidecar\nses_b', status: 'running' }),
      subject({ sessionKey: 'sidecar\nses_c', status: 'running' }),
    ]);

    expect(plan.counts).toEqual([
      { columnId: 'in-progress', count: 2 },
      { columnId: 'waiting', count: 1 },
    ]);
  });
});
