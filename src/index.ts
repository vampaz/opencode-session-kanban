import { randomUUID } from 'node:crypto';

import { Plugin } from '@opencode/plugin';

import {
  clearPlacement,
  commitBoard,
  dropPlacement,
  pinPlacement,
  prunePlacements,
  readBoard,
} from './core/board';
import { Kanban } from './rpc';

type MoveRequest = {
  readonly sessionKey: string;
  readonly columnId: string;
  readonly index: number;
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
          (document) =>
            dropPlacement(document, { ...request, source: 'manual', updatedAt: Date.now() }).board,
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
    });
  },
});

function parseMove(input: unknown): MoveRequest {
  const value = record(input, 'move');
  const sessionKey = stringField(value, 'sessionKey', 'The move needs a session key.');
  if (!sessionKey.includes('\n')) throw new Error(`Invalid session key: ${sessionKey}`);

  const columnId = stringField(value, 'columnId', 'The move needs a column.');
  const index = value.index;
  if (typeof index !== 'number' || !Number.isFinite(index)) {
    throw new Error('The move needs a finite index.');
  }

  return { sessionKey, columnId, index };
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
  const field = value[key];
  if (typeof field !== 'string') throw new Error(message);
  return field;
}
