import { Command } from '@opencode/plugin/gui';

import type { UiContext } from './client';
import { openQuickBoard } from './dialog';

const TAB_ID = 'board';

export function boardKey(ctx: UiContext): string {
  return `${ctx.id}:${TAB_ID}`;
}

/** Shows the board on the routed session, or the quick board from Home. Never hides it. */
export function openBoard(ctx: UiContext): void {
  const session = ctx.sessions.current();
  if (!session) {
    openQuickBoard(ctx);
    return;
  }

  const key = boardKey(ctx);
  if (ctx.layout.state(key, session) !== 'visible') {
    ctx.layout.open(key, session, { tab: 'select' });
  }
}

/** The command's behavior: hide the board when it is the one showing. */
function toggleBoard(ctx: UiContext): void {
  const session = ctx.sessions.current();
  if (!session) {
    openQuickBoard(ctx);
    return;
  }

  const key = boardKey(ctx);
  if (ctx.layout.state(key, session) === 'visible') ctx.layout.hide(key, session);
  else ctx.layout.open(key, session, { tab: 'select' });
}

/** `kanban.open`, with `mod+shift+b` and `/kanban`. */
export function addCommands(ctx: UiContext): void {
  ctx.add(Command, (): Command => ({
    id: 'open',
    title: ctx.t('command.open'),
    description: ctx.t('command.openDescription'),
    keywords: 'kanban board sessions',
    group: ctx.t('board.title'),
    bind: 'mod+shift+b',
    slash: { name: 'kanban' },
    run: () => toggleBoard(ctx),
  }));
}
