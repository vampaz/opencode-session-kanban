import type { Plugin } from '@opencode/plugin';

import { commitBoard, readBoard, type BoardDocument } from './core/board';
import { eventIDOf, eventSessionID, triggerFor, type RuleEventLike } from './core/events';
import { electEngine } from './core/leader';
import { applyRule, type RuleOutcome, type RuleSubject, type RuleTrigger } from './core/rules';
import { rulesApplyTo } from './core/status';
import { IDLE_TICK_MS, subscribeIdleTick } from './core/tick';

/** The only server the board serves in v1: the desktop's built-in one. */
const SESSION_SERVER = 'sidecar';

/**
 * A `created` event is evaluated just after the window's own initial placement, so a created rule
 * sees that placement (and can move the card) instead of racing it.
 */
const CREATED_SETTLE_MS = 150;

const EVENT_TYPES = [
  'session.created',
  'session.execution.started',
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
  'session.status',
  'session.idle',
  'permission.asked',
  'form.created',
] as const;

type SessionInfo = Awaited<ReturnType<Plugin.Context['session']['get']>>;

export type NotifyPayload = {
  readonly id: string;
  readonly title: string;
  readonly message?: string;
  readonly variant?: 'default' | 'error';
  readonly sessionKey?: string;
};

export type EnginePorts = {
  readonly changed: (revision: number) => Promise<void>;
  readonly notify: (payload: NotifyPayload) => Promise<void>;
};

/**
 * Runs one engine per process: the event stream is server-wide, so the elected instance consumes
 * it and owns the idle tick. A later location instance takes over when the owner unloads. Every
 * rule run still goes through the board lock and the event-id dedupe, so a takeover that overlaps
 * the old consumer cannot apply an event twice.
 */
export function startEngine(ctx: Plugin.Context, ports: EnginePorts): () => void {
  const controller = new AbortController();

  electEngine(controller.signal, (signal) => {
    void runEvents(ctx, ports, signal);
    return subscribeIdleTick(() => {
      void runIdleTick(ctx, ports).catch((cause) =>
        console.error('[kanban] idle rules failed', cause),
      );
    });
  });

  return () => controller.abort();
}

async function runEvents(
  ctx: Plugin.Context,
  ports: EnginePorts,
  signal: AbortSignal,
): Promise<void> {
  try {
    for await (const event of ctx.event.subscribe({ types: [...EVENT_TYPES], signal })) {
      const trigger = triggerFor(event as unknown as RuleEventLike);
      if (!trigger) continue;

      const sessionID = eventSessionID(event as unknown as RuleEventLike);
      if (!sessionID) continue;

      await handleTrigger(
        ctx,
        ports,
        trigger,
        eventIDOf(event as unknown as RuleEventLike),
        sessionID,
      );
    }
  } catch (cause) {
    if (!signal.aborted) console.error('[kanban] event stream failed', cause);
  }
}

/**
 * One list call covers roots, forks, and subagents. Subagents are skipped unless they are shown,
 * and a subject comes straight from the row, so the tick makes no `session.get` per session.
 */
async function runIdleTick(ctx: Plugin.Context, ports: EnginePorts): Promise<void> {
  const board = await readBoard(ctx.storage);
  const wantsIdle = board.rules.some((rule) => rule.enabled && rule.trigger.includes('idle.for'));
  if (!wantsIdle) return;

  const response = await ctx.session.list({ archived: false, limit: 200 });
  const byID = new Map(response.data.map((info) => [info.id, info]));
  const bucket = Math.floor(Date.now() / IDLE_TICK_MS);

  for (const info of response.data) {
    if (!rulesApplyTo(info, { showSubagents: board.settings.showSubagents })) continue;

    const subject = subjectFrom(info, familyArchivedIn(info, byID));
    await applySubject(ctx, ports, 'idle.for', `idle.${bucket}.${info.id}`, subject);
  }
}

async function handleTrigger(
  ctx: Plugin.Context,
  ports: EnginePorts,
  trigger: RuleTrigger,
  eventID: string,
  sessionID: string,
): Promise<void> {
  try {
    if (trigger === 'created') {
      await new Promise((resolve) => setTimeout(resolve, CREATED_SETTLE_MS));
    }

    const info = await ctx.session.get({ sessionID });
    const document = await readBoard(ctx.storage);
    if (!rulesApplyTo(info, { showSubagents: document.settings.showSubagents })) return;

    const subject = await subjectFor(ctx, info);
    await applySubject(ctx, ports, trigger, eventID, subject);
  } catch (cause) {
    console.error('[kanban] rule handling failed', { trigger, sessionID, cause });
  }
}

async function applySubject(
  ctx: Plugin.Context,
  ports: EnginePorts,
  trigger: RuleTrigger,
  eventID: string,
  subject: RuleSubject,
): Promise<void> {
  let outcome: RuleOutcome | undefined;

  try {
    const board = await commitBoard(ctx.storage, (document) => {
      outcome = applyRule(document, subject, { trigger, eventID, now: Date.now() });
      return outcome?.board ?? document;
    });

    if (!outcome) return;
    const result: RuleOutcome = outcome;

    if (result.changed) await ports.changed(board.revision);
    if (
      result.notify ||
      (result.changed && result.to !== undefined && board.settings.notifyOnRuleMove)
    ) {
      await ports.notify(notifyFor(result, board, eventID, subject.sessionKey));
    }
  } catch (cause) {
    console.error('[kanban] rule write failed', { trigger, eventID, cause });
  }
}

export async function subjectFor(ctx: Plugin.Context, info: SessionInfo): Promise<RuleSubject> {
  return subjectFrom(info, await familyArchived(ctx, info));
}

function subjectFrom(info: SessionInfo, archived: boolean): RuleSubject {
  return {
    sessionKey: `${SESSION_SERVER}\n${info.id}`,
    directory: info.location.directory,
    projectID: info.projectID,
    title: info.title ?? '',
    agent: info.agent,
    root: info.parentID === undefined && info.fork === undefined,
    cost: info.cost,
    idleMinutes: Math.max(0, (Date.now() - info.time.updated) / 60_000),
    archived,
  };
}

/** A fork names its source in `fork.sessionID`; a subagent uses `parentID`. */
function parentOfInfo(info: SessionInfo): string | undefined {
  const source = info.fork as { readonly sessionID?: string } | undefined;
  return source?.sessionID ?? info.parentID;
}

async function familyArchived(ctx: Plugin.Context, info: SessionInfo): Promise<boolean> {
  let current = info;
  const seen = new Set<string>();

  for (let depth = 0; depth < 10; depth += 1) {
    if (current.time.archived !== undefined) return true;

    const parentID = parentOfInfo(current);
    if (!parentID) return false;
    if (seen.has(parentID)) return true;
    seen.add(parentID);

    try {
      current = await ctx.session.get({ sessionID: parentID });
    } catch {
      return true;
    }
  }

  return true;
}

/** The same walk over one listing, for the idle tick. An ancestor outside the list is unknown. */
function familyArchivedIn(info: SessionInfo, sessions: ReadonlyMap<string, SessionInfo>): boolean {
  let current: SessionInfo | undefined = info;
  const seen = new Set<string>();

  for (let depth = 0; depth < 10 && current; depth += 1) {
    if (current.time.archived !== undefined) return true;

    const parentID = parentOfInfo(current);
    if (!parentID) return false;
    if (seen.has(parentID)) return true;
    seen.add(parentID);

    current = sessions.get(parentID);
    if (!current) return true;
  }

  return true;
}

function notifyFor(
  outcome: RuleOutcome,
  board: BoardDocument,
  eventID: string,
  sessionKey: string,
): NotifyPayload {
  const column = outcome.to
    ? board.columns.find((candidate) => candidate.id === outcome.to)?.title
    : undefined;

  return {
    id: `${eventID}:${outcome.ruleID}`,
    title: outcome.ruleName,
    ...(column ? { message: `→ ${column}` } : {}),
    sessionKey,
  };
}
