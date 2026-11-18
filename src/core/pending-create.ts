/**
 * A session the board created is placed right after it exists, so its server `created` event can
 * arrive before that placement is committed. The create marks the session here, and the event
 * handler consumes the mark to wait for the placement instead of racing it.
 *
 * `Symbol.for` shares the registry between separately loaded copies of this module, like the board
 * lock and the activity tracker.
 */
export const PENDING_CREATE_KEY = Symbol.for('opencode-session-kanban.pending-create');

/** A mark older than this belongs to a create that never committed; it must not delay an event. */
export const PENDING_CREATE_TTL_MS = 30_000;

type Entry = { readonly at: number };

function registry(): Map<string, Entry> {
  const holder = globalThis as unknown as Record<symbol, Map<string, Entry> | undefined>;
  return (holder[PENDING_CREATE_KEY] ??= new Map());
}

export function markBoardCreate(sessionID: string): void {
  const entries = registry();
  const now = Date.now();

  // A create that never committed leaves a mark behind. Drop stale ones here as well as on consume.
  for (const [key, entry] of entries) {
    if (now - entry.at > PENDING_CREATE_TTL_MS) entries.delete(key);
  }

  entries.set(sessionID, { at: now });
}

/** Read-and-delete. An expired mark reports false, so a crashed create cannot leak into a later event. */
export function consumeBoardCreate(sessionID: string): boolean {
  const entries = registry();
  const entry = entries.get(sessionID);
  if (!entry) return false;

  entries.delete(sessionID);
  return Date.now() - entry.at <= PENDING_CREATE_TTL_MS;
}

export const INFLIGHT_KEY = Symbol.for('opencode-session-kanban.pending-create.inflight');

type Inflight = { count: number };

function inflight(): Inflight {
  const holder = globalThis as unknown as Record<symbol, Inflight | undefined>;
  return (holder[INFLIGHT_KEY] ??= { count: 0 });
}

/**
 * A create is in flight between the server call and its placement commit. The `created` event can
 * be handled before the mark exists, so the engine also waits while any create is in flight.
 */
export function beginBoardCreate(): void {
  inflight().count += 1;
}

export function endBoardCreate(): void {
  const state = inflight();
  state.count = Math.max(0, state.count - 1);
}

export function boardCreatesInFlight(): number {
  return inflight().count;
}
