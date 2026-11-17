import type { UiContext } from './client';

/** The settings page: columns, default column, archived behaviour, idle minutes, rules. */
export function KanbanSettings(props: { ctx: UiContext }) {
  return (
    <p style={{ margin: '0', padding: '12px 0', opacity: '0.7' }}>
      {props.ctx.t('settings.placeholder')}
    </p>
  );
}
