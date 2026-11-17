import { Board } from './board';
import type { UiContext } from './client';

/** The quick board: the same view in a dialog, so it also works from Home and drafts. */
export function openQuickBoard(ctx: UiContext): void {
  ctx.dialogs.open((dialog) => (
    <ctx.ui.Dialog
      title={ctx.t('board.title')}
      size="x-large"
      footer={<ctx.ui.Button onClick={() => dialog.close()}>{ctx.t('dialog.close')}</ctx.ui.Button>}
    >
      <div style={{ height: '60vh', display: 'flex' }}>
        <Board ctx={ctx} />
      </div>
    </ctx.ui.Dialog>
  ));
}
