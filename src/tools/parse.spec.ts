import { describe, expect, it } from 'vitest';

import {
  parseCreateInput,
  parseListQuery,
  parseStatus,
  resolveSessionID,
  withRuleDefaults,
} from './parse';

describe('resolveSessionID', () => {
  it('resolves "me" to the calling session, case-insensitively', () => {
    expect(resolveSessionID('me', 'ses_1')).toEqual({ ok: true, value: 'ses_1' });
    expect(resolveSessionID(' ME ', 'ses_1')).toEqual({ ok: true, value: 'ses_1' });
  });

  it('keeps an explicit session id and trims it', () => {
    expect(resolveSessionID(' ses_2 ', 'ses_1')).toEqual({ ok: true, value: 'ses_2' });
  });

  it('explains the me alias on a bad value', () => {
    const result = resolveSessionID('', 'ses_1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Use "me"');
    expect(resolveSessionID(42, 'ses_1').ok).toBe(false);
  });
});

describe('parseStatus', () => {
  it('accepts a known status and an empty value', () => {
    expect(parseStatus('failed')).toEqual({ ok: true, value: 'failed' });
    expect(parseStatus(undefined)).toEqual({ ok: true, value: undefined });
  });

  it('lists the valid statuses on an unknown one', () => {
    const result = parseStatus('done');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('idle, running, waiting, failed, interrupted');
  });
});

describe('parseListQuery', () => {
  it('keeps the provided filters', () => {
    expect(parseListQuery({ column: 'Done', status: 'idle', text: ' ship ' })).toEqual({
      ok: true,
      value: { column: 'Done', status: 'idle', text: 'ship' },
    });
  });

  it('rejects a wrong type', () => {
    expect(parseListQuery({ includeSubagents: 'yes' }).ok).toBe(false);
    expect(parseListQuery({ project: 7 }).ok).toBe(false);
  });
});

describe('parseCreateInput', () => {
  it('requires a directory and a column', () => {
    expect(
      parseCreateInput({ directory: '/work/app', column: 'backlog', title: ' Review ' }),
    ).toEqual({
      ok: true,
      value: { directory: '/work/app', column: 'backlog', title: 'Review' },
    });

    expect(parseCreateInput({ column: 'backlog' }).ok).toBe(false);
    expect(parseCreateInput({ directory: '/work/app' }).ok).toBe(false);
  });
});

describe('withRuleDefaults', () => {
  it('fills the omitted rule fields', () => {
    const rule = withRuleDefaults({ name: 'Failed runs' }) as Record<string, unknown>;

    expect(rule.enabled).toBe(true);
    expect(rule.priority).toBe(0);
    expect(rule.trigger).toEqual(['created']);
    expect(rule.match).toBe('all');
    expect(rule.actions).toEqual([]);
    expect(String(rule.id)).toMatch(/^rule_[0-9a-f-]{36}$/);
  });

  it('keeps the fields the caller set', () => {
    const rule = withRuleDefaults({
      id: 'rule_1',
      name: 'Mine',
      enabled: false,
      priority: 20,
      trigger: ['run.failed'],
    }) as Record<string, unknown>;

    expect(rule).toMatchObject({
      id: 'rule_1',
      enabled: false,
      priority: 20,
      trigger: ['run.failed'],
    });
  });
});
