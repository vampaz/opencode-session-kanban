/** One tick for every location instance in the process. */
export const IDLE_TICK_MS = 30_000;

export const IDLE_TICK_KEY = Symbol.for('opencode-session-kanban.idle-tick');

type Tick = {
  readonly timer: ReturnType<typeof setInterval>;
  readonly subscribers: Set<() => void>;
};

/**
 * Subscribes to the shared idle tick. The first caller starts the interval and the last one to leave
 * clears it, so separately loaded instances elect one tick instead of one timer each.
 */
export function subscribeIdleTick(run: () => void, intervalMs: number = IDLE_TICK_MS): () => void {
  const holder = globalThis as unknown as Record<symbol, Tick | undefined>;
  let tick = holder[IDLE_TICK_KEY];

  if (!tick) {
    const subscribers = new Set<() => void>();
    const timer = setInterval(() => {
      for (const subscriber of subscribers) subscriber();
    }, intervalMs);
    (timer as { unref?: () => void }).unref?.();

    tick = { timer, subscribers };
    holder[IDLE_TICK_KEY] = tick;
  }

  const current = tick;
  current.subscribers.add(run);

  return () => {
    current.subscribers.delete(run);
    if (current.subscribers.size > 0) return;

    clearInterval(current.timer);
    if (holder[IDLE_TICK_KEY] === current) delete holder[IDLE_TICK_KEY];
  };
}
