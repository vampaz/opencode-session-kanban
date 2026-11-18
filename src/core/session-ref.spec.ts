import { describe, expect, it } from 'vitest';

import { SESSION_LIST_LIMIT, SESSION_SERVER, sessionIDOfKey, sessionKeyOf } from './session-ref';

describe('sessionKeyOf', () => {
  it('joins the server id and the session id with a newline', () => {
    expect(sessionKeyOf('ses_1')).toBe('sidecar\nses_1');
    expect(sessionKeyOf('ses_1')).toBe(`${SESSION_SERVER}\nses_1`);
  });
});

describe('sessionIDOfKey', () => {
  it('reads back the id sessionKeyOf wrote', () => {
    expect(sessionIDOfKey(sessionKeyOf('ses_1'))).toBe('ses_1');
  });

  it('treats a key without a newline as the id itself', () => {
    expect(sessionIDOfKey('ses_1')).toBe('ses_1');
  });

  it('keeps newlines after the first one', () => {
    expect(sessionIDOfKey('sidecar\nses_1\npart')).toBe('ses_1\npart');
  });

  it('returns the empty suffix of a bare server prefix', () => {
    expect(sessionIDOfKey(`${SESSION_SERVER}\n`)).toBe('');
  });
});

describe('SESSION_LIST_LIMIT', () => {
  it('is the one page size the board asks for', () => {
    expect(SESSION_LIST_LIMIT).toBe(200);
  });
});
