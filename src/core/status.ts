/** Derived on read from session info and the window's synced data. Never stored on a card. */
export type CardStatus = 'idle' | 'running' | 'waiting' | 'failed' | 'interrupted';

/** What a session is on the board. A child is a subagent only when it has no `fork`. */
export type CardKind = 'root' | 'fork' | 'subagent';
