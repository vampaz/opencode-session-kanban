import { describe, expect, it } from 'vitest';

import { selectBootstrapSessions, type BootstrapRow } from './bootstrap';

function row(id: string, parentID?: string, fork = false): BootstrapRow {
  return { id, parentID, fork: fork ? { sessionID: parentID } : undefined };
}

function ids(rows: readonly BootstrapRow[]): string[] {
  return rows.map((item) => item.id).sort();
}

describe('selectBootstrapSessions', () => {
  it('keeps a fork whose root is already known', () => {
    const rows = [row('root'), row('fork', 'root', true)];

    expect(ids(selectBootstrapSessions(rows, new Set(['root']), { showSubagents: false }))).toEqual(
      ['fork'],
    );
  });

  it('keeps a fork and the fork ancestors the window does not know', () => {
    const rows = [row('root'), row('mid', 'root', true), row('tip', 'mid', true)];

    expect(ids(selectBootstrapSessions(rows, new Set(['root']), { showSubagents: false }))).toEqual(
      ['mid', 'tip'],
    );
  });

  it('keeps an orphan fork that is its only known link', () => {
    const rows = [row('orphan', 'deleted', true)];

    expect(ids(selectBootstrapSessions(rows, new Set(), { showSubagents: false }))).toEqual([
      'orphan',
    ]);
  });

  it('leaves subagents out unless they are shown', () => {
    const rows = [row('root'), row('sub', 'root')];

    expect(selectBootstrapSessions(rows, new Set(), { showSubagents: false })).toEqual([]);
    expect(ids(selectBootstrapSessions(rows, new Set(['root']), { showSubagents: true }))).toEqual([
      'sub',
    ]);
    expect(ids(selectBootstrapSessions(rows, new Set(), { showSubagents: true }))).toEqual([
      'root',
      'sub',
    ]);
  });

  it('keeps a subagent ancestor when a fork is shown and its parent is a subagent', () => {
    const rows = [row('root'), row('sub', 'root'), row('fork', 'sub', true)];

    expect(ids(selectBootstrapSessions(rows, new Set(['root']), { showSubagents: false }))).toEqual(
      ['fork', 'sub'],
    );
  });

  it('keeps a fork that carries only fork.sessionID', () => {
    const rows: BootstrapRow[] = [{ id: 'root' }, { id: 'fork', fork: { sessionID: 'root' } }];

    expect(ids(selectBootstrapSessions(rows, new Set(['root']), { showSubagents: false }))).toEqual(
      ['fork'],
    );
    expect(ids(selectBootstrapSessions(rows, new Set(), { showSubagents: false }))).toEqual([
      'fork',
      'root',
    ]);
  });

  it('does not loop on a cycle', () => {
    const rows = [row('a', 'b', true), row('b', 'a', true)];

    expect(ids(selectBootstrapSessions(rows, new Set(), { showSubagents: false }))).toEqual([
      'a',
      'b',
    ]);
  });
});
