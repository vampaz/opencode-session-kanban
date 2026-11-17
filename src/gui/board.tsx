import type { UiContext } from './client';

/** The board view. Columns, cards, filters and drag and drop land here in M1 and M2. */
export function Board(props: { ctx: UiContext }) {
  return (
    <p style={{ margin: '0', padding: '12px', opacity: '0.7' }}>
      {props.ctx.t('board.placeholder')}
    </p>
  );
}
