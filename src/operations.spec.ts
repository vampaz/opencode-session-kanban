import { afterEach, describe, expect, it } from 'vitest';

import { ACTIVITY_KEY, sharedActivity } from './activity';
import {
  BACKLOG_COLUMN,
  IN_PROGRESS_COLUMN,
  READY_COLUMN,
  commitBoard,
  defaultBoard,
  dropPlacement,
  type BoardDocument,
  type Placement,
} from './core/board';
import { PENDING_CREATE_KEY } from './core/pending-create';
import { sessionKeyOf } from './core/session-ref';
import { BoardError, createOperations } from './operations';
import {
  createFakeContext,
  fakeSession,
  type FakeContext,
  type FakeContextOptions,
} from './testing/fake-context';

function placement(columnId: string, overrides: Partial<Placement> = {}): Placement {
  return {
    columnId,
    position: 0,
    source: 'manual',
    pinned: false,
    ruleID: null,
    updatedAt: Date.now(),
    lastRuleEventID: null,
    task: null,
    ...overrides,
  };
}

function boardWith(
  placements: Readonly<Record<string, Placement>>,
  extra: Partial<BoardDocument> = {},
): BoardDocument {
  return { ...defaultBoard(), placements, ...extra };
}

function setup(options: FakeContextOptions = {}) {
  const fake = createFakeContext(options);
  const revisions: number[] = [];
  const ops = createOperations(fake.ctx, async (revision) => {
    revisions.push(revision);
  });

  return { fake, ops, revisions };
}

/** A manual placement the user made before the move under test. */
async function seed(
  fake: FakeContext,
  sessionID: string,
  columnId: string,
  overrides: Partial<Placement> = {},
): Promise<void> {
  await fake.writeBoard(boardWith({ [sessionKeyOf(sessionID)]: placement(columnId, overrides) }));
}

afterEach(() => {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  delete holder[ACTIVITY_KEY];
  delete holder[PENDING_CREATE_KEY];
});

describe('moveByIndex start decisions', () => {
  it('sends the queued task when a manual move lands in a starting column', async () => {
    const { fake, ops } = setup({ sessions: [fakeSession({ id: 'ses_1', ran: true })] });
    await seed(fake, 'ses_1', BACKLOG_COLUMN, { task: 'Ship it' });

    const result = await ops.moveByIndex(sessionKeyOf('ses_1'), IN_PROGRESS_COLUMN, 0, 'manual');

    expect(result.started).toBe(true);
    expect(fake.prompts).toEqual([{ sessionID: 'ses_1', text: 'Ship it' }]);

    const card = (await fake.board()).placements[sessionKeyOf('ses_1')];
    expect(card?.columnId).toBe(IN_PROGRESS_COLUMN);
    expect(card?.task).toBeNull();
  });

  it.each(['agent', 'auto', 'rule'] as const)(
    'never sends a prompt for a %s move',
    async (source) => {
      const { fake, ops } = setup({ sessions: [fakeSession({ id: 'ses_1', ran: true })] });
      await seed(fake, 'ses_1', BACKLOG_COLUMN, { task: 'Ship it' });

      const result = await ops.moveByIndex(sessionKeyOf('ses_1'), IN_PROGRESS_COLUMN, 0, source);

      expect(result.started).toBe(false);
      expect(fake.prompts).toEqual([]);
      const card = (await fake.board()).placements[sessionKeyOf('ses_1')];
      expect(card?.columnId).toBe(IN_PROGRESS_COLUMN);
      expect(card?.task).toBe('Ship it');
    },
  );

  it('skips a running session', async () => {
    const { fake, ops } = setup({ sessions: [fakeSession({ id: 'ses_1', ran: true })] });
    await seed(fake, 'ses_1', BACKLOG_COLUMN, { task: 'Ship it' });
    sharedActivity().apply('session.execution.started', 'ses_1');

    const result = await ops.moveByIndex(sessionKeyOf('ses_1'), IN_PROGRESS_COLUMN, 0, 'manual');

    expect(result.started).toBe(false);
    expect(fake.prompts).toEqual([]);
    expect((await fake.board()).placements[sessionKeyOf('ses_1')]?.columnId).toBe(
      IN_PROGRESS_COLUMN,
    );
  });

  it('skips a session waiting on a permission', async () => {
    const { fake, ops } = setup({ sessions: [fakeSession({ id: 'ses_1', ran: true })] });
    await seed(fake, 'ses_1', BACKLOG_COLUMN, { task: 'Ship it' });
    sharedActivity().apply('permission.asked', 'ses_1');

    const result = await ops.moveByIndex(sessionKeyOf('ses_1'), IN_PROGRESS_COLUMN, 0, 'manual');

    expect(result.started).toBe(false);
    expect(fake.prompts).toEqual([]);
  });

  it('only places a session that never ran and has no task', async () => {
    const { fake, ops } = setup({ sessions: [fakeSession({ id: 'ses_1' })] });
    await seed(fake, 'ses_1', BACKLOG_COLUMN);

    const result = await ops.moveByIndex(sessionKeyOf('ses_1'), IN_PROGRESS_COLUMN, 0, 'manual');

    expect(result.started).toBe(false);
    expect(fake.prompts).toEqual([]);
    const card = (await fake.board()).placements[sessionKeyOf('ses_1')];
    expect(card?.columnId).toBe(IN_PROGRESS_COLUMN);
  });

  it('does not bump the revision for a no-op move', async () => {
    const { fake, ops } = setup({ sessions: [fakeSession({ id: 'ses_1' })] });
    const first = await ops.moveByIndex(sessionKeyOf('ses_1'), IN_PROGRESS_COLUMN, 0, 'manual');

    const second = await ops.moveByIndex(sessionKeyOf('ses_1'), IN_PROGRESS_COLUMN, 0, 'manual');

    expect(first.board.revision).toBe(1);
    expect(second.board.revision).toBe(first.board.revision);
    expect((await fake.board()).revision).toBe(first.board.revision);
  });
});

describe('createInColumn', () => {
  it('queues a prompt in a column that does not start agents', async () => {
    const { fake, ops } = setup();

    const result = await ops.createInColumn({
      directory: '/work/other',
      column: BACKLOG_COLUMN,
      prompt: 'Do the thing',
    });

    expect(result.started).toBe(false);
    expect(result.queued).toBe(true);
    expect(fake.prompts).toEqual([]);
    expect((await fake.board()).placements[sessionKeyOf(result.session.id)]).toMatchObject({
      columnId: BACKLOG_COLUMN,
      task: 'Do the thing',
    });
  });

  it('sends the task and clears it in a starting column', async () => {
    const { fake, ops } = setup();

    const result = await ops.createInColumn({
      directory: '/work/other',
      column: IN_PROGRESS_COLUMN,
      prompt: 'Do it',
    });

    expect(result.started).toBe(true);
    expect(result.queued).toBe(false);
    expect(fake.prompts).toEqual([{ sessionID: result.session.id, text: 'Do it' }]);
    expect((await fake.board()).placements[sessionKeyOf(result.session.id)]).toMatchObject({
      columnId: IN_PROGRESS_COLUMN,
      task: null,
    });
  });

  it('moves the card to the starting column when the chosen column only queues', async () => {
    const { fake, ops } = setup();

    const result = await ops.createInColumn({
      directory: '/work/other',
      column: BACKLOG_COLUMN,
      prompt: 'Do it',
      start: true,
    });

    expect(result.started).toBe(true);
    expect(result.column.id).toBe(IN_PROGRESS_COLUMN);
    expect((await fake.board()).placements[sessionKeyOf(result.session.id)]).toMatchObject({
      columnId: IN_PROGRESS_COLUMN,
      task: null,
    });
  });

  it('places a card with no prompt and sends nothing', async () => {
    const { fake, ops } = setup();

    const result = await ops.createInColumn({ directory: '/work/other', column: BACKLOG_COLUMN });

    expect(result.started).toBe(false);
    expect(result.queued).toBe(false);
    expect(fake.prompts).toEqual([]);
    expect((await fake.board()).placements[sessionKeyOf(result.session.id)]?.columnId).toBe(
      BACKLOG_COLUMN,
    );
  });
});

describe('archive', () => {
  it('prunes the placement of an archived session', async () => {
    const { fake, ops } = setup({ sessions: [fakeSession({ id: 'ses_1' })] });
    await seed(fake, 'ses_1', BACKLOG_COLUMN);

    await ops.archive('ses_1', true);

    expect((await fake.board()).placements[sessionKeyOf('ses_1')]).toBeUndefined();
  });

  it('reports a server that accepts and ignores the archived flag', async () => {
    const { fake, ops } = setup({
      sessions: [fakeSession({ id: 'ses_1' })],
      ignoreArchive: true,
    });
    await seed(fake, 'ses_1', BACKLOG_COLUMN);

    await expect(ops.archive('ses_1', true)).rejects.toThrow(/ignores the archived flag/);
    expect((await fake.board()).placements[sessionKeyOf('ses_1')]).toBeDefined();
  });
});

describe('setDefaultColumn', () => {
  it('rejects an unknown column and lists the valid ones', async () => {
    const { ops } = setup();

    await expect(ops.setDefaultColumn('nope')).rejects.toThrow(BoardError);
    await expect(ops.setDefaultColumn('nope')).rejects.toThrow(
      /Valid columns: .*backlog \(Backlog\)/,
    );
  });
});

describe('sortApply', () => {
  it('leaves alone a session placed since the preview', async () => {
    const { fake, ops } = setup({
      sessions: [
        fakeSession({ id: 'ses_finished', ran: true }),
        fakeSession({ id: 'ses_failed', outcome: 'failed' }),
      ],
    });
    await fake.writeBoard(defaultBoard());

    const plan = await ops.sortPreview();
    expect(plan.moves).toHaveLength(2);

    const placed = plan.moves.find((move) => move.columnId === READY_COLUMN);
    const other = plan.moves.find((move) => move.sessionKey !== placed?.sessionKey);
    if (!placed || !other) throw new Error('The preview did not plan both cards.');

    // The user drops one card after the preview, so it must keep that column.
    await commitBoard(
      fake.ctx.storage,
      (board) =>
        dropPlacement(board, {
          sessionKey: placed.sessionKey,
          columnId: BACKLOG_COLUMN,
          index: 0,
          source: 'manual',
          updatedAt: Date.now(),
        }).board,
    );

    const result = await ops.sortApply();

    expect(result.placed).toBe(1);
    const board = await fake.board();
    expect(board.placements[placed.sessionKey]?.columnId).toBe(BACKLOG_COLUMN);
    expect(board.placements[other.sessionKey]?.columnId).toBe(other.columnId);
  });
});

describe('prune', () => {
  it('removes only the reported keys', async () => {
    const { fake, ops } = setup({
      sessions: [fakeSession({ id: 'ses_1' }), fakeSession({ id: 'ses_2' })],
    });
    await fake.writeBoard(
      boardWith({
        [sessionKeyOf('ses_1')]: placement(BACKLOG_COLUMN),
        [sessionKeyOf('ses_2')]: placement(BACKLOG_COLUMN, { position: 1 }),
      }),
    );

    const result = await ops.prune([sessionKeyOf('ses_1')]);

    expect(result.board.placements[sessionKeyOf('ses_1')]).toBeUndefined();
    expect(result.board.placements[sessionKeyOf('ses_2')]).toBeDefined();
  });
});
