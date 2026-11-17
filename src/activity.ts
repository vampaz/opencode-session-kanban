/** Running and waiting state as the server can know it: from its own event stream. */
export type ActivityState = { readonly running: boolean; readonly waiting: boolean };

export const ACTIVITY_KEY = Symbol.for('opencode-session-kanban.activity');

/**
 * The state change one event carries. The server has no session-status query, so the tools read
 * this tracker, fed by the plugin's event subscription. `session.status` carries `busy` or `idle`.
 */
export function activityChange(type: string, status?: string): Partial<ActivityState> | undefined {
  switch (type) {
    case 'session.execution.started':
      return { running: true };
    case 'session.execution.succeeded':
    case 'session.execution.failed':
    case 'session.execution.interrupted':
    case 'session.idle':
      return { running: false };
    case 'session.status':
      if (status === 'busy') return { running: true };
      if (status === 'idle') return { running: false };
      return undefined;
    case 'permission.asked':
    case 'form.created':
      return { waiting: true };
    case 'permission.replied':
    case 'form.replied':
    case 'form.cancelled':
      return { waiting: false };
    case 'session.deleted':
      return { running: false, waiting: false };
    default:
      return undefined;
  }
}

export class ActivityTracker {
  private readonly running = new Set<string>();
  private readonly waiting = new Set<string>();

  apply(type: string, sessionID: string, status?: string): void {
    const change = activityChange(type, status);
    if (!change) return;

    if (change.running === true) this.running.add(sessionID);
    if (change.running === false) this.running.delete(sessionID);
    if (change.waiting === true) this.waiting.add(sessionID);
    if (change.waiting === false) this.waiting.delete(sessionID);
  }

  isRunning(sessionID: string): boolean {
    return this.running.has(sessionID);
  }

  isWaiting(sessionID: string): boolean {
    return this.waiting.has(sessionID);
  }

  snapshot(): { readonly running: ReadonlySet<string>; readonly waiting: ReadonlySet<string> } {
    return { running: new Set(this.running), waiting: new Set(this.waiting) };
  }
}

/** One tracker per process, so the elected engine feeds the tools of every instance. */
export function sharedActivity(): ActivityTracker {
  const holder = globalThis as unknown as Record<symbol, ActivityTracker | undefined>;
  return (holder[ACTIVITY_KEY] ??= new ActivityTracker());
}
