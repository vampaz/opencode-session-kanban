import { Command } from '@opencode/plugin/gui';

import type { UiContext } from './client';
import { openQuickBoard } from './dialog';

const TAB_ID = 'board';

/** `kanban.open`: toggles the board on the routed session, and opens the quick board from Home. */
export function addCommands(ctx: UiContext): void {
  ctx.add(Command, () => ({
    id: 'open',
    title: ctx.t('command.open'),
    group: ctx.t('board.title'),
    keywords: 'kanban board sessions',
    bind: 'mod+shift+b',
    run: () => {
      const session = ctx.sessions.current();
      if (!session) {
        openQuickBoard(ctx);
        return;
      }

      const key = `${ctx.id}:${TAB_ID}`;
      if (ctx.layout.state(key, session) === 'visible') ctx.layout.hide(key, session);
      else ctx.layout.open(key, session, { tab: 'select' });
    },
  }));
}
