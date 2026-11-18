import { Show } from 'solid-js';
import type { UiMenuEntry } from '@opencode/plugin/gui';

import type { Column } from '../core/board';
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
  readonly columnId: string;
  readonly pinned: boolean;
  readonly task: string | null;
};

export type CardActions = {
  open(card: CardView): void;
  moveTo(card: CardView, columnId: string): void;
  fork(card: CardView): void;
  togglePin(card: CardView): void;
  archive(card: CardView): void;
  copyID(card: CardView): void;
};

export function SessionCard(props: {
  ctx: UiContext;
  card: CardView;
  columns: readonly Column[];
  dragging: boolean;
  actions: CardActions;
  onDragStart(event: DragEvent, card: CardView): void;
  onDragEnd(): void;
  onDrop(event: DragEvent, card: CardView): void;
}) {
  const ctx = props.ctx;
  const project = () => projectLabel(props.card.directory, props.card.subpath);
  const activity = () => formatRelative(props.card.updated, Date.now(), ctx.locale.locale());

  function menuItems(): UiMenuEntry[] {
    return [
      {
        label: ctx.t('card.open'),
        icon: 'square-arrow-top-right',
        onSelect: () => props.actions.open(props.card),
      },
      {
        type: 'group',
        label: ctx.t('card.moveTo'),
        items: props.columns.map((column) => ({
          label: column.title,
          disabled: column.id === props.card.columnId,
          onSelect: () => props.actions.moveTo(props.card, column.id),
        })),
      },
      { label: ctx.t('card.fork'), icon: 'fork', onSelect: () => props.actions.fork(props.card) },
      {
        label: props.card.pinned ? ctx.t('card.unpin') : ctx.t('card.pin'),
        icon: props.card.pinned ? 'arrow-down-to-line' : 'arrow-up',
        onSelect: () => props.actions.togglePin(props.card),
      },
      {
        label: ctx.t('card.archive'),
        icon: 'archive',
        onSelect: () => props.actions.archive(props.card),
      },
      {
        label: ctx.t('card.copyID'),
        icon: 'copy',
        onSelect: () => props.actions.copyID(props.card),
      },
    ];
  }

  return (
    <article
      class="sk-card"
      classList={{
        'sk-card--fork': props.card.kind === 'fork',
        'sk-card--archived': props.card.archived,
        'sk-card--dragging': props.dragging,
      }}
      draggable={!props.card.archived}
      onDragStart={(event) => props.onDragStart(event, props.card)}
      onDragEnd={() => props.onDragEnd()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onDrop(event, props.card);
      }}
    >
      <div class="sk-card__head">
        <Show when={props.card.kind === 'fork'}>
          <span class="sk-card__marker">
            <ctx.ui.Icon name="fork" size="small" />
            <span class="sk-sr-only">{ctx.t('card.fork')}</span>
          </span>
        </Show>
        <span class="sk-card__title">{props.card.title}</span>
        <span class="sk-card__pin">
          <Show when={props.card.pinned}>
            <ctx.ui.Icon name="arrow-up" size="small" />
            <span class="sk-sr-only">{ctx.t('card.pinned')}</span>
          </Show>
        </span>
        <span class="sk-card__menu" onClick={(event) => event.stopPropagation()}>
          <ctx.ui.Menu
            trigger="icon"
            icon="outline-dots"
            label={ctx.t('card.actions')}
            items={menuItems()}
          />
        </span>
      </div>

      <div class="sk-card__meta">
        <span title={props.card.directory}>{project()}</span>
        <span aria-hidden="true">·</span>
        <span>{activity()}</span>
      </div>

      <div class="sk-card__meta">
        <span class={`sk-status sk-status--${props.card.status}`}>
          <span class="sk-status__dot" aria-hidden="true" />
          {ctx.t(`status.${props.card.status}`)}
        </span>
        <Show when={props.card.agent}>{(agent) => <span>{agent()}</span>}</Show>
        <Show when={props.card.model}>{(model) => <span>{model()}</span>}</Show>
        <Show when={props.card.cost > 0}>
          <span>{formatCost(props.card.cost, ctx.locale.locale())}</span>
        </Show>
      </div>

      <Show when={props.card.task}>
        {(task) => (
          <span class="sk-card__task" title={task()}>
            {ctx.t('card.taskQueued')}
          </span>
        )}
      </Show>
    </article>
  );
}
