import { describe, expect, it } from 'vitest';

import type { Column } from './board';
import {
  DEFAULT_START_PROMPT,
  decideCreate,
  decideStart,
  startMessage,
  startsAgent,
  type StartFacts,
} from './start';

function column(overrides: Partial<Column> = {}): Column {
  return {
    id: 'in-progress',
    title: 'In progress',
    order: 1,
    color: null,
    startAgent: true,
    startPrompt: null,
    ...overrides,
  };
}

function facts(overrides: Partial<StartFacts> = {}): StartFacts {
  return {
    source: 'manual',
    from: 'backlog',
    column: column(),
    task: null,
    running: false,
    waiting: false,
    ran: true,
    ...overrides,
  };
}

describe('startsAgent', () => {
  it('defaults by id when the field is absent', () => {
    expect(startsAgent({ id: 'in-progress' })).toBe(true);
    expect(startsAgent({ id: 'waiting' })).toBe(false);
  });

  it('uses the stored value when present', () => {
    expect(startsAgent({ id: 'waiting', startAgent: true })).toBe(true);
    expect(startsAgent({ id: 'in-progress', startAgent: false })).toBe(false);
  });
});

describe('startMessage', () => {
  it('uses the column message or the built-in default', () => {
    expect(startMessage(column())).toBe(DEFAULT_START_PROMPT);
    expect(startMessage(column({ startPrompt: '  Keep going.  ' }))).toBe('Keep going.');
    expect(startMessage(column({ startPrompt: '   ' }))).toBe(DEFAULT_START_PROMPT);
  });
});

describe('decideStart', () => {
  it('starts only on a manual move into a different starting column', () => {
    expect(decideStart(facts())).toEqual({ kind: 'continue', text: DEFAULT_START_PROMPT });
    expect(decideStart(facts({ source: 'agent' }))).toEqual({ kind: 'none' });
    expect(decideStart(facts({ source: 'rule' }))).toEqual({ kind: 'none' });
    expect(decideStart(facts({ source: 'auto' }))).toEqual({ kind: 'none' });
    expect(decideStart(facts({ column: column({ startAgent: false }) }))).toEqual({
      kind: 'none',
    });
    expect(decideStart(facts({ from: 'in-progress' }))).toEqual({ kind: 'none' });
  });

  it('skips a session that is already running or waiting', () => {
    expect(decideStart(facts({ running: true }))).toEqual({ kind: 'none' });
    expect(decideStart(facts({ waiting: true }))).toEqual({ kind: 'none' });
  });

  it('sends a queued task instead of the continuation message', () => {
    expect(decideStart(facts({ task: '  Fix the tests.  ' }))).toEqual({
      kind: 'task',
      text: 'Fix the tests.',
    });
    expect(decideStart(facts({ task: '   ' }))).toEqual({
      kind: 'continue',
      text: DEFAULT_START_PROMPT,
    });
  });

  it('places a session that never ran and has no task', () => {
    expect(decideStart(facts({ ran: false }))).toEqual({ kind: 'none' });
    expect(decideStart(facts({ ran: false, task: 'Do it.' }))).toEqual({
      kind: 'task',
      text: 'Do it.',
    });
  });

  it('uses the column message for a continuing session', () => {
    expect(
      decideStart(facts({ column: column({ startPrompt: 'Continue the migration.' }) })),
    ).toEqual({ kind: 'continue', text: 'Continue the migration.' });
  });
});

describe('decideCreate', () => {
  it('sends the task in a starting column and queues it elsewhere', () => {
    expect(decideCreate(column(), 'Do it.')).toEqual({ send: true, queue: false });
    expect(decideCreate(column({ startAgent: false }), 'Do it.')).toEqual({
      send: false,
      queue: true,
    });
  });

  it('does nothing without a task', () => {
    expect(decideCreate(column(), '')).toEqual({ send: false, queue: false });
    expect(decideCreate(column(), '   ')).toEqual({ send: false, queue: false });
    expect(decideCreate(column(), undefined)).toEqual({ send: false, queue: false });
  });
});
