import { Show } from 'solid-js';

import { projectLabel, type CardState } from '../core/status';
import type { UiContext } from './client';
import { formatCost, formatRelative } from './format';

export type CardView = CardState & {
  readonly key: string;
  readonly title: string;
  readonly directory: string;
  readonly subpath?: string | undefined;
  readonly agent?: string | undefined;
  readonly model?: string | undefined;
  readonly cost: number;
};

/** One session on the board. Read-only in M1: nothing here writes to the server. */
export function SessionCard(props: { ctx: UiContext; card: CardView }) {
  const ctx = props.ctx;
  const project = () => projectLabel(props.card.directory, props.card.subpath);
  const activity = () => formatRelative(props.card.updated, Date.now(), ctx.locale.locale());

  return (
    <article class="sk-card" classList={{ 'sk-card--fork': props.card.kind === 'fork' }}>
      <div class="sk-card__head">
        <Show when={props.card.kind === 'fork'}>
          <span class="sk-card__marker">
            <ctx.ui.Icon name="fork" size="small" />
            <span class="sk-sr-only">{ctx.t('card.fork')}</span>
          </span>
        </Show>
        <span class="sk-card__title">{props.card.title}</span>
        <span class={`sk-status sk-status--${props.card.status}`}>
          <span class="sk-status__dot" aria-hidden="true" />
          {ctx.t(`status.${props.card.status}`)}
        </span>
      </div>

      <div class="sk-card__meta">
        <span title={props.card.directory}>{project()}</span>
        <span aria-hidden="true">·</span>
        <span>{activity()}</span>
      </div>

      <Show when={props.card.agent || props.card.model || props.card.cost > 0}>
        <div class="sk-card__meta">
          <Show when={props.card.agent}>{(agent) => <span>{agent()}</span>}</Show>
          <Show when={props.card.model}>{(model) => <span>{model()}</span>}</Show>
          <Show when={props.card.cost > 0}>
            <span>{formatCost(props.card.cost, ctx.locale.locale())}</span>
          </Show>
        </div>
      </Show>
    </article>
  );
}
