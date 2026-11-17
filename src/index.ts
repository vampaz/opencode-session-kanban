import { randomUUID } from 'node:crypto';

import { Plugin } from '@opencode/plugin';

import { commitBoard, movePlacement, readBoard } from './core/board';
import { Kanban } from './rpc';

type MoveRequest = {
  readonly sessionKey: string;
  readonly columnId: string;
  readonly position: number;
};

/**
 * The server part: the board document in plugin storage, the rules engine, the agent tools, and
 * the RPC implementation. One instance runs per location; every instance reads the same `board`
 * key and writes through the revision guard in `core/board`.
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
        if (!request.sessionKey.includes('\n')) {
          throw new Error(`Invalid session key: ${request.sessionKey}`);
        }

        const board = await commitBoard(ctx.storage, (document) =>
          movePlacement(document, { ...request, source: 'manual', updatedAt: Date.now() }),
        );

        await rpc.events.emit('changed', { revision: board.revision });
        return { revision: board.revision };
      },
    });
  },
});

function parseMove(input: unknown): MoveRequest {
  if (typeof input !== 'object' || input === null) throw new Error('Invalid move input.');
  const value = input as Record<string, unknown>;

  if (typeof value.sessionKey !== 'string') throw new Error('The move needs a session key.');
  if (typeof value.columnId !== 'string') throw new Error('The move needs a column.');
  if (typeof value.position !== 'number' || !Number.isFinite(value.position)) {
    throw new Error('The move needs a finite position.');
  }

  return { sessionKey: value.sessionKey, columnId: value.columnId, position: value.position };
}
