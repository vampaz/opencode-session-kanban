import { describe, expect, it } from 'vitest';

import { filterCardRows, type CardRow } from './cards';

function card(overrides: Partial<CardRow> & { sessionID: string }): CardRow {
  return {
    title: 'Fix the board',
    directory: '/work/mono/packages/ui',
    projectID: 'proj_1',
    columnId: 'in-progress',
    columnTitle: 'In progress',
    status: 'running',
    archived: false,
    pinned: false,
    source: 'manual',
    updated: 0,
    ...overrides,
  };
}

const rows = [
  card({ sessionID: 'ses_1' }),
  card({
    sessionID: 'ses_2',
    title: 'Ship the release',
    columnId: 'done',
    columnTitle: 'Done',
    status: 'idle',
    directory: '/work/other',
    projectID: 'proj_2',
    subpath: 'apps/web',
  }),
  card({
    sessionID: 'ses_3',
    title: 'Untitled session',
    status: 'failed',
    archived: true,
    directory: '/srv/other',
    projectID: 'proj_3',
  }),
];

describe('filterCardRows', () => {
  it('returns every row without a filter', () => {
    expect(filterCardRows(rows, {}).map((row) => row.sessionID)).toEqual([
      'ses_1',
      'ses_2',
      'ses_3',
    ]);
  });

  it('filters by column id and status', () => {
    expect(filterCardRows(rows, { columnId: 'done' }).map((row) => row.sessionID)).toEqual([
      'ses_2',
    ]);
    expect(filterCardRows(rows, { status: 'failed' }).map((row) => row.sessionID)).toEqual([
      'ses_3',
    ]);
  });

  it('filters projects by id or directory prefix', () => {
    expect(filterCardRows(rows, { project: 'proj_2' }).map((row) => row.sessionID)).toEqual([
      'ses_2',
    ]);
    expect(filterCardRows(rows, { project: '/work/mono' }).map((row) => row.sessionID)).toEqual([
      'ses_1',
    ]);
    expect(filterCardRows(rows, { project: '/work/mo' })).toEqual([]);
  });

  it('matches text case-insensitively across title, directory, and subpath', () => {
    expect(filterCardRows(rows, { text: 'SHIP' }).map((row) => row.sessionID)).toEqual(['ses_2']);
    expect(filterCardRows(rows, { text: 'apps/web' }).map((row) => row.sessionID)).toEqual([
      'ses_2',
    ]);
    expect(filterCardRows(rows, { text: '/work/mono' }).map((row) => row.sessionID)).toEqual([
      'ses_1',
    ]);
  });

  it('combines filters', () => {
    expect(
      filterCardRows(rows, { status: 'idle', project: 'proj_2', text: 'ship' }).map(
        (row) => row.sessionID,
      ),
    ).toEqual(['ses_2']);
    expect(filterCardRows(rows, { status: 'running', columnId: 'done' })).toEqual([]);
  });
});
