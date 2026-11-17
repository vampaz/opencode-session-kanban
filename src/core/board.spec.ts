import { describe, expect, it } from 'vitest';

import { DEFAULT_COLUMNS } from './board';

describe('DEFAULT_COLUMNS', () => {
  it('holds the settled default columns in order', () => {
    expect(DEFAULT_COLUMNS.map((column) => column.title)).toEqual([
      'Backlog',
      'In progress',
      'Waiting',
      'Done',
      'Failed',
    ]);
  });

  it('uses unique ids and a stable order', () => {
    expect(new Set(DEFAULT_COLUMNS.map((column) => column.id)).size).toBe(DEFAULT_COLUMNS.length);
    expect(DEFAULT_COLUMNS.map((column) => column.order)).toEqual([0, 1, 2, 3, 4]);
  });
});
