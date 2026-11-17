import { describe, expect, it } from 'vitest';

import { isArchived, performArchive, type ArchiveApi, type ArchiveState } from './archive';

function fakeApi(ignoresArchived: boolean): ArchiveApi {
  let state: ArchiveState = { time: { updated: 1 } };

  return {
    async update({ archived }) {
      if (!ignoresArchived) {
        state = archived ? { time: { updated: 2, archived: 2 } } : { time: { updated: 3 } };
      }
    },
    async get() {
      return state;
    },
  };
}

describe('isArchived', () => {
  it('reads the archived timestamp', () => {
    expect(isArchived({ time: { archived: 1 } })).toBe(true);
    expect(isArchived({ time: { updated: 1 } })).toBe(false);
    expect(isArchived({})).toBe(false);
  });
});

describe('performArchive', () => {
  it('reports success only when the read-back shows the flag', async () => {
    expect(await performArchive(fakeApi(false), 'ses_1', true)).toBe(true);
    expect(await performArchive(fakeApi(false), 'ses_1', false)).toBe(true);
  });

  it('reports failure when the server ignores the archived flag', async () => {
    expect(await performArchive(fakeApi(true), 'ses_1', true)).toBe(false);
  });
});
