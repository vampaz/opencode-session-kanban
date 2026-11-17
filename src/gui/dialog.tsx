import { Board } from './board';
import type { UiContext } from './client';

/** The quick board, the same view in a dialog so it also works from Home and drafts. */
export function QuickBoardDialog(props: { ctx: UiContext }) {
  return <Board ctx={props.ctx} />;
}
