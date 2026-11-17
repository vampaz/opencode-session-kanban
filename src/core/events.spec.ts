import { describe, expect, it } from 'vitest';

import { eventIDOf, eventSessionID, triggerFor } from './events';

describe('triggerFor', () => {
  it('maps the server events that fire rules', () => {
    expect(triggerFor({ type: 'session.created' })).toBe('created');
    expect(triggerFor({ type: 'session.execution.started' })).toBe('status.running');
    expect(triggerFor({ type: 'session.execution.succeeded' })).toBe('run.succeeded');
    expect(triggerFor({ type: 'session.execution.failed' })).toBe('run.failed');
    expect(triggerFor({ type: 'session.execution.interrupted' })).toBe('run.interrupted');
    expect(triggerFor({ type: 'session.idle' })).toBe('status.idle');
    expect(triggerFor({ type: 'permission.asked' })).toBe('waiting.permission');
    expect(triggerFor({ type: 'form.created' })).toBe('waiting.form');
  });

  it('reads the status of a session.status event', () => {
    expect(triggerFor({ type: 'session.status', data: { status: { type: 'idle' } } })).toBe(
      'status.idle',
    );
    expect(
      triggerFor({ type: 'session.status', data: { status: { type: 'busy' } } }),
    ).toBeUndefined();
  });

  it('ignores events outside the closed trigger set', () => {
    expect(triggerFor({ type: 'session.renamed' })).toBeUndefined();
    expect(triggerFor({ type: 'message.updated' })).toBeUndefined();
  });
});

describe('eventSessionID', () => {
  it('reads the session a rule event is about', () => {
    expect(eventSessionID({ type: 'session.created', data: { sessionID: 'ses_1' } })).toBe('ses_1');
    expect(eventSessionID({ type: 'session.created', data: {} })).toBeUndefined();
    expect(eventSessionID({ type: 'session.created' })).toBeUndefined();
  });
});

describe('eventIDOf', () => {
  it('prefers the event id and falls back to the durable position', () => {
    expect(eventIDOf({ type: 'session.created', id: 'evt_1' })).toBe('evt_1');
    expect(eventIDOf({ type: 'session.created', durable: { aggregateID: 'ses_1', seq: 4 } })).toBe(
      'session.created:ses_1:4',
    );
  });
});
