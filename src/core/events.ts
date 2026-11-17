import type { RuleTrigger } from './rules';

/** The slice of a server event the rule engine reads. */
export type RuleEventLike = {
  readonly type: string;
  readonly data?: unknown;
  readonly id?: unknown;
  readonly durable?: { readonly aggregateID?: string; readonly seq?: number };
};

/** The server event that fires each trigger. `idle.for` comes from the 30 s tick instead. */
export function triggerFor(event: RuleEventLike): RuleTrigger | undefined {
  switch (event.type) {
    case 'session.created':
      return 'created';
    case 'session.execution.started':
      return 'status.running';
    case 'session.execution.succeeded':
      return 'run.succeeded';
    case 'session.execution.failed':
      return 'run.failed';
    case 'session.execution.interrupted':
      return 'run.interrupted';
    case 'session.idle':
      return 'status.idle';
    case 'session.status':
      return statusType(event) === 'idle' ? 'status.idle' : undefined;
    case 'permission.asked':
      return 'waiting.permission';
    case 'form.created':
      return 'waiting.form';
    default:
      return undefined;
  }
}

function statusType(event: RuleEventLike): string | undefined {
  if (typeof event.data !== 'object' || event.data === null) return undefined;
  const status = (event.data as { readonly status?: unknown }).status;
  if (typeof status !== 'object' || status === null) return undefined;
  const type = (status as { readonly type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
}

export function eventSessionID(event: RuleEventLike): string | undefined {
  if (typeof event.data !== 'object' || event.data === null) return undefined;
  const sessionID = (event.data as { readonly sessionID?: unknown }).sessionID;
  return typeof sessionID === 'string' ? sessionID : undefined;
}

/** A stable id for the `(rule, session, event)` dedupe, even when an event has no id. */
export function eventIDOf(event: RuleEventLike): string {
  if (typeof event.id === 'string') return event.id;
  const aggregate = event.durable?.aggregateID ?? 'unknown';
  const seq = event.durable?.seq ?? 0;
  return `${event.type}:${aggregate}:${seq}`;
}
