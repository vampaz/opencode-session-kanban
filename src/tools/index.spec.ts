import { afterEach, describe, expect, it } from 'vitest';

import { ACTIVITY_KEY, sharedActivity } from '../activity';
import { BACKLOG_COLUMN, IN_PROGRESS_COLUMN, defaultBoard, type Placement } from '../core/board';
import { PENDING_CREATE_KEY } from '../core/pending-create';
import type { Rule } from '../core/rules';
import { sessionKeyOf } from '../core/session-ref';
import { createOperations } from '../operations';
import {
  CALLER_SESSION,
  createFakeContext,
  fakeSession,
  type FakeContext,
  type FakeContextOptions,
} from '../testing/fake-context';
import { createKanbanTools } from './index';

type Tools = ReturnType<typeof createKanbanTools>;

const REMOVE_RULE: Rule = {
  id: 'r1',
  name: 'Send it to review',
  enabled: true,
  priority: 0,
  trigger: ['created'],
  match: 'all',
  conditions: [],
  actions: [{ type: 'move', toColumn: 'waiting' }],
  overrideManual: false,
  cooldownMs: 0,
};

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

function setup(options: FakeContextOptions = {}) {
  const fake = createFakeContext(options);
  const ops = createOperations(fake.ctx, async () => undefined);
  const tools = createKanbanTools(fake.ctx, ops);
  return { fake, ops, tools };
}

async function run(tools: Tools, fake: FakeContext, name: string, input: unknown): Promise<string> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No ${name} tool.`);

  const result = await tool.execute(input as never, fake.toolContext());
  if (typeof result.content !== 'string') throw new Error(`The ${name} tool returned no text.`);
  return result.content;
}

afterEach(() => {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  delete holder[ACTIVITY_KEY];
  delete holder[PENDING_CREATE_KEY];
});

describe('kanban_list', () => {
  it('lists the cards on the board', async () => {
    const { fake, tools } = setup({
      sessions: [fakeSession({ id: 'ses_1', title: 'Fix login' })],
    });

    const text = await run(tools, fake, 'list', {});

    expect(text).toContain('ses_1');
    expect(text).toContain('Fix login');
    expect(text).toContain('Backlog');
    expect(text).toContain('idle');
  });

  it('rejects an unknown column filter and names the valid columns', async () => {
    const { fake, tools } = setup();

    const text = await run(tools, fake, 'list', { column: 'nope' });

    expect(text).toContain('Unknown column "nope"');
    expect(text).toContain('Valid columns:');
    expect(text).toContain('backlog (Backlog)');
  });
});

describe('kanban_get', () => {
  it('reports waiting over running, matching the card list', async () => {
    const { fake, ops, tools } = setup({ sessions: [fakeSession({ id: 'ses_1', ran: true })] });
    await fake.writeBoard(defaultBoard());
    sharedActivity().apply('session.execution.started', 'ses_1');
    sharedActivity().apply('permission.asked', 'ses_1');
    fake.pending.add('ses_1');

    const text = await run(tools, fake, 'get', { sessionID: 'ses_1' });

    expect(text).toContain('Status: waiting');
    const rows = await ops.listCards({});
    expect(rows.map((row) => row.status)).toEqual(['waiting']);
  });

  it('resolves "me" to the calling session', async () => {
    const { fake, tools } = setup();
    fake.addSession(fakeSession({ id: CALLER_SESSION, title: 'Caller' }));

    const text = await run(tools, fake, 'get', { sessionID: 'me' });

    expect(text.startsWith(CALLER_SESSION)).toBe(true);
  });
});

describe('kanban_move', () => {
  it('records an agent placement and never sends a prompt', async () => {
    const { fake, tools } = setup({ sessions: [fakeSession({ id: 'ses_1', ran: true })] });

    const text = await run(tools, fake, 'move', { sessionID: 'ses_1', column: 'In progress' });

    expect(text).toContain('Moved ses_1 to In progress (in-progress).');
    expect(fake.prompts).toEqual([]);
    expect((await fake.board()).placements[sessionKeyOf('ses_1')]).toMatchObject({
      columnId: IN_PROGRESS_COLUMN,
      source: 'agent',
    });
  });
});

describe('kanban_pin and kanban_clear_manual', () => {
  it('pins and then clears the placement', async () => {
    const { fake, tools } = setup({ sessions: [fakeSession({ id: 'ses_1' })] });

    const pinned = await run(tools, fake, 'pin', { sessionID: 'ses_1', pinned: true });
    expect(pinned).toBe('Pinned ses_1.');
    expect((await fake.board()).placements[sessionKeyOf('ses_1')]?.pinned).toBe(true);

    await fake.writeBoard({
      ...defaultBoard(),
      placements: { [sessionKeyOf('ses_1')]: placement(IN_PROGRESS_COLUMN) },
    });
    const cleared = await run(tools, fake, 'clear_manual', { sessionID: 'ses_1' });
    expect(cleared).toBe('Cleared the manual placement of ses_1.');
    expect((await fake.board()).placements[sessionKeyOf('ses_1')]).toBeUndefined();
  });
});

describe('kanban_archive', () => {
  it('asserts the archive permission and reports a server that ignores the flag', async () => {
    const { fake, tools } = setup({
      sessions: [fakeSession({ id: 'ses_1' })],
      ignoreArchive: true,
    });

    const text = await run(tools, fake, 'archive', { sessionID: 'ses_1', archived: true });

    expect(text).toContain('ignores the archived flag');
    expect(fake.permissions.map((call) => call.action)).toEqual(['kanban.archive']);
    expect(fake.permissions[0]?.resources).toEqual(['ses_1']);
  });
});

describe('kanban_fork', () => {
  it('reports that the server has no fork call', async () => {
    const { fake, tools } = setup({ sessions: [fakeSession({ id: 'ses_1' })] });

    const text = await run(tools, fake, 'fork', { sessionID: 'ses_1' });

    expect(text).toContain('no fork call');
  });
});

describe('kanban_set_rule', () => {
  it('removes a rule after asserting the rules permission', async () => {
    const { fake, ops, tools } = setup();
    await ops.upsertRule(REMOVE_RULE);

    const text = await run(tools, fake, 'set_rule', { id: 'r1', remove: true });

    expect(text).toBe('Removed rule r1.');
    expect(fake.permissions.map((call) => call.action)).toEqual(['kanban.rules']);
    expect((await fake.board()).rules).toEqual([]);
  });
});

describe('kanban_create_session', () => {
  it('asserts the prompt permission for a task in a starting column', async () => {
    const { fake, tools } = setup();

    const text = await run(tools, fake, 'create_session', {
      directory: '/work/app',
      column: 'in-progress',
      prompt: 'Fix it',
    });

    expect(text).toContain('Created ses_fake_1 in In progress (in-progress).');
    expect(text).toContain('The task is running.');
    expect(fake.permissions.map((call) => call.action)).toEqual(['kanban.prompt']);
    expect(fake.prompts).toHaveLength(1);
    expect((await fake.board()).placements[sessionKeyOf('ses_fake_1')]?.columnId).toBe(
      IN_PROGRESS_COLUMN,
    );
  });

  it('does not assert the prompt permission for a queued task', async () => {
    const { fake, tools } = setup();

    const text = await run(tools, fake, 'create_session', {
      directory: '/work/app',
      column: BACKLOG_COLUMN,
      prompt: 'Later',
    });

    expect(text).toContain('The task waits on the card until a starting column.');
    expect(fake.permissions).toEqual([]);
    expect(fake.prompts).toEqual([]);
  });
});
