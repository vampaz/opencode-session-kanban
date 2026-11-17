import { MenuItem } from '@opencode/plugin/gui';

import { openBoard } from './command';
import type { UiContext } from './client';

/** The launcher row in the side region's + menu and New tab view. */
export function addMenuItems(ctx: UiContext): void {
  ctx.add(MenuItem, (): MenuItem => {
    return {
      menu: 'session.panel',
      id: 'board',
      title: ctx.t('board.title'),
      icon: 'dot-grid',
      keybind: `${ctx.id}.open`,
      run: () => openBoard(ctx),
    };
  });
}
