import type { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  applyRule,
  conditionMatches,
  conditionsMatch,
  previewRules,
  type Rule,
  type RuleCondition,
  type RuleSubject,
} from './rules';
import {
  commitBoard,
  defaultBoard,
  readBoard,
  type BoardDocument,
  type BoardStorage,
  type Placement,
} from './board';

function subject(overrides: Partial<RuleSubject> = {}): RuleSubject {
  return {
    sessionKey: 'sidecar\nses_1',
    directory: '/work/mono/packages/ui',
    projectID: 'proj_1',
    title: 'Fix the board',
    agent: 'build',
    root: true,
    cost: 1.5,
    idleMinutes: 12,
    archived: false,
    ...overrides,
  };
}

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule_1',
    name: 'Rule one',
    enabled: true,
    priority: 10,
    trigger: ['created'],
    match: 'all',
    conditions: [],
    actions: [{ type: 'move', toColumn: 'done' }],
    overrideManual: false,
    cooldownMs: 0,
    ...overrides,
  };
}

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    columnId: 'backlog',
    position: 0,
    source: 'auto',
    pinned: false,
    ruleID: null,
    updatedAt: 0,
    lastRuleEventID: null,
    ...overrides,
  };
}

function boardWith(rules: Rule[], placements: Record<string, Placement> = {}): BoardDocument {
  return { ...defaultBoard(), rules, placements };
}

const event = { trigger: 'created' as const, eventID: 'evt_1', now: 1_000 };

describe('conditionMatches', () => {
  it('matches directories by prefix or equality', () => {
    expect(
      conditionMatches({ type: 'directory', op: 'prefix', value: '/work/mono' }, subject()),
    ).toBe(true);
    expect(
      conditionMatches({ type: 'directory', op: 'prefix', value: '/work/other' }, subject()),
    ).toBe(false);
    expect(
      conditionMatches({ type: 'directory', op: 'eq', value: '/work/mono/packages/ui' }, subject()),
    ).toBe(true);
  });

  it('matches projects, agents, and root', () => {
    expect(conditionMatches({ type: 'project', op: 'eq', value: 'proj_1' }, subject())).toBe(true);
    expect(conditionMatches({ type: 'agent', op: 'eq', value: 'build' }, subject())).toBe(true);
    expect(conditionMatches({ type: 'agent', op: 'eq', value: 'plan' }, subject())).toBe(false);
    expect(conditionMatches({ type: 'root', value: true }, subject())).toBe(true);
    expect(conditionMatches({ type: 'root', value: false }, subject())).toBe(false);
  });

  it('matches titles literally and case-insensitively', () => {
    const contains: RuleCondition = { type: 'title', op: 'contains', value: 'BOARD' };
    const matches: RuleCondition = { type: 'title', op: 'matches', value: 'fix the board' };

    expect(conditionMatches(contains, subject())).toBe(true);
    expect(conditionMatches(matches, subject())).toBe(true);
    expect(conditionMatches({ type: 'title', op: 'matches', value: 'fix' }, subject())).toBe(false);
  });

  it('matches cost and idle minutes above a value', () => {
    expect(conditionMatches({ type: 'cost', op: 'gt', value: 1 }, subject())).toBe(true);
    expect(conditionMatches({ type: 'cost', op: 'gt', value: 2 }, subject())).toBe(false);
    expect(conditionMatches({ type: 'idleMinutes', op: 'gt', value: 10 }, subject())).toBe(true);
    expect(conditionMatches({ type: 'idleMinutes', op: 'gt', value: 20 }, subject())).toBe(false);
  });
});

describe('conditionsMatch', () => {
  const conditions: RuleCondition[] = [
    { type: 'root', value: true },
    { type: 'cost', op: 'gt', value: 5 },
  ];

  it('honours all and any', () => {
    expect(conditionsMatch(rule({ match: 'all', conditions }), subject())).toBe(false);
    expect(conditionsMatch(rule({ match: 'any', conditions }), subject())).toBe(true);
    expect(conditionsMatch(rule({ match: 'all', conditions: [] }), subject())).toBe(true);
  });
});

describe('applyRule', () => {
  it('moves a card into the target column and records the event', () => {
    const outcome = applyRule(boardWith([rule()]), subject(), event);

    expect(outcome?.to).toBe('done');
    expect(outcome?.changed).toBe(true);
    expect(outcome?.board.placements['sidecar\nses_1']).toMatchObject({
      columnId: 'done',
      source: 'rule',
      ruleID: 'rule_1',
      lastRuleEventID: 'evt_1',
    });
  });

  it('runs rules in priority order and only the first match applies', () => {
    const board = boardWith([
      rule({ id: 'later', priority: 20, actions: [{ type: 'move', toColumn: 'failed' }] }),
      rule({ id: 'first', priority: 5, actions: [{ type: 'move', toColumn: 'done' }] }),
    ]);

    const outcome = applyRule(board, subject(), event);
    expect(outcome?.ruleID).toBe('first');
    expect(outcome?.board.placements['sidecar\nses_1']?.columnId).toBe('done');
    expect(outcome?.board.rules).toHaveLength(2);
  });

  it('ignores a rule whose trigger does not match', () => {
    expect(
      applyRule(boardWith([rule({ trigger: ['run.failed'] })]), subject(), event),
    ).toBeUndefined();
  });

  it('ignores a disabled rule', () => {
    expect(applyRule(boardWith([rule({ enabled: false })]), subject(), event)).toBeUndefined();
  });

  it('skips a manually placed card unless the rule overrides it', () => {
    const placements = { 'sidecar\nses_1': placement({ source: 'manual' }) };

    expect(applyRule(boardWith([rule()], placements), subject(), event)).toBeUndefined();

    const outcome = applyRule(
      boardWith([rule({ overrideManual: true })], placements),
      subject(),
      event,
    );
    expect(outcome?.to).toBe('done');
  });

  it('skips a pinned card unless the rule overrides it', () => {
    const placements = { 'sidecar\nses_1': placement({ pinned: true }) };

    expect(applyRule(boardWith([rule()], placements), subject(), event)).toBeUndefined();
    expect(
      applyRule(boardWith([rule({ overrideManual: true })], placements), subject(), event)?.to,
    ).toBe('done');
  });

  it('never touches an archived or deleted-root session', () => {
    expect(applyRule(boardWith([rule()]), subject({ archived: true }), event)).toBeUndefined();
  });

  it('applies at most once per rule, session, and event id', () => {
    const first = applyRule(boardWith([rule()]), subject(), event);
    const second = applyRule(first!.board, subject(), event);

    expect(first).toBeDefined();
    expect(second).toBeUndefined();
  });

  it('dedupes by event id but not across events', () => {
    const board = boardWith([rule({ actions: [{ type: 'notify' }] })], {
      'sidecar\nses_1': placement({ columnId: 'done' }),
    });

    const first = applyRule(board, subject(), event)!;
    expect(first.notify).toBe(true);
    expect(first.board.placements['sidecar\nses_1']?.lastRuleEventID).toBe('evt_1');

    expect(applyRule(first.board, subject(), event)).toBeUndefined();
    expect(applyRule(first.board, subject(), { ...event, eventID: 'evt_2' })?.notify).toBe(true);
  });

  it('honours the cooldown from the placement that this rule wrote', () => {
    const placements = {
      'sidecar\nses_1': placement({
        columnId: 'failed',
        source: 'rule',
        ruleID: 'rule_1',
        updatedAt: 900,
        lastRuleEventID: 'evt_0',
      }),
    };

    const outcome = applyRule(boardWith([rule({ cooldownMs: 500 })], placements), subject(), {
      ...event,
      now: 1_000,
    });
    expect(outcome).toBeUndefined();

    const later = applyRule(boardWith([rule({ cooldownMs: 500 })], placements), subject(), {
      ...event,
      now: 1_500,
    });
    expect(later?.to).toBe('done');
  });

  it('skips a rule that would change nothing and lets a later rule act', () => {
    const board = boardWith(
      [
        rule({ id: 'same', actions: [{ type: 'move', toColumn: 'backlog' }] }),
        rule({ id: 'next', priority: 20, actions: [{ type: 'move', toColumn: 'waiting' }] }),
      ],
      { 'sidecar\nses_1': placement({ columnId: 'backlog' }) },
    );

    expect(applyRule(board, subject(), event)?.ruleID).toBe('next');
  });

  it('pins without moving', () => {
    const outcome = applyRule(
      boardWith([rule({ actions: [{ type: 'pin', pinned: true }] })]),
      subject(),
      event,
    );

    expect(outcome?.to).toBeUndefined();
    expect(outcome?.board.placements['sidecar\nses_1']).toMatchObject({
      columnId: 'backlog',
      pinned: true,
      ruleID: 'rule_1',
    });
  });

  it('reports a notify-only action without writing a placement', () => {
    const outcome = applyRule(
      boardWith([rule({ actions: [{ type: 'notify' }] })]),
      subject(),
      event,
    );

    expect(outcome?.notify).toBe(true);
    expect(outcome?.changed).toBe(false);
    expect(outcome?.board.placements).toEqual({});
  });

  it('skips a missing target column', () => {
    const board = boardWith([rule({ actions: [{ type: 'move', toColumn: 'nope' }] })]);

    expect(applyRule(board, subject(), event)).toBeUndefined();
  });
});

describe('previewRules', () => {
  it('lists the would-be moves without writing', () => {
    const board = boardWith([rule()]);
    const moves = previewRules(board, [subject()]);

    expect(moves).toEqual([
      { sessionKey: 'sidecar\nses_1', from: 'backlog', to: 'done', ruleID: 'rule_1' },
    ]);
    expect(board.placements).toEqual({});
  });

  it('skips manual placements, archived sessions, and cards already in place', () => {
    const board = boardWith([rule()], { 'sidecar\nses_1': placement({ source: 'manual' }) });

    expect(previewRules(board, [subject()])).toEqual([]);
    expect(previewRules(board, [subject({ archived: true })])).toEqual([]);
    expect(
      previewRules(boardWith([rule()], { 'sidecar\nses_1': placement({ columnId: 'done' }) }), [
        subject(),
      ]),
    ).toEqual([]);
  });

  it('reports the first matching rule per session', () => {
    const board = boardWith([
      rule({ id: 'second', priority: 20, actions: [{ type: 'move', toColumn: 'failed' }] }),
      rule({ id: 'first', priority: 1, actions: [{ type: 'move', toColumn: 'done' }] }),
    ]);

    expect(previewRules(board, [subject()])[0]?.ruleID).toBe('first');
  });
});

describe('duplicate instances', () => {
  it('applies an event once when two writers handle it', async () => {
    let stored: Schema.Json | undefined = boardWith([rule()]) as unknown as Schema.Json;
    let writes = 0;
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const storage: BoardStorage = {
      async get() {
        await tick();
        return stored;
      },
      async set(_key, value) {
        await tick();
        stored = value;
        writes += 1;
      },
    };

    const handle = () =>
      commitBoard(storage, (document) => applyRule(document, subject(), event)?.board ?? document);

    await Promise.all([handle(), handle()]);

    const final = await readBoard(storage);
    expect(writes).toBe(1);
    expect(final.revision).toBe(1);
    expect(final.placements['sidecar\nses_1']).toMatchObject({
      columnId: 'done',
      lastRuleEventID: 'evt_1',
    });
  });
});
