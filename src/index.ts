import { randomUUID } from 'node:crypto';

import { Plugin } from '@opencode/plugin';

import {
  clearPlacement,
  commitBoard,
  dropPlacement,
  pinPlacement,
  prunePlacements,
  readBoard,
  removeColumn,
  removeRule,
  reorderColumns,
  reorderRules,
  updateSettings,
  upsertColumn,
  upsertRule,
} from './core/board';
import { previewRules } from './core/rules';
import { startEngine, subjectFor, type NotifyPayload } from './engine';
import { Kanban } from './rpc';
import { parseColumn, parseDocument, parseIds, parseRule, parseSettings } from './validate';

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

    const rpc = await ctx.rpc.register(Kanban, {
      snapshot: async () => readBoard(ctx.storage),

      move: async (input) => {
        const request = parseMove(input);
        const current = await readBoard(ctx.storage);
        if (!current.columns.some((column) => column.id === request.columnId)) {
          throw new Error(`Unknown column: ${request.columnId}`);
        }

        const board = await commitBoard(
          ctx.storage,
          (document) => dropPlacement(document, { ...request, updatedAt: Date.now() }).board,
        );

        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      setPinned: async (input) => {
        const request = parsePinned(input);
        const board = await commitBoard(ctx.storage, (document) =>
          pinPlacement(document, request.sessionKey, request.pinned, Date.now()),
        );

        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      clearManual: async (input) => {
        const { sessionKey } = parseSessionKey(input);
        const board = await commitBoard(ctx.storage, (document) =>
          clearPlacement(document, sessionKey),
        );

        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      /** The window knows which sessions are gone; the server can only remove the keys it is given. */
      prune: async (input) => {
        const keys = new Set(parseKeys(input));
        if (keys.size === 0) return { revision: (await readBoard(ctx.storage)).revision };

        const board = await commitBoard(
          ctx.storage,
          (document) => prunePlacements(document, (key) => keys.has(key)).board,
        );

        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      'rules.upsert': async (input) => {
        const rule = parseRule(field(input, 'rule'));
        const board = await commitBoard(ctx.storage, (document) => upsertRule(document, rule));
        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      'rules.remove': async (input) => {
        const id = textField(field(input, 'id'), 'rule id');
        const board = await commitBoard(ctx.storage, (document) => removeRule(document, id));
        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      'rules.reorder': async (input) => {
        const ids = parseIds(field(input, 'ids'));
        const board = await commitBoard(ctx.storage, (document) => reorderRules(document, ids));
        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      'rules.preview': async () => {
        const board = await readBoard(ctx.storage);
        const response = await ctx.session.list({ archived: false, limit: 200 });
        const subjects = await Promise.all(response.data.map((info) => subjectFor(ctx, info)));

        return { moves: previewRules(board, subjects) };
      },

      'settings.update': async (input) => {
        const patch = parseSettings(field(input, 'patch'));
        const board = await commitBoard(ctx.storage, (document) => updateSettings(document, patch));
        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      'columns.upsert': async (input) => {
        const column = parseColumn(field(input, 'column'));
        const board = await commitBoard(ctx.storage, (document) => upsertColumn(document, column));
        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      'columns.remove': async (input) => {
        const id = textField(field(input, 'id'), 'column id');
        const board = await commitBoard(ctx.storage, (document) => removeColumn(document, id));
        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      'columns.default': async (input) => {
        const id = textField(field(input, 'id'), 'column id');
        const current = await readBoard(ctx.storage);
        if (!current.columns.some((column) => column.id === id)) {
          throw new Error(`Unknown column: ${id}`);
        }

        const board = await commitBoard(ctx.storage, (document) =>
          document.defaultColumn === id ? document : { ...document, defaultColumn: id },
        );
        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      'columns.reorder': async (input) => {
        const ids = parseIds(field(input, 'ids'));
        const board = await commitBoard(ctx.storage, (document) => reorderColumns(document, ids));
        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },

      /** Import: `parseBoard` rejects an unknown version instead of overwriting the document. */
      'board.replace': async (input) => {
        const document = parseDocument(field(input, 'document'));
        const board = await commitBoard(ctx.storage, (current) => ({
          ...document,
          revision: current.revision,
        }));
        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },
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
