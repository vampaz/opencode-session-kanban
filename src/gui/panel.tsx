import { Board } from './board';
import type { UiContext } from './client';

/** The side panel's tab content. The panel registration itself lands with the first real board. */
export function BoardPanel(props: { ctx: UiContext }) {
  return <Board ctx={props.ctx} />;
}
