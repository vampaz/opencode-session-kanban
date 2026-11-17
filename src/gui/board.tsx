import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { UiMenuEntry } from '@opencode/plugin/gui';

import { type BoardDocument, type Column, type Placement } from '../core/board';
import { filterCards, isFiltering } from '../core/filter';
import { groupForks, projectLabel, selectCards, type CardStatus } from '../core/status';
import { SessionCard, type CardView } from './card';
import { kanbanClient, type UiContext } from './client';
import { activityOf, factsOf, rowsOf, serverOf } from './sessions';
import { useViewFilters } from './view';

type Phase = 'loading' | 'ready' | 'stale' | 'error';

type ColumnView = { readonly column: Column; readonly cards: readonly CardView[] };

const STATUSES: readonly ('all' | CardStatus)[] = [
  'all',
  'idle',
  'running',
  'waiting',
  'failed',
  'interrupted',
];

/**
 * The read-only board. Reads the document through RPC and the sessions from the window's synced
 * data; a `changed` event or a reconnection refreshes it. It never writes.
 */
export function Board(props: { ctx: UiContext }) {
  const ctx = props.ctx;
  const view = useViewFilters(ctx);
  const [board, setBoard] = createSignal<BoardDocument>();
  const [error, setError] = createSignal<string>();

  const server = () => serverOf(ctx);
  const connected = () => server()?.connected ?? false;
  const filters = () => view.filters();

  const phase = (): Phase => {
    if (!board()) return error() ? 'error' : 'loading';
    return connected() ? 'ready' : 'stale';
  };

  async function refresh(): Promise<void> {
    try {
      setBoard((await kanbanClient(ctx).snapshot({})) as BoardDocument);
      setError(undefined);
    } catch (cause) {
      console.error('[kanban] snapshot failed', cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  /** Loads the sessions of every project once, then the window's synced data keeps them current. */
  let listing = false;
  async function bootstrap(): Promise<void> {
    const current = server();
    if (!current || listing) return;

    listing = true;
    try {
      const response = await current.client.session.list({
        parentID: null,
        archived: false,
        limit: 200,
      });
      for (const info of response.data) current.data.session.remember(info);
    } catch (cause) {
      console.error('[kanban] could not list sessions', cause);
    } finally {
      listing = false;
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRefresh(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void refresh();
    }, 100);
  }

  onMount(() => {
    void bootstrap();
    void refresh();
    const stop = kanbanClient(ctx).events.on('changed', () => scheduleRefresh());
    onCleanup(() => {
      stop();
      if (timer !== undefined) clearTimeout(timer);
    });
  });

  let wasConnected: boolean | undefined;
  createEffect(() => {
    const now = connected();
    if (wasConnected === false && now) {
      void bootstrap();
      scheduleRefresh();
    }
    wasConnected = now;
  });

  const cards = createMemo<CardView[]>(() => {
    const current = server();
    if (!current) return [];

    const rows = rowsOf(current);
    const states = selectCards(factsOf(rows), {
      ...activityOf(current),
      showSubagents: board()?.settings.showSubagents ?? false,
    });
    const byID = new Map(rows.map((row) => [row.id, row]));

    return states.map((state) => {
      const row = byID.get(state.id);
      return {
        ...state,
        key: `${current.id}\n${state.id}`,
        title: row?.title?.trim() || ctx.t('card.untitled'),
        directory: row?.location.directory ?? '',
        subpath: row?.subpath,
        agent: row?.agent,
        model: row?.model?.id,
        cost: row?.cost ?? 0,
      };
    });
  });

  const filtered = createMemo(() => filterCards(cards(), filters()));

  const columns = createMemo<ColumnView[]>(() => {
    const document = board();
    if (!document) return [];

    const fallback =
      document.columns.find((column) => column.id === document.defaultColumn) ??
      document.columns[0];
    const byColumn = new Map<string, CardView[]>(document.columns.map((column) => [column.id, []]));

    for (const card of filtered()) {
      const placement = document.placements[card.key];
      const columnID =
        placement && byColumn.has(placement.columnId) ? placement.columnId : fallback?.id;
      if (columnID) byColumn.get(columnID)?.push(card);
    }

    return document.columns.map((column) => {
      const placed = (byColumn.get(column.id) ?? [])
        .slice()
        .sort(comparePlacements(document.placements, column.id));
      return { column, cards: groupForks(placed) };
    });
  });

  function projects(): string[] {
    return [
      ...new Set(
        cards()
          .map((card) => card.directory)
          .filter((value) => value !== ''),
      ),
    ].sort((left, right) => projectLabel(left).localeCompare(projectLabel(right)));
  }

  function statusLabel(status: 'all' | CardStatus): string {
    return status === 'all' ? ctx.t('filters.anyStatus') : ctx.t(`status.${status}`);
  }

  function projectItems(): UiMenuEntry[] {
    return [
      { label: ctx.t('filters.allProjects'), onSelect: () => view.set('project', '') },
      ...projects().map((directory) => ({
        label: projectLabel(directory),
        onSelect: () => view.set('project', directory),
      })),
    ];
  }

  function statusItems(): UiMenuEntry[] {
    return STATUSES.map((status) => ({
      label: statusLabel(status),
      onSelect: () => view.set('status', status),
    }));
  }

  return (
    <div class="sk-board">
      <div class="sk-filters">
        <ctx.ui.TextInput
          label={ctx.t('filters.text')}
          placeholder={ctx.t('filters.textHint')}
          value={filters().text}
          onInput={(value) => view.set('text', value)}
        />
        <div class="sk-filters__row">
          <ctx.ui.Menu
            trigger="button"
            icon="folder"
            label={
              filters().project ? projectLabel(filters().project) : ctx.t('filters.allProjects')
            }
            items={projectItems()}
          />
          <ctx.ui.Menu
            trigger="button"
            icon="status"
            label={statusLabel(filters().status)}
            items={statusItems()}
          />
          <ctx.ui.Switch
            label={ctx.t('filters.attention')}
            checked={filters().attentionOnly}
            onChange={(checked) => view.set('attentionOnly', checked)}
          />
          <Show when={isFiltering(filters())}>
            <ctx.ui.Button variant="ghost" size="small" icon="reset" onClick={view.reset}>
              {ctx.t('filters.clear')}
            </ctx.ui.Button>
          </Show>
        </div>
      </div>

      <Show when={phase() === 'stale' || (phase() === 'ready' && error() !== undefined)}>
        <p class="sk-banner">{ctx.t(phase() === 'stale' ? 'board.stale' : 'board.error')}</p>
      </Show>

      <Show when={phase() === 'loading'}>
        <div class="sk-center">
          <ctx.ui.Loader />
          <span>{ctx.t('board.loading')}</span>
        </div>
      </Show>

      <Show when={phase() === 'error'}>
        <div class="sk-center">
          <span>{ctx.t('board.error')}</span>
          <Show when={error()}>{(detail) => <p class="sk-detail">{detail()}</p>}</Show>
          <ctx.ui.Button onClick={() => void refresh()}>{ctx.t('board.retry')}</ctx.ui.Button>
        </div>
      </Show>

      <Show when={phase() === 'ready' || phase() === 'stale'}>
        <Show
          when={filtered().length > 0}
          fallback={
            <div class="sk-empty">
              <span>{ctx.t(cards().length === 0 ? 'board.empty' : 'board.emptyFiltered')}</span>
              <Show when={isFiltering(filters())}>
                <ctx.ui.Button variant="ghost" size="small" icon="reset" onClick={view.reset}>
                  {ctx.t('filters.clear')}
                </ctx.ui.Button>
              </Show>
            </div>
          }
        >
          <div class="sk-columns">
            <For each={columns()}>
              {(entry) => (
                <section class="sk-column">
                  <header class="sk-column__head">
                    <span>{entry.column.title}</span>
                    <span class="sk-column__count">{entry.cards.length}</span>
                  </header>
                  <Show
                    when={entry.cards.length > 0}
                    fallback={<p class="sk-column__empty">{ctx.t('board.columnEmpty')}</p>}
                  >
                    <For each={entry.cards}>{(card) => <SessionCard ctx={ctx} card={card} />}</For>
                  </Show>
                </section>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function comparePlacements(placements: Readonly<Record<string, Placement>>, columnID: string) {
  return (left: CardView, right: CardView): number => {
    const leftPlacement = placements[left.key];
    const rightPlacement = placements[right.key];
    const leftPosition =
      leftPlacement?.columnId === columnID ? leftPlacement.position : Number.POSITIVE_INFINITY;
    const rightPosition =
      rightPlacement?.columnId === columnID ? rightPlacement.position : Number.POSITIVE_INFINITY;

    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    return right.updated - left.updated;
  };
}
