import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';

import { type BoardDocument, type Column, positionBetween } from '../core/board';
import { kanbanClient, type UiContext } from './client';

/** M0 spike only: the identity of the instance that answered the call. */
type Whoami = {
  readonly instanceId: string;
  readonly pid: number;
  readonly directory: string | null;
  readonly setupAt: string;
};

type Card = {
  readonly key: string;
  readonly title: string;
};

/**
 * The board view. Reads the board through RPC and the sessions from the window's synced data.
 * Dragging a card between columns writes a placement; `changed` brings every other window along.
 */
export function Board(props: { ctx: UiContext; directory?: () => string | undefined }) {
  const ctx = props.ctx;
  const [board, setBoard] = createSignal<BoardDocument>();
  const [whoami, setWhoami] = createSignal<Whoami>();
  const [error, setError] = createSignal<string>();
  const [dragging, setDragging] = createSignal<string>();

  const client = () => kanbanClient(ctx);
  const server = () => ctx.servers.get('sidecar');
  const connected = () => server()?.connected ?? false;

  async function refresh(): Promise<void> {
    try {
      const [snapshot, identity] = await Promise.all([client().snapshot({}), client().whoami({})]);
      setBoard(snapshot as BoardDocument);
      setWhoami(identity as Whoami);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
    void refresh();
    const stop = client().events.on('changed', () => scheduleRefresh());
    onCleanup(() => {
      stop();
      if (timer !== undefined) clearTimeout(timer);
    });
  });

  // A window that reconnects does not get missed events, so it re-requests the snapshot.
  let wasConnected: boolean | undefined;
  createEffect(() => {
    const now = connected();
    if (wasConnected === false && now) scheduleRefresh();
    wasConnected = now;
  });

  function cards(): Card[] {
    const current = server();
    if (!current) return [];
    return current.data.session
      .list()
      .filter((info) => !info.parentID)
      .map((info) => ({ key: `${current.id}\n${info.id}`, title: info.title?.trim() || info.id }));
  }

  function placementOf(key: string) {
    return board()?.placements[key];
  }

  /** The column's cards in order: placements by fractional position, then the unplaced ones. */
  function columnCards(columnId: string): Card[] {
    const placed: { card: Card; position: number }[] = [];
    const unplaced: Card[] = [];
    const defaultColumn = board()?.defaultColumn;

    for (const card of cards()) {
      const placement = placementOf(card.key);
      if (placement && placement.columnId === columnId) {
        placed.push({ card, position: placement.position });
      } else if (columnId === defaultColumn && !columnExists(placement?.columnId)) {
        unplaced.push(card);
      }
    }

    placed.sort((left, right) => left.position - right.position);
    return [...placed.map((row) => row.card), ...unplaced];
  }

  function columnExists(columnId: string | undefined): boolean {
    return columnId !== undefined && (board()?.columns ?? []).some((c) => c.id === columnId);
  }

  function positionOf(card: Card | undefined, columnId: string): number | undefined {
    const placement = card ? placementOf(card.key) : undefined;
    return placement?.columnId === columnId ? placement.position : undefined;
  }

  /** Drops a card into a column, before `beforeKey` when given, else at the end. */
  async function drop(sessionKey: string, columnId: string, beforeKey?: string): Promise<void> {
    if (!sessionKey || beforeKey === sessionKey) return;

    const siblings = columnCards(columnId).filter((card) => card.key !== sessionKey);
    const before = beforeKey ? siblings.findIndex((card) => card.key === beforeKey) : -1;
    const index = before === -1 ? siblings.length : before;
    const position = positionBetween(
      positionOf(siblings[index - 1], columnId),
      positionOf(siblings[index], columnId),
    );

    try {
      await client().move({ sessionKey, columnId, position });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    setDragging(undefined);
  }

  function dragged(event: DragEvent): string {
    return event.dataTransfer?.getData('text/plain') || dragging() || '';
  }

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', 'min-height': 0 }}>
      <Show when={error()}>
        {(message) => (
          <p style={{ margin: '0', padding: '8px 12px', 'font-size': '0.8rem' }}>
            {ctx.t('board.error', { message: message() })}
          </p>
        )}
      </Show>

      <div
        style={{
          display: 'flex',
          flex: '1',
          gap: '8px',
          padding: '8px',
          'align-items': 'flex-start',
          'overflow-x': 'auto',
          'overflow-y': 'auto',
        }}
      >
        <For each={board()?.columns ?? []}>
          {(column: Column) => (
            <section
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void drop(dragged(event), column.id);
              }}
              style={{
                display: 'flex',
                'flex-direction': 'column',
                gap: '6px',
                'min-width': '160px',
                width: '200px',
                padding: '8px',
                border: '1px solid',
                'border-radius': '8px',
                'background-color': 'color-mix(in srgb, currentColor 4%, transparent)',
              }}
            >
              <header
                style={{
                  display: 'flex',
                  'justify-content': 'space-between',
                  'font-size': '0.8rem',
                  'font-weight': '600',
                }}
              >
                <span>{column.title}</span>
                <span style={{ opacity: '0.6' }}>{columnCards(column.id).length}</span>
              </header>

              <For
                each={columnCards(column.id)}
                fallback={
                  <p style={{ margin: '0', 'font-size': '0.75rem', opacity: '0.55' }}>
                    {ctx.t('board.dropHere')}
                  </p>
                }
              >
                {(card) => (
                  <article
                    draggable
                    onDragStart={(event) => {
                      setDragging(card.key);
                      event.dataTransfer?.setData('text/plain', card.key);
                      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDragging(undefined)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void drop(dragged(event), column.id, card.key);
                    }}
                    style={{
                      padding: '8px',
                      border: '1px solid',
                      'border-radius': '6px',
                      'background-color': 'inherit',
                      cursor: 'grab',
                      opacity: dragging() === card.key ? '0.5' : '1',
                      'font-size': '0.85rem',
                      'overflow-wrap': 'anywhere',
                    }}
                  >
                    {card.title}
                  </article>
                )}
              </For>
            </section>
          )}
        </For>
      </div>

      <footer
        style={{
          'border-top': '1px solid',
          padding: '8px 12px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '2px',
          'font-size': '0.7rem',
          opacity: '0.7',
          'overflow-wrap': 'anywhere',
        }}
      >
        <strong>{ctx.t('board.diagnostics')}</strong>
        <Show when={whoami()}>
          {(who) => (
            <>
              <span>
                {ctx.t('board.instance', {
                  instance: who().instanceId.slice(0, 8),
                  pid: who().pid,
                })}
              </span>
              <span>
                {ctx.t('board.serving', {
                  directory: who().directory ?? '—',
                  time: who().setupAt,
                })}
              </span>
            </>
          )}
        </Show>
        <Show when={props.directory?.()}>
          {(directory) => <span>{ctx.t('board.routed', { directory: directory() })}</span>}
        </Show>
        <span>
          {ctx.t('board.state', {
            revision: board()?.revision ?? 0,
            connection: ctx.t(connected() ? 'board.connected' : 'board.disconnected'),
          })}
        </span>
      </footer>
    </div>
  );
}
