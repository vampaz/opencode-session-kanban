import type { Plugin } from '@opencode/plugin';

import { commitBoard, readBoard, type BoardDocument, type BoardStorage } from './core/board';
import { sharedActivity } from './activity';
import {
  eventIDOf,
  eventSessionID,
  eventStatusType,
  triggerFor,
  type RuleEventLike,
} from './core/events';
import { electEngine } from './core/leader';
import { boardCreatesInFlight, consumeBoardCreate } from './core/pending-create';
import { applyRule, type RuleOutcome, type RuleSubject, type RuleTrigger } from './core/rules';
import { applyRunSync, runStateOfEvent, type RunState } from './core/run-sync';
import { SESSION_LIST_LIMIT, sessionKeyOf } from './core/session-ref';
import { rulesApplyTo } from './core/status';
import { IDLE_TICK_MS, subscribeIdleTick } from './core/tick';

const EVENT_TYPES = [
  'session.created',
  'session.execution.started',
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
  'session.status',
  'session.idle',
  'permission.asked',
  'permission.replied',
  'form.created',
  'form.replied',
  'form.cancelled',
  'session.deleted',
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
      // The run sync also reads the replies that carry no rule trigger.
      const state = runStateOfEvent(event.type);
      if (!trigger && !state) continue;

      const sessionID = eventSessionID(event as unknown as RuleEventLike);
      if (!sessionID) continue;

      sharedActivity().apply(
        event.type,
        sessionID,
        eventStatusType(event as unknown as RuleEventLike),
      );

      await handleEvent(
        ctx,
        ports,
        trigger,
        state,
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
 *
 * Every matching subject is evaluated in one write: the outcomes accumulate into one document, so
 * a tick that moves several cards bumps the revision once and emits one `changed`.
 */
export async function runIdleTick(ctx: Plugin.Context, ports: EnginePorts): Promise<void> {
  const board = await readBoard(ctx.storage);
  const wantsIdle = board.rules.some((rule) => rule.enabled && rule.trigger.includes('idle.for'));
  if (!wantsIdle) return;

  const response = await ctx.session.list({ archived: false, limit: SESSION_LIST_LIMIT });
  const byID = new Map(response.data.map((info) => [info.id, info]));
  const bucket = Math.floor(Date.now() / IDLE_TICK_MS);
  const applied: { outcome: RuleOutcome; eventID: string; sessionKey: string }[] = [];
  let wrote = false;

  const next = await commitBoard(ctx.storage, (document) => {
    // A revision conflict re-runs this mutate, so each attempt collects only its own outcomes.
    applied.length = 0;
    wrote = false;

    const now = Date.now();
    let working = document;

    for (const info of response.data) {
      if (!rulesApplyTo(info, { showSubagents: document.settings.showSubagents })) continue;

      const subject = subjectFrom(info, familyArchivedIn(info, byID));
      const eventID = `idle.${bucket}.${info.id}`;
      const outcome = applyRule(working, subject, { trigger: 'idle.for', eventID, now });
      if (!outcome) continue;

      applied.push({ outcome, eventID, sessionKey: subject.sessionKey });
      if (outcome.changed) wrote = true;
      working = outcome.board;
    }

    return working;
  });

  if (wrote) await ports.changed(next.revision);

  for (const { outcome, eventID, sessionKey } of applied) {
    if (
      outcome.notify ||
      (outcome.changed && outcome.to !== undefined && next.settings.notifyOnRuleMove)
    ) {
      await ports.notify(notifyFor(outcome, next, eventID, sessionKey));
    }
  }
}

async function handleEvent(
  ctx: Plugin.Context,
  ports: EnginePorts,
  trigger: RuleTrigger | undefined,
  state: RunState | undefined,
  eventID: string,
  sessionID: string,
): Promise<void> {
  try {
    // A board create marks its session, so this event waits for that create's placement instead of
    // racing it. The mark can be missing when the event is handled before the create response, so a
    // create in flight also waits. A session created elsewhere has neither and is handled at once.
    if (trigger === 'created' && (consumeBoardCreate(sessionID) || boardCreatesInFlight() > 0)) {
      await waitForPlacement(ctx.storage, sessionKeyOf(sessionID));
    }

    const info = await ctx.session.get({ sessionID });
    const document = await readBoard(ctx.storage);
    if (!rulesApplyTo(info, { showSubagents: document.settings.showSubagents })) return;

    const subject = await subjectFor(ctx, info);
    await applySubject(ctx, ports, trigger, state, eventID, subject);
  } catch (cause) {
    console.error('[kanban] rule handling failed', { trigger, sessionID, cause });
  }
}

export type WaitForPlacementOptions = {
  /** The longest wait. Two seconds outlasts any local board create. */
  readonly capMs?: number;
  readonly stepMs?: number;
};

/** Polls the board until the created card's placement lands, or the cap elapses. */
export async function waitForPlacement(
  storage: BoardStorage,
  sessionKey: string,
  options: WaitForPlacementOptions = {},
): Promise<boolean> {
  const capMs = options.capMs ?? 2000;
  const stepMs = options.stepMs ?? 25;
  const deadline = Date.now() + capMs;

  for (;;) {
    const board = await readBoard(storage);
    if (board.placements[sessionKey]) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

async function applySubject(
  ctx: Plugin.Context,
  ports: EnginePorts,
  trigger: RuleTrigger | undefined,
  state: RunState | undefined,
  eventID: string,
  subject: RuleSubject,
): Promise<void> {
  let outcome: RuleOutcome | undefined;
  let synced = false;

  try {
    const board = await commitBoard(ctx.storage, (document) => {
      const now = Date.now();
      if (trigger) outcome = applyRule(document, subject, { trigger, eventID, now });
      // A rule that acted owns this event. Otherwise the card follows its run by itself, so a
      // forgotten agent report cannot leave the board stale.
      if (outcome?.changed) return outcome.board;

      const next = outcome?.board ?? document;
      if (!next.settings.followRuns || !state) return next;

      const following = applyRunSync(next, subject.sessionKey, state, now);
      synced = following !== next;
      return following;
    });

    if (synced || outcome?.changed) await ports.changed(board.revision);
    if (!outcome) return;

    const result: RuleOutcome = outcome;
    if (
      result.notify ||
      (result.changed && result.to !== undefined && board.settings.notifyOnRuleMove)
    ) {
      await ports.notify(notifyFor(result, board, eventID, subject.sessionKey));
    }
  } catch (cause) {
    console.error('[kanban] board write failed', { trigger, state, eventID, cause });
  }
}

export async function subjectFor(ctx: Plugin.Context, info: SessionInfo): Promise<RuleSubject> {
  return subjectFrom(info, await familyArchived(ctx, info));
}

function subjectFrom(info: SessionInfo, archived: boolean): RuleSubject {
  return {
    sessionKey: sessionKeyOf(info.id),
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

/**
 * The ancestor walk stops at this depth. Chains are normally 0-1 deep (a fork of a root, or a
 * subagent of a root), so the loop costs no `session.get` in the common case and stays bounded
 * for a malformed or very deep family.
 */
const MAX_ANCESTOR_DEPTH = 10;

async function familyArchived(ctx: Plugin.Context, info: SessionInfo): Promise<boolean> {
  let current = info;
  const seen = new Set<string>();

  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth += 1) {
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

  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && current; depth += 1) {
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
