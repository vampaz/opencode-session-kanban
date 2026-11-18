import type { Plugin } from '@opencode/plugin';
import type { Schema } from 'effect';

import { readBoard, type BoardDocument } from '../core/board';
import { sessionKeyOf } from '../core/session-ref';

/** The session a fake tool call reports as its caller, so `sessionID: "me"` resolves to it. */
export const CALLER_SESSION = 'ses_caller';

/**
 * The slice of `Session.Info` the board reads. The fake context is cast to `Plugin.Context`, so the
 * full branded schema type is not needed here.
 */
export type FakeSession = {
  readonly id: string;
  readonly title?: string | undefined;
  readonly parentID?: string | undefined;
  readonly fork?: { readonly sessionID: string } | undefined;
  readonly projectID: string;
  readonly subpath?: string | undefined;
  readonly location: { readonly directory: string };
  readonly agent?: string | undefined;
  readonly model?: { readonly id: string; readonly providerID: string } | undefined;
  readonly cost: number;
  readonly outcome?: 'succeeded' | 'failed' | 'interrupted' | undefined;
  time: {
    created: number;
    updated: number;
    idle?: number | undefined;
    archived?: number | undefined;
  };
};

export type FakeSessionInput = {
  readonly id: string;
  readonly title?: string | undefined;
  readonly parentID?: string | undefined;
  readonly fork?: { readonly sessionID: string } | undefined;
  readonly directory?: string | undefined;
  readonly projectID?: string | undefined;
  readonly subpath?: string | undefined;
  readonly agent?: string | undefined;
  readonly cost?: number | undefined;
  readonly outcome?: 'succeeded' | 'failed' | 'interrupted' | undefined;
  readonly archived?: boolean | undefined;
  /** The session has completed a run. */
  readonly ran?: boolean | undefined;
};

/** A session shaped like `Session.Info`, with only the fields the board derives from. */
export function fakeSession(input: FakeSessionInput): FakeSession {
  const now = Date.now();

  return {
    id: input.id,
    title: input.title ?? `Session ${input.id}`,
    parentID: input.parentID,
    fork: input.fork,
    projectID: input.projectID ?? 'proj_test',
    subpath: input.subpath,
    location: { directory: input.directory ?? '/work/project' },
    agent: input.agent ?? 'build',
    cost: input.cost ?? 0,
    outcome: input.outcome,
    time: {
      created: now,
      updated: now,
      idle: input.ran ? now : undefined,
      archived: input.archived ? now : undefined,
    },
  };
}

export type FakeContextOptions = {
  readonly sessions?: readonly FakeSession[] | undefined;
  /** A server build that accepts `archived` and ignores it. */
  readonly ignoreArchive?: boolean | undefined;
  /** Every prompt fails, to exercise the queued-task path. */
  readonly failPrompt?: boolean | undefined;
};

export type PermissionCall = {
  readonly sessionID: string;
  readonly action: string;
  readonly resources: readonly string[];
};

export type PromptCall = { readonly sessionID: string; readonly text: string };

type ToolEditor = Parameters<Parameters<Plugin.Context['tool']['transform']>[0]>[0];
type ToolInfo = Parameters<ToolEditor['add']>[0];
export type FakeToolContext = Parameters<ToolInfo['execute']>[1];

/**
 * A minimal `Plugin.Context` over in-memory state: storage, sessions, permissions, and an event
 * stream. It covers what `createOperations`, `createKanbanTools`, and the engine touch, and nothing
 * else, so a test drives the real code without the server.
 */
export function createFakeContext(options: FakeContextOptions = {}) {
  const store = new Map<string, Schema.Json>();
  const sessions = new Map<string, FakeSession>(
    (options.sessions ?? []).map((session) => [session.id, session]),
  );
  const prompts: PromptCall[] = [];
  const permissions: PermissionCall[] = [];
  const updates: { readonly sessionID: string; readonly archived?: boolean }[] = [];
  const pending = new Set<string>();
  const stats = { gets: 0, sets: 0 };

  let createdCount = 0;
  let permissionFailure: Error | undefined;

  const storage = {
    async get(key: string): Promise<Schema.Json | undefined> {
      stats.gets += 1;
      return store.get(key);
    },
    async set(key: string, value: Schema.Json): Promise<void> {
      stats.sets += 1;
      store.set(key, value);
    },
    async remove(key: string): Promise<void> {
      store.delete(key);
    },
  };

  const session = {
    async get(input: { readonly sessionID: string }): Promise<FakeSession> {
      const found = sessions.get(input.sessionID);
      if (!found) throw new Error(`Session not found: ${input.sessionID}`);
      return found;
    },

    async list(input: { readonly limit?: number; readonly archived?: boolean } = {}) {
      const data = [...sessions.values()].filter(
        (info) =>
          input.archived === undefined || (info.time.archived !== undefined) === input.archived,
      );

      return { data: data.slice(0, input.limit ?? data.length), cursor: {} };
    },

    async create(input: {
      readonly location?: { readonly directory?: string };
      readonly title?: string;
    }): Promise<FakeSession> {
      createdCount += 1;
      const now = Date.now();
      const info: FakeSession = {
        id: `ses_fake_${createdCount}`,
        title: input.title ?? `Fake ${createdCount}`,
        projectID: 'proj_test',
        location: { directory: input.location?.directory ?? '/work/project' },
        agent: 'build',
        cost: 0,
        time: { created: now, updated: now },
      };

      sessions.set(info.id, info);
      // The real server emits session.created around the create call, response order unspecified.
      pushEvent({
        type: 'session.created',
        id: `evt_created_${info.id}`,
        data: { sessionID: info.id },
      });
      return info;
    },

    /** A real prompt runs the session, so the fake session gains a completed run. */
    async prompt(input: { readonly sessionID: string; readonly text: string }) {
      if (options.failPrompt) throw new Error('The fake server rejected the prompt.');

      prompts.push({ sessionID: input.sessionID, text: input.text });
      const found = sessions.get(input.sessionID);
      if (found) found.time.idle = Date.now();
      return {};
    },

    async update(input: { readonly sessionID: string; readonly archived?: boolean }) {
      updates.push({ sessionID: input.sessionID, archived: input.archived });
      if (input.archived === undefined || options.ignoreArchive) return;

      const found = sessions.get(input.sessionID);
      if (!found) return;
      if (input.archived) found.time.archived = Date.now();
      else delete found.time.archived;
    },
  };

  const permission = {
    async list(input: { readonly sessionID: string }) {
      return pending.has(input.sessionID)
        ? [{ id: `perm_${input.sessionID}`, sessionID: input.sessionID }]
        : [];
    },

    async assert(input: {
      readonly sessionID: string;
      readonly action: string;
      readonly resources?: readonly string[];
    }) {
      permissions.push({
        sessionID: input.sessionID,
        action: input.action,
        resources: [...(input.resources ?? [])],
      });
      if (permissionFailure) throw permissionFailure;
    },
  };

  const eventQueue: unknown[] = [];
  const eventWaiters: ((result: IteratorResult<unknown>) => void)[] = [];
  let eventClosed = false;

  function pushEvent(event: unknown): void {
    const waiter = eventWaiters.shift();
    if (waiter) waiter({ value: event, done: false });
    else eventQueue.push(event);
  }

  function closeEvents(): void {
    eventClosed = true;
    for (const waiter of eventWaiters.splice(0)) waiter({ value: undefined, done: true });
  }

  async function* events(): AsyncGenerator<unknown> {
    for (;;) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift();
        continue;
      }
      if (eventClosed) return;

      const next = await new Promise<IteratorResult<unknown>>((resolve) =>
        eventWaiters.push(resolve),
      );
      if (next.done) return;
      yield next.value;
    }
  }

  const event = {
    subscribe(input: { readonly signal?: AbortSignal } = {}) {
      input.signal?.addEventListener('abort', closeEvents, { once: true });
      return events();
    },
  };

  const ctx = {
    location: { directory: '/work/project' },
    storage,
    session,
    permission,
    event,
  } as unknown as Plugin.Context;

  return {
    ctx,
    callerID: CALLER_SESSION,
    sessions,
    prompts,
    permissions,
    updates,
    pending,
    stats,

    emit: pushEvent,
    closeEvents,

    denyPermissions(message: string): void {
      permissionFailure = new Error(message);
    },

    allowPermissions(): void {
      permissionFailure = undefined;
    },

    addSession(info: FakeSession): void {
      sessions.set(info.id, info);
    },

    writeBoard: async (board: BoardDocument): Promise<void> => {
      await storage.set('board', board);
    },

    board: (): Promise<BoardDocument> => readBoard(storage),

    sessionKey: (sessionID: string): string => sessionKeyOf(sessionID),

    toolContext: (overrides: { readonly sessionID?: string } = {}): FakeToolContext =>
      ({
        sessionID: overrides.sessionID ?? CALLER_SESSION,
        agent: 'build',
        messageID: 'msg_fake',
        id: 'call_fake',
        signal: new AbortController().signal,
        progress: async () => undefined,
      }) as unknown as FakeToolContext,
  };
}

export type FakeContext = ReturnType<typeof createFakeContext>;
