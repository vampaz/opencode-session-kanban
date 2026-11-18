/** The only server the board serves in v1: the desktop's built-in one. */
export const SESSION_SERVER = 'sidecar';

/** The session list every caller asks for, so the server and the GUI stay in step. */
export const SESSION_LIST_LIMIT = 200;

/** A placement key: the server id, a newline, and the session id. */
export function sessionKeyOf(sessionID: string): string {
  return `${SESSION_SERVER}\n${sessionID}`;
}

/** The session id inside a placement key. A key without a newline is the id itself. */
export function sessionIDOfKey(key: string): string {
  const index = key.indexOf('\n');
  return index === -1 ? key : key.slice(index + 1);
}
