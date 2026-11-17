import { describe, expect, it } from 'vitest';

import { commitText } from './text-field';

describe('commitText', () => {
  it('saves a changed, trimmed value', () => {
    expect(commitText('  Done ', 'Backlog')).toEqual({ kind: 'save', value: 'Done' });
  });

  it('leaves an unchanged value alone', () => {
    expect(commitText('Backlog', 'Backlog')).toEqual({ kind: 'none' });
    expect(commitText('  Backlog  ', 'Backlog')).toEqual({ kind: 'none' });
  });

  it('reverts an empty or blank value', () => {
    expect(commitText('', 'Backlog')).toEqual({ kind: 'revert' });
    expect(commitText('   ', 'Backlog')).toEqual({ kind: 'revert' });
  });
});
