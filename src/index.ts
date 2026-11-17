import { randomUUID } from 'node:crypto';

import { Plugin } from '@opencode/plugin';

import { startEngine, type NotifyPayload } from './engine';
import { createOperations } from './operations';
import { Kanban } from './rpc';
import { createKanbanTools } from './tools';
import { parseColumn, parseIds, parseRule, parseSettings } from './validate';

type MoveRequest = {
  readonly sessionKey: string;
  readonly columnId: string;
  readonly index: number;
  readonly source: 'manual' | 'auto';
};

type PinnedRequest = {
  readonly sessionKey: string;
  readonly pinned: boolean;
};

/**
 * The server part: the board document in plugin storage, the rules engine, the agent tools, and
 * the RPC implementation. One instance runs per location; every instance reads the same `board`
 * key and writes through the in-process lock and revision guard in `core/board`.
 */
export default Plugin.define({
  id: 'kanban',
  async setup(ctx) {
    const instanceId = randomUUID();
    const directory = ctx.location.directory;
    const pid = process.pid;
    const setupAt = new Date().toISOString();

    // One line per location, so a spike run shows every instance the server starts.
    console.log('[kanban] server part ready', { instanceId, pid, directory, setupAt });

    let emitChanged: (revision: number) => Promise<void> = async () => undefined;
    const ops = createOperations(ctx, (revision) => emitChanged(revision));

    const rpc = await ctx.rpc.register(Kanban, {
      snapshot: () => ops.snapshot(),

      move: async (input) => {
        const request = parseMove(input);
        const { board } = await ops.moveByIndex(
          request.sessionKey,
          request.columnId,
          request.index,
          request.source,
        );
        return { revision: board.revision };
      },

      setPinned: async (input) => {
        const request = parsePinned(input);
        const { board } = await ops.setPinned(request.sessionKey, request.pinned);
        return { revision: board.revision };
      },

      clearManual: async (input) => {
        const { sessionKey } = parseSessionKey(input);
        const { board } = await ops.clearManual(sessionKey);
        return { revision: board.revision };
      },

      /** The window knows which sessions are gone; the server can only remove the keys it is given. */
      prune: async (input) => {
        const { board } = await ops.prune(parseKeys(input));
        return { revision: board.revision };
      },

      'rules.upsert': async (input) => {
        const { board } = await ops.upsertRule(parseRule(field(input, 'rule')));
        return { revision: board.revision };
      },

      'rules.remove': async (input) => {
        const { board } = await ops.removeRule(textField(field(input, 'id'), 'rule id'));
        return { revision: board.revision };
      },

      'rules.reorder': async (input) => {
        const { board } = await ops.reorderRules(parseIds(field(input, 'ids')));
        return { revision: board.revision };
      },

      'rules.preview': async () => ({ moves: await ops.preview() }),

      'settings.update': async (input) => {
        const { board } = await ops.updateSettings(parseSettings(field(input, 'patch')));
        return { revision: board.revision };
      },

      'columns.upsert': async (input) => {
        const { board } = await ops.upsertColumn(parseColumn(field(input, 'column')));
        return { revision: board.revision };
      },

      'columns.remove': async (input) => {
        const { board } = await ops.removeColumn(textField(field(input, 'id'), 'column id'));
        return { revision: board.revision };
      },

      'columns.reorder': async (input) => {
        const { board } = await ops.reorderColumns(parseIds(field(input, 'ids')));
        return { revision: board.revision };
      },

      'columns.default': async (input) => {
        const { board } = await ops.setDefaultColumn(textField(field(input, 'id'), 'column id'));
        return { revision: board.revision };
      },

      /** Import: `parseBoard` rejects an unknown version instead of overwriting the document. */
      'board.replace': async (input) => {
        const { board } = await ops.replaceBoard(field(input, 'document'));
        return { revision: board.revision };
      },
    });

    emitChanged = (revision) => rpc.events.emit('changed', { revision });

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: 'kanban',
        description:
          'Read and move the session board. A card is an OpenCode session; columns are user buckets.',
      });
      for (const tool of createKanbanTools(ctx, ops)) editor.add(tool);
    });

    const stopEngine = startEngine(ctx, {
      changed: (revision) => rpc.events.emit('changed', { revision }),
      notify: (payload: NotifyPayload) => rpc.events.emit('notify', payload),
    });

    return () => stopEngine();
  },
});

function field(input: unknown, key: string): unknown {
  if (typeof input !== 'object' || input === null) throw new Error(`Invalid ${key} input.`);
  return (input as Record<string, unknown>)[key];
}

function textField(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Invalid ${name}.`);
  return value;
}

function parseMove(input: unknown): MoveRequest {
  const value = record(input, 'move');
  const sessionKey = stringField(value, 'sessionKey', 'The move needs a session key.');
  if (!sessionKey.includes('\n')) throw new Error(`Invalid session key: ${sessionKey}`);

  const columnId = stringField(value, 'columnId', 'The move needs a column.');
  const index = value.index;
  if (typeof index !== 'number' || !Number.isFinite(index)) {
    throw new Error('The move needs a finite index.');
  }

  const source = value.source === 'auto' ? 'auto' : 'manual';
  return { sessionKey, columnId, index, source };
}

function parsePinned(input: unknown): PinnedRequest {
  const value = record(input, 'pin');
  if (typeof value.pinned !== 'boolean') throw new Error('The pin needs a boolean.');

  return {
    sessionKey: stringField(value, 'sessionKey', 'The pin needs a session key.'),
    pinned: value.pinned,
  };
}

function parseSessionKey(input: unknown): { readonly sessionKey: string } {
  const value = record(input, 'request');
  return { sessionKey: stringField(value, 'sessionKey', 'The request needs a session key.') };
}

function parseKeys(input: unknown): string[] {
  const value = record(input, 'prune');
  if (!Array.isArray(value.keys) || value.keys.some((key) => typeof key !== 'string')) {
    throw new Error('The prune needs a list of session keys.');
  }

  return value.keys as string[];
}

function record(input: unknown, name: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) throw new Error(`Invalid ${name} input.`);
  return input as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, key: string, message: string): string {
  const fieldValue = value[key];
  if (typeof fieldValue !== 'string') throw new Error(message);
  return fieldValue;
}
