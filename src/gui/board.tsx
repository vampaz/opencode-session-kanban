import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { SessionRef, UiMenuEntry } from '@opencode/plugin/gui';

import { type BoardDocument, type Column, dropPlacement, prunePlacements } from '../core/board';
import { selectBootstrapSessions } from '../core/bootstrap';
import { filterCards, isFiltering } from '../core/filter';
import { groupForks, projectLabel, selectCards, type CardStatus } from '../core/status';
import { SessionCard, type CardActions, type CardView } from './card';
import { kanbanClient, type UiContext } from './client';
import { boardKey, routedSession } from './key';
import { openNewSession } from './new-session';
import { activityOf, factsOf, isGone, rowsOf, serverOf } from './sessions';
import { useViewFilters } from './view';

type Phase = 'loading' | 'ready' | 'stale' | 'error';

type ColumnView = {
  readonly column: Column;
  readonly cards: readonly CardView[];
  /** Every card key in the column, in placement order, for drop indexes. */
  readonly order: readonly string[];
};

const STATUSES: readonly ('all' | CardStatus)[] = [
  'all',
  'idle',
  'running',
  'waiting',
  'failed',
  'interrupted',
];

/** The fork pass reads at most this many pages before it stops. */
const FORK_PAGES = 5;

/**
 * The board. Reads the document through RPC and the sessions from the window's synced data.
 * Moves are optimistic: the dropped document renders at once and reverts when the write fails.
 */
export function Board(props: {
  ctx: UiContext;
  session?: () => SessionRef | undefined;
  directory?: () => string | undefined;
}) {
  const ctx = props.ctx;
  const view = useViewFilters(ctx);
  const [board, setBoard] = createSignal<BoardDocument>();
  const [error, setError] = createSignal<string>();
  const [dragging, setDragging] = createSignal<string>();
  const [overColumn, setOverColumn] = createSignal<string>();
  const [bootstrapped, setBootstrapped] = createSignal(false);

  const server = () => serverOf(ctx);
  const connected = () => server()?.connected ?? false;
  const filters = () => view.filters();
  const routed = () => props.session?.() ?? routedSession(ctx);

  const phase = (): Phase => {
    if (!board()) return error() ? 'error' : 'loading';
    return connected() ? 'ready' : 'stale';
  };

  function fail(toastKey: string, cause?: unknown): void {
    if (cause !== undefined) console.error('[kanban]', cause);
    ctx.toast.show({ title: ctx.t(toastKey), variant: 'error' });
  }

  async function refresh(): Promise<void> {
    try {
      setBoard((await kanbanClient(ctx).snapshot({})) as BoardDocument);
      setError(undefined);
    } catch (cause) {
      console.error('[kanban] snapshot failed', cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  /**
   * Roots first, then one capped pass over every non-archived session for the forks whose root is
   * not loaded yet. Only forks and their missing ancestors are remembered, so subagents stay out.
   */
  let listing = false;
  async function bootstrap(): Promise<void> {
    const current = server();
    if (!current || listing) return;
    listing = true;
    setBootstrapped(false);

    try {
      const roots = await current.client.session.list({
        parentID: null,
        archived: false,
        limit: 200,
      });
      for (const info of roots.data) current.data.session.remember(info);

      let cursor: string | undefined;
      for (let page = 0; page < FORK_PAGES; page += 1) {
        const response = await current.client.session.list({
          archived: false,
          limit: 200,
          ...(cursor ? { cursor } : {}),
        });
        const known = new Set(current.data.session.list().map((info) => info.id));
        const picks = selectBootstrapSessions(response.data, known, {
          showSubagents: board()?.settings.showSubagents ?? false,
        });

        for (const pick of picks) {
          const info = response.data.find((row) => row.id === pick.id);
          if (info) current.data.session.remember(info);
        }

        const next = response.cursor.next ?? undefined;
        if (!next || next === cursor) break;
        cursor = next;
      }
    } catch (cause) {
      console.error('[kanban] could not list sessions', cause);
    } finally {
      listing = false;
      setBootstrapped(true);
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
    const document = board();
    const current = server();
    if (!document || !current) return [];

    const rows = rowsOf(current);
    const states = selectCards(factsOf(rows), {
      ...activityOf(current),
      showSubagents: document.settings.showSubagents,
      includeArchived: document.settings.archived === 'column',
    });
    const byID = new Map(rows.map((row) => [row.id, row]));

    return states.map((state) => {
      const row = byID.get(state.id);
      const key = `${current.id}\n${state.id}`;
      const placement = document.placements[key];
      const columnId =
        placement && document.columns.some((column) => column.id === placement.columnId)
          ? placement.columnId
          : document.defaultColumn;

      return {
        ...state,
        key,
        columnId,
        pinned: placement?.pinned ?? false,
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

    const all = cards();
    const visible = filtered();
    const compare = comparePlacements(document);
    const archived = document.settings.archived === 'column';

    const views = document.columns.map((column) => {
      const order = all
        .filter((card) => card.columnId === column.id && !(archived && card.archived))
        .sort(compare)
        .map((card) => card.key);
      const list = visible
        .filter((card) => card.columnId === column.id && !(archived && card.archived))
        .sort(compare);
      return { column, order, cards: groupForks(list) };
    });

    if (archived) {
      const column: Column = {
        id: 'archived',
        title: ctx.t('board.archivedColumn'),
        order: Number.MAX_SAFE_INTEGER,
        color: null,
      };
      views.push({
        column,
        order: [],
        cards: groupForks(visible.filter((card) => card.archived)),
      });
    }

    return views;
  });

  function indexFor(columnId: string, beforeKey?: string, excludeKey?: string): number {
    const entry = columns().find((candidate) => candidate.column.id === columnId);
    if (!entry) return 0;

    const order = excludeKey ? entry.order.filter((key) => key !== excludeKey) : entry.order;
    if (!beforeKey) return order.length;

    const index = order.indexOf(beforeKey);
    return index === -1 ? order.length : index;
  }

  function indexAfter(columnId: string, key: string, excludeKey?: string): number {
    const entry = columns().find((candidate) => candidate.column.id === columnId);
    if (!entry) return 0;

    const order = excludeKey ? entry.order.filter((item) => item !== excludeKey) : entry.order;
    const index = order.indexOf(key);
    return index === -1 ? order.length : index + 1;
  }

  async function moveCard(sessionKey: string, columnId: string, index: number): Promise<void> {
    const previous = board();
    if (!previous) return;

    const optimistic = dropPlacement(previous, {
      sessionKey,
      columnId,
      index,
      updatedAt: Date.now(),
    }).board;
    setBoard(optimistic);
    setDragging(undefined);
    setOverColumn(undefined);

    try {
      await kanbanClient(ctx).move({ sessionKey, columnId, index });
      await refresh();
    } catch (cause) {
      setBoard(previous);
      fail('move.failed', cause);
    }
  }

  function dragKey(event: DragEvent): string {
    return event.dataTransfer?.getData('text/plain') || dragging() || '';
  }

  function dragStart(event: DragEvent, card: CardView): void {
    setDragging(card.key);
    event.dataTransfer?.setData('text/plain', card.key);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function dragEnd(): void {
    setDragging(undefined);
    setOverColumn(undefined);
  }

  function dropOnColumn(event: DragEvent, columnId: string): void {
    event.preventDefault();
    const sessionKey = dragKey(event);
    setDragging(undefined);
    setOverColumn(undefined);
    if (!sessionKey) return;
    void moveCard(sessionKey, columnId, indexFor(columnId, undefined, sessionKey));
  }

  function dropOnCard(event: DragEvent, card: CardView): void {
    const sessionKey = dragKey(event);
    setDragging(undefined);
    setOverColumn(undefined);
    if (!sessionKey || sessionKey === card.key) return;
    void moveCard(sessionKey, card.columnId, indexFor(card.columnId, card.key, sessionKey));
  }

  function openCard(card: CardView): void {
    const current = server();
    if (!current) return;

    ctx.tabs.open({ server: current.id, id: card.id }, { focus: true });

    const session = routed();
    const key = boardKey(ctx);
    if (ctx.layout.narrow() && session && ctx.layout.state(key, session) === 'visible') {
      ctx.layout.hide(key, session);
    }
  }

  async function togglePin(card: CardView): Promise<void> {
    try {
      await kanbanClient(ctx).setPinned({ sessionKey: card.key, pinned: !card.pinned });
      await refresh();
    } catch (cause) {
      fail('pin.failed', cause);
    }
  }

  async function archiveCard(card: CardView): Promise<void> {
    const current = server();
    if (!current) return;

    try {
      await current.client.session.update({ sessionID: card.id, archived: true });
    } catch (cause) {
      fail('archive.failed', cause);
    }
  }

  async function copyCard(card: CardView): Promise<void> {
    try {
      await ctx.system.copy(card.id);
      ctx.toast.show({ title: ctx.t('card.copied') });
    } catch (cause) {
      fail('copy.failed', cause);
    }
  }

  async function forkCard(card: CardView): Promise<void> {
    const current = server();
    if (!current) return;

    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t('fork.title', { title: card.title }),
      description: ctx.t('fork.description'),
      confirm: ctx.t('fork.confirm'),
    });
    if (!confirmed) return;

    try {
      const info = await current.client.session.fork({ sessionID: card.id });
      current.data.session.remember(info);

      const forkKey = `${current.id}\n${info.id}`;
      await kanbanClient(ctx).move({
        sessionKey: forkKey,
        columnId: card.columnId,
        index: indexAfter(card.columnId, card.key, forkKey),
      });

      ctx.tabs.open({ server: current.id, id: info.id }, { focus: true });
    } catch (cause) {
      fail('fork.failed', cause);
    }
  }

  const actions: CardActions = {
    open: openCard,
    moveTo: (card, columnId) => {
      void moveCard(card.key, columnId, indexFor(columnId, undefined, card.key));
    },
    fork: (card) => {
      void forkCard(card);
    },
    togglePin: (card) => {
      void togglePin(card);
    },
    archive: (card) => {
      void archiveCard(card);
    },
    copyID: (card) => {
      void copyCard(card);
    },
  };

  function addToColumn(column: Column): void {
    openNewSession(ctx, {
      columnId: column.id,
      directory: props.directory?.() ?? routedSession(ctx)?.directory,
      index: () => indexFor(column.id),
    });
  }

  // Placements of deleted sessions and archived families are pruned here, on the read path.
  const prunable = createMemo<readonly string[]>(() => {
    const document = board();
    const current = server();
    if (!document || !current) return [];

    const facts = new Map(factsOf(rowsOf(current)).map((fact) => [fact.id, fact]));
    return prunePlacements(document, (key) => isGone(current, facts, key)).keys;
  });

  let pruning = false;
  createEffect(() => {
    // Never prune while the session list is still loading or paging: an unloaded ancestor would
    // look gone. The pure check keeps unknown ancestors anyway; this is the second guard.
    if (phase() !== 'ready' || !bootstrapped()) return;

    const keys = prunable();
    if (keys.length === 0 || pruning) return;

    pruning = true;
    void kanbanClient(ctx)
      .prune({ keys: [...keys] })
      .catch((cause) => console.error('[kanban] prune failed', cause))
      .finally(() => {
        pruning = false;
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
                <section
                  class="sk-column"
                  classList={{
                    'sk-column--over': dragging() !== undefined && overColumn() === entry.column.id,
                  }}
                  onDragOver={(event) => {
                    if (entry.column.id === 'archived') return;
                    event.preventDefault();
                    setOverColumn(entry.column.id);
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                  }}
                  onDragLeave={() => {
                    if (overColumn() === entry.column.id) setOverColumn(undefined);
                  }}
                  onDrop={(event) => {
                    if (entry.column.id === 'archived') return;
                    dropOnColumn(event, entry.column.id);
                  }}
                >
                  <header class="sk-column__head">
                    <span>{entry.column.title}</span>
                    <span class="sk-column__tools">
                      <span class="sk-column__count">{entry.cards.length}</span>
                      <ctx.ui.IconButton
                        icon="plus"
                        label={ctx.t('column.newSession')}
                        onClick={() => addToColumn(entry.column)}
                      />
                    </span>
                  </header>
                  <Show
                    when={entry.cards.length > 0}
                    fallback={<p class="sk-column__empty">{ctx.t('board.columnEmpty')}</p>}
                  >
                    <For each={entry.cards}>
                      {(card) => (
                        <SessionCard
                          ctx={ctx}
                          card={card}
                          columns={board()?.columns ?? []}
                          dragging={dragging() === card.key}
                          actions={actions}
                          onDragStart={dragStart}
                          onDragEnd={dragEnd}
                          onDrop={dropOnCard}
                        />
                      )}
                    </For>
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

function comparePlacements(document: BoardDocument) {
  return (left: CardView, right: CardView): number => {
    const leftPlacement = document.placements[left.key];
    const rightPlacement = document.placements[right.key];
    const leftPosition =
      leftPlacement?.columnId === left.columnId ? leftPlacement.position : Number.POSITIVE_INFINITY;
    const rightPosition =
      rightPlacement?.columnId === right.columnId
        ? rightPlacement.position
        : Number.POSITIVE_INFINITY;

    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    return right.updated - left.updated;
  };
}
