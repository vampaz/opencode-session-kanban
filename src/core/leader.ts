/** One engine per process: the event stream is server-wide, so only one instance should consume it. */
export const ENGINE_LEADER_KEY = Symbol.for('opencode-session-kanban.engine-leader');

type Starter = (signal: AbortSignal) => () => void;

type Owner = {
  readonly id: symbol;
  readonly controller: AbortController;
  readonly cleanup: () => void;
};

type LeaderState = {
  owner?: Owner;
  readonly waiters: Map<symbol, Starter>;
};

function leaderState(): LeaderState {
  const holder = globalThis as unknown as Record<symbol, LeaderState | undefined>;
  return (holder[ENGINE_LEADER_KEY] ??= { waiters: new Map() });
}

/**
 * Elects one engine per process. The first elector starts at once; the others wait. When the
 * owner's signal aborts (a location unloads, or the plugin reloads), its cleanup runs and the next
 * waiter takes over, so the event stream keeps flowing. `start` returns its own cleanup.
 */
export function electEngine(signal: AbortSignal, start: Starter): () => void {
  if (signal.aborted) return () => undefined;

  const state = leaderState();
  const id = Symbol('engine');
  state.waiters.set(id, start);

  const release = (): void => {
    const owner = state.owner;
    if (owner?.id === id) {
      owner.controller.abort();
      return;
    }

    state.waiters.delete(id);
  };

  signal.addEventListener('abort', release, { once: true });
  promote(state);
  return release;
}

function promote(state: LeaderState): void {
  if (state.owner) return;

  const next = state.waiters.entries().next();
  if (next.done) return;

  const [id, start] = next.value;
  state.waiters.delete(id);

  const controller = new AbortController();
  const cleanup = start(controller.signal);
  const owner: Owner = { id, controller, cleanup };
  state.owner = owner;

  controller.signal.addEventListener(
    'abort',
    () => {
      if (state.owner !== owner) return;

      try {
        owner.cleanup();
      } catch (cause) {
        console.error('[kanban] engine cleanup failed', cause);
      }

      state.owner = undefined;
      promote(state);
    },
    { once: true },
  );
}
