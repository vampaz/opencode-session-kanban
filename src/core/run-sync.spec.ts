import { describe, expect, it } from 'vitest';

import { defaultBoard, dropPlacement, type BoardDocument, type Column } from './board';
import { applyRunSync, runStateFor, runStateOfEvent, syncTarget } from './run-sync';

const key = 'sidecar\nses_1';

function placed(
  columnId: string,
  placement: {
    readonly pinned?: boolean;
    readonly source?: 'manual' | 'auto' | 'agent' | 'rule';
  } = {},
): BoardDocument {
  const board = defaultBoard();
  return {
    ...board,
    placements: {
      [key]: {
        columnId,
        position: 0,
        source: placement.source ?? 'auto',
        pinned: placement.pinned ?? false,
        ruleID: null,
        updatedAt: 1,
        lastRuleEventID: null,
        task: null,
      },
    },
  };
}

function at(columnId: string, source: 'manual' | 'auto' | 'agent' | 'rule' = 'auto') {
  return { columnId, source, pinned: false } as const;
}

function column(overrides: Partial<Column>): Column {
  return {
    id: 'custom',
    title: 'Custom',
    order: 9,
    color: null,
    startAgent: false,
    startPrompt: null,
    ...overrides,
  };
}

describe('runStateFor', () => {
  it('maps only run events', () => {
    expect(runStateFor('status.running')).toBe('running');
    expect(runStateFor('waiting.permission')).toBe('waiting');
    expect(runStateFor('waiting.form')).toBe('waiting');
    expect(runStateFor('run.succeeded')).toBe('succeeded');
    expect(runStateFor('run.failed')).toBe('failed');
    expect(runStateFor('run.interrupted')).toBe('interrupted');
    expect(runStateFor('created')).toBeUndefined();
    expect(runStateFor('status.idle')).toBeUndefined();
    expect(runStateFor('idle.for')).toBeUndefined();
  });
});

describe('runStateOfEvent', () => {
  it('reads the run events and the answers that resume a run', () => {
    expect(runStateOfEvent('session.execution.started')).toBe('running');
    expect(runStateOfEvent('permission.asked')).toBe('waiting');
    expect(runStateOfEvent('form.created')).toBe('waiting');
    expect(runStateOfEvent('permission.replied')).toBe('running');
    expect(runStateOfEvent('form.replied')).toBe('running');
    expect(runStateOfEvent('form.cancelled')).toBe('running');
    expect(runStateOfEvent('session.execution.succeeded')).toBe('succeeded');
    expect(runStateOfEvent('session.execution.failed')).toBe('failed');
    expect(runStateOfEvent('session.execution.interrupted')).toBe('interrupted');
    expect(runStateOfEvent('session.created')).toBeUndefined();
    expect(runStateOfEvent('session.idle')).toBeUndefined();
    expect(runStateOfEvent('session.status')).toBeUndefined();
  });
});

describe('syncTarget', () => {
  const board = defaultBoard();

  it('sends a run to the first starting column', () => {
    expect(syncTarget(board, 'running', at('backlog'))).toBe('in-progress');
    expect(syncTarget(board, 'running', at('in-progress'))).toBeUndefined();
  });

  it('follows the column flags, not the ids', () => {
    const custom: BoardDocument = {
      ...board,
      columns: [column({ id: 'work', order: 0, startAgent: true }), ...board.columns],
    };
    expect(syncTarget(custom, 'running', at('backlog'))).toBe('work');
  });

  it('sends waiting, failed, and interrupted runs to their columns', () => {
    expect(syncTarget(board, 'waiting', at('in-progress'))).toBe('waiting');
    expect(syncTarget(board, 'waiting', at('waiting'))).toBeUndefined();
    expect(syncTarget(board, 'failed', at('in-progress'))).toBe('failed');
    expect(syncTarget(board, 'interrupted', at('done'))).toBe('failed');
  });

  it('sends a finished run out of the starting column to Ready to deploy', () => {
    expect(syncTarget(board, 'succeeded', at('in-progress'))).toBe('ready');
    expect(syncTarget(board, 'succeeded', at('ready'))).toBeUndefined();
  });

  it('brings a card parked for a question back to the queue when the run ends', () => {
    expect(syncTarget(board, 'succeeded', at('waiting', 'auto'))).toBe('ready');
    expect(syncTarget(board, 'succeeded', at('waiting', 'agent'))).toBeUndefined();
    expect(syncTarget(board, 'succeeded', at('waiting', 'manual'))).toBeUndefined();
  });

  it('leaves a finished card that the agent already moved', () => {
    expect(syncTarget(board, 'succeeded', at('in-progress'))).toBe('ready');
    expect(syncTarget(board, 'succeeded', at('done'))).toBeUndefined();
    expect(syncTarget(board, 'succeeded', at('backlog'))).toBeUndefined();
  });

  it('does nothing when the column is gone', () => {
    const sparse: BoardDocument = {
      ...board,
      columns: [
        column({ id: 'backlog', order: 0 }),
        column({ id: 'in-progress', order: 1, startAgent: true }),
      ],
    };
    expect(syncTarget(sparse, 'waiting', at('in-progress'))).toBeUndefined();
    expect(syncTarget(sparse, 'failed', at('in-progress'))).toBeUndefined();
    expect(syncTarget(sparse, 'succeeded', at('in-progress'))).toBeUndefined();
  });
});

describe('applyRunSync', () => {
  it('moves a placed card and keeps the source auto', () => {
    const board = applyRunSync(placed('in-progress'), key, 'succeeded', 5);
    expect(board.placements[key]?.columnId).toBe('ready');
    expect(board.placements[key]?.source).toBe('auto');
    expect(board.placements[key]?.updatedAt).toBe(5);
  });

  it('leaves an unplaced card alone', () => {
    const board = defaultBoard();
    expect(applyRunSync(board, key, 'running', 5)).toBe(board);
  });

  it('respects a manual placement and a pin', () => {
    const manual = applyRunSync(placed('backlog', { source: 'manual' }), key, 'running', 5);
    expect(manual.placements[key]?.columnId).toBe('backlog');

    const pinned = applyRunSync(placed('backlog', { pinned: true }), key, 'running', 5);
    expect(pinned.placements[key]?.columnId).toBe('backlog');
  });

  it('does nothing when the card is already in the target', () => {
    const board = placed('in-progress');
    expect(applyRunSync(board, key, 'running', 5)).toBe(board);
  });

  it('appends at the end of the target column', () => {
    let board = placed('in-progress');
    board = dropPlacement(board, {
      sessionKey: 'sidecar\nses_2',
      columnId: 'ready',
      index: 0,
      updatedAt: 2,
    }).board;

    const synced = applyRunSync(board, key, 'succeeded', 5);
    expect(synced.placements[key]?.position).toBeGreaterThan(
      synced.placements['sidecar\nses_2']!.position,
    );
  });
});
