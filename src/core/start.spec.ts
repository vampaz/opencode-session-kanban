import { describe, expect, it } from 'vitest';

import type { Column } from './board';
import {
  DEFAULT_START_PROMPT,
  decideCreate,
  decideStart,
  startColumn,
  startMessage,
  startsAgent,
  ticketText,
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
    expect(decideCreate(column(), '', true)).toEqual({ send: false, queue: false });
  });

  it('follows the user choice over the column', () => {
    expect(decideCreate(column({ startAgent: false }), 'Do it.', true)).toEqual({
      send: true,
      queue: false,
    });
    expect(decideCreate(column(), 'Do it.', false)).toEqual({ send: false, queue: true });
  });
});

describe('ticketText', () => {
  it('joins the title and the task', () => {
    expect(ticketText(' Fix login ', ' The button does nothing. ')).toBe(
      'Fix login\n\nThe button does nothing.',
    );
  });

  it('uses whichever part is present', () => {
    expect(ticketText('Fix login', '  ')).toBe('Fix login');
    expect(ticketText(undefined, 'Do it.')).toBe('Do it.');
    expect(ticketText('', null)).toBe('');
  });
});

describe('startColumn', () => {
  const backlog = column({ id: 'backlog', title: 'Backlog', order: 0, startAgent: false });
  const review = column({ id: 'review', title: 'Review', order: 3, startAgent: true });
  const progress = column({ order: 1 });

  it('keeps a chosen column that starts agents', () => {
    expect(startColumn([backlog, progress, review], review)).toBe(review);
  });

  it('picks the first starting column by order', () => {
    expect(startColumn([review, backlog, progress], backlog)).toBe(progress);
  });

  it('keeps the chosen column when none starts agents', () => {
    const done = column({ id: 'done', title: 'Done', order: 2, startAgent: false });
    expect(startColumn([backlog, done], backlog)).toBe(backlog);
  });
});
