import type { Command } from '@opencode/plugin/gui';

import type { UiContext } from './client';
import { QuickBoardDialog } from './dialog';

/** `kanban.open`: toggles the board and opens the quick board from anywhere else. */
export function boardCommand(ctx: UiContext): Command {
  return {
    id: 'open',
    title: ctx.t('command.open'),
    group: ctx.t('board.title'),
    bind: 'mod+shift+b',
    run: () => {
      ctx.dialogs.open(() => <QuickBoardDialog ctx={ctx} />);
    },
  };
}
