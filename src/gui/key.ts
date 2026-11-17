import type { UiContext } from './client';

const BOARD_TAB = 'board';

/** The panel tab and command key: `<plugin id>:board`. */
export function boardKey(ctx: UiContext): string {
  return `${ctx.id}:${BOARD_TAB}`;
}

/**
 * The routed session screen, when one is showing. `Sessions.current()` can still hold the last
 * session on Home, so the screen is the signal that a session surface is up.
 */
export function routedSession(ctx: UiContext) {
  return ctx.screen.current() ? ctx.sessions.current() : undefined;
}
