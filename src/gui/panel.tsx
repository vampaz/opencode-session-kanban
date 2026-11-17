import { Panel, type PanelTab } from '@opencode/plugin/gui';

import { Board } from './board';
import type { UiContext } from './client';

/** The board in every session's side region, pinned at its own width. */
export function addPanel(ctx: UiContext): void {
  const tab: PanelTab = {
    id: 'board',
    get title() {
      return ctx.t('board.title');
    },
    pinned: true,
    closable: false,
    fallback: true,
  };

  ctx.add(Panel, {
    id: 'board',
    region: 'side',
    wide: true,
    width: 900,
    mobile: {
      get title() {
        return ctx.t('board.title');
      },
      order: 40,
      kind: 'menu',
      icon: 'dot-grid',
    },
    list: () => [tab],
    render: () => <Board ctx={ctx} />,
  });
}
