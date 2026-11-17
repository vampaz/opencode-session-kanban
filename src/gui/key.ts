import type { UiContext } from './client';

export const BOARD_TAB = 'board';

/** The panel tab and command key: `<plugin id>:board`. */
export function boardKey(ctx: UiContext): string {
  return `${ctx.id}:${BOARD_TAB}`;
}
