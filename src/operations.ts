import type { Plugin } from '@opencode/plugin';

import { sharedActivity } from './activity';
import {
  clearPlacement,
  columnOrder,
  commitBoard,
  dropPlacement,
  parseBoard,
  pinPlacement,
  prunePlacements,
  readBoard,
  removeColumn as removeColumnFromBoard,
  removeRule as removeRuleFromBoard,
  reorderColumns as reorderColumnsOnBoard,
  reorderRules as reorderRulesOnBoard,
  updateSettings as updateSettingsOnBoard,
  upsertColumn as upsertColumnOnBoard,
  upsertRule as upsertRuleOnBoard,
  type BoardDocument,
  type BoardMutation,
  type BoardSettings,
  type Column,
  type PlacementSource,
} from './core/board';
import { performArchive } from './core/archive';
import { filterCardRows, type CardRow } from './core/cards';
import { previewRules, type PreviewMove, type Rule } from './core/rules';
import { selectCards, type CardStatus, type SessionFacts } from './core/status';
import { subjectFor } from './engine';

export type SessionInfo = Awaited<ReturnType<Plugin.Context['session']['get']>>;

export type Changed = (revision: number) => Promise<void>;

/** An expected failure the tools report as a message instead of throwing. */
export class BoardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardError';
  }
}

export type CardQuery = {
  readonly columnId?: string | undefined;
  readonly project?: string | undefined;
  readonly status?: CardStatus | undefined;
  readonly text?: string | undefined;
  readonly includeSubagents?: boolean | undefined;
};

export type CardDetail = {
  readonly session: SessionInfo;
  readonly card: CardRow;
  readonly visible: boolean;
};

const SESSION_SERVER = 'sidecar';

/** Every shared server operation: the RPC handlers and the agent tools both call these. */
export function createOperations(ctx: Plugin.Context, changed: Changed) {
  function sessionKey(sessionID: string): string {
    return `${SESSION_SERVER}\n${sessionID}`;
  }

  async function commit(mutate: BoardMutation): Promise<BoardDocument> {
    const board = await commitBoard(ctx.storage, mutate);
    await changed(board.revision);
    return board;
  }

  function sortColumns(board: BoardDocument): Column[] {
    return [...board.columns].sort((left, right) => left.order - right.order);
  }

  function describeColumns(board: BoardDocument): string {
    return sortColumns(board)
      .map((column) => `${column.id} (${column.title})`)
      .join(', ');
  }

  function resolveColumn(board: BoardDocument, value: string): Column {
    const wanted = value.trim().toLowerCase();
    const column =
      board.columns.find((candidate) => candidate.id.toLowerCase() === wanted) ??
      board.columns.find((candidate) => candidate.title.toLowerCase() === wanted);

    if (!column) {
      throw new BoardError(`Unknown column "${value}". Valid columns: ${describeColumns(board)}.`);
    }

    return column;
  }

  async function requireSession(sessionID: string): Promise<SessionInfo> {
    try {
      return await ctx.session.get({ sessionID });
    } catch {
      throw new BoardError(
        `Session not found: ${sessionID}. Use kanban_list to see the sessions on the board.`,
      );
    }
  }

  async function listSessions(): Promise<SessionInfo[]> {
    const response = await ctx.session.list({ limit: 200 });
    return response.data;
  }

  function factsOf(sessions: readonly SessionInfo[]): SessionFacts[] {
    return sessions.map((session) => ({
      id: session.id,
      parentID: session.parentID,
      fork: session.fork,
      archived: session.time.archived !== undefined,
      outcome: session.outcome,
      updated: session.time.updated,
    }));
  }

  function cardRows(
    board: BoardDocument,
    sessions: readonly SessionInfo[],
    includeSubagents: boolean,
  ): CardRow[] {
    const activity = sharedActivity().snapshot();
    const states = selectCards(factsOf(sessions), {
      running: activity.running,
      waiting: activity.waiting,
      showSubagents: includeSubagents || board.settings.showSubagents,
      includeArchived: board.settings.archived === 'column',
    });
    const byID = new Map(sessions.map((session) => [session.id, session]));
    const fallback =
      board.columns.find((column) => column.id === board.defaultColumn) ?? board.columns[0];

    return states.flatMap((state) => {
      const session = byID.get(state.id);
      if (!session) return [];

      const placement = board.placements[sessionKey(state.id)];
      const columnID =
        placement && board.columns.some((column) => column.id === placement.columnId)
          ? placement.columnId
          : fallback?.id;
      if (!columnID) return [];

      const column = board.columns.find((candidate) => candidate.id === columnID);

      return [
        {
          sessionID: state.id,
          title: session.title?.trim() || 'Untitled session',
          directory: session.location.directory,
          subpath: session.subpath,
          projectID: session.projectID,
          columnId: columnID,
          columnTitle: column?.title ?? columnID,
          status: state.status,
          archived: state.archived,
          pinned: placement?.pinned ?? false,
          source: placement?.source ?? 'auto',
          updated: session.time.updated,
        },
      ];
    });
  }

  function sortCards(board: BoardDocument, cards: readonly CardRow[]): CardRow[] {
    const columnOrderIndex = new Map(sortColumns(board).map((column, index) => [column.id, index]));

    return [...cards].sort((left, right) => {
      const column =
        (columnOrderIndex.get(left.columnId) ?? 0) - (columnOrderIndex.get(right.columnId) ?? 0);
      if (column !== 0) return column;

      const leftPlacement = board.placements[sessionKey(left.sessionID)];
      const rightPlacement = board.placements[sessionKey(right.sessionID)];
      const leftPosition =
        leftPlacement?.columnId === left.columnId
          ? leftPlacement.position
          : Number.POSITIVE_INFINITY;
      const rightPosition =
        rightPlacement?.columnId === right.columnId
          ? rightPlacement.position
          : Number.POSITIVE_INFINITY;

      if (leftPosition !== rightPosition) return leftPosition - rightPosition;
      return right.updated - left.updated;
    });
  }

  return {
    board: () => readBoard(ctx.storage),

    columns: async (): Promise<Column[]> => sortColumns(await readBoard(ctx.storage)),

    columnValue: (value: string): Promise<Column> =>
      readBoard(ctx.storage).then((board) => resolveColumn(board, value)),

    describeColumns: async (): Promise<string> => describeColumns(await readBoard(ctx.storage)),

    sessionKey,

    requireSession,

    snapshot: () => readBoard(ctx.storage),

    moveByIndex: async (
      sessionKeyValue: string,
      columnId: string,
      index: number,
      source: PlacementSource,
    ) => {
      const current = await readBoard(ctx.storage);
      if (!current.columns.some((column) => column.id === columnId)) {
        throw new BoardError(
          `Unknown column "${columnId}". Valid columns: ${describeColumns(current)}.`,
        );
      }

      const board = await commit(
        (document) =>
          dropPlacement(document, {
            sessionKey: sessionKeyValue,
            columnId,
            index,
            source,
            updatedAt: Date.now(),
          }).board,
      );

      return { board };
    },

    moveToColumn: async (
      sessionID: string,
      columnValue: string,
      source: PlacementSource = 'manual',
    ) => {
      await requireSession(sessionID);
      const current = await readBoard(ctx.storage);
      const column = resolveColumn(current, columnValue);
      const index = columnOrder(current, column.id).length;

      const board = await commit(
        (document) =>
          dropPlacement(document, {
            sessionKey: sessionKey(sessionID),
            columnId: column.id,
            index,
            source,
            updatedAt: Date.now(),
          }).board,
      );

      return { board, column };
    },

    setPinned: async (sessionKeyValue: string, pinned: boolean) => {
      const board = await commit((document) =>
        pinPlacement(document, sessionKeyValue, pinned, Date.now()),
      );
      return { board };
    },

    clearManual: async (sessionKeyValue: string) => {
      const board = await commit((document) => clearPlacement(document, sessionKeyValue));
      return { board };
    },

    prune: async (keys: readonly string[]) => {
      if (keys.length === 0) return { board: await readBoard(ctx.storage) };
      const wanted = new Set(keys);
      const board = await commit(
        (document) => prunePlacements(document, (key) => wanted.has(key)).board,
      );
      return { board };
    },

    archive: async (sessionID: string, archived: boolean) => {
      await requireSession(sessionID);

      // The server build may accept `archived` and ignore it, so success is verified by a read-back.
      const applied = await performArchive(
        {
          update: (input) => ctx.session.update(input),
          get: (input) => ctx.session.get(input),
        },
        sessionID,
        archived,
      );

      if (!applied) {
        throw new BoardError(
          `The server did not ${archived ? 'archive' : 'unarchive'} ${sessionID}: this OpenCode server build ignores the archived flag on session update. Use the board's Archive action in the desktop app.`,
        );
      }

      if (!archived) return { board: await readBoard(ctx.storage) };

      const board = await commit(
        (document) => prunePlacements(document, (key) => key === sessionKey(sessionID)).board,
      );
      return { board };
    },

    createInColumn: async (input: {
      readonly directory: string;
      readonly title?: string | undefined;
      readonly prompt?: string | undefined;
      readonly column: string;
    }) => {
      const current = await readBoard(ctx.storage);
      const column = resolveColumn(current, input.column);

      const session = await ctx.session.create({
        location: { directory: input.directory },
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      });

      const board = await commit(
        (document) =>
          dropPlacement(document, {
            sessionKey: sessionKey(session.id),
            columnId: column.id,
            index: columnOrder(document, column.id).length,
            source: 'auto',
            updatedAt: Date.now(),
          }).board,
      );

      if (input.prompt?.trim()) {
        await ctx.session.prompt({ sessionID: session.id, text: input.prompt.trim() });
      }

      return { board, column, session };
    },

    listCards: async (query: CardQuery): Promise<CardRow[]> => {
      const board = await readBoard(ctx.storage);
      const sessions = await listSessions();
      const rows = cardRows(board, sessions, query.includeSubagents ?? false);
      const filtered = filterCardRows(rows, {
        columnId: query.columnId,
        project: query.project,
        status: query.status,
        text: query.text,
      });

      return sortCards(board, filtered);
    },

    getCard: async (sessionID: string): Promise<CardDetail> => {
      const session = await requireSession(sessionID);
      const board = await readBoard(ctx.storage);
      const subject = await subjectFor(ctx, session);
      const placement = board.placements[sessionKey(sessionID)];
      const columnID =
        placement && board.columns.some((column) => column.id === placement.columnId)
          ? placement.columnId
          : board.defaultColumn;
      const column = board.columns.find((candidate) => candidate.id === columnID);
      const activity = sharedActivity();
      const pending = await ctx.permission
        .list({ sessionID })
        .then((requests) => requests.length > 0)
        .catch(() => false);

      return {
        session,
        visible: !subject.archived,
        card: {
          sessionID,
          title: session.title?.trim() || 'Untitled session',
          directory: session.location.directory,
          subpath: session.subpath,
          projectID: session.projectID,
          columnId: columnID,
          columnTitle: column?.title ?? columnID,
          status: activity.isRunning(sessionID)
            ? 'running'
            : activity.isWaiting(sessionID) || pending
              ? 'waiting'
              : session.outcome === 'failed'
                ? 'failed'
                : session.outcome === 'interrupted'
                  ? 'interrupted'
                  : 'idle',
          archived: subject.archived,
          pinned: placement?.pinned ?? false,
          source: placement?.source ?? 'auto',
          updated: session.time.updated,
        },
      };
    },

    rules: async (): Promise<Rule[]> => {
      const board = await readBoard(ctx.storage);
      return [...board.rules].sort((left, right) => left.priority - right.priority);
    },

    upsertRule: async (rule: Rule) => {
      const board = await commit((document) => upsertRuleOnBoard(document, rule));
      return { board };
    },

    removeRule: async (ruleID: string) => {
      const board = await commit((document) => removeRuleFromBoard(document, ruleID));
      return { board };
    },

    reorderRules: async (ids: readonly string[]) => {
      const board = await commit((document) => reorderRulesOnBoard(document, ids));
      return { board };
    },

    preview: async (): Promise<PreviewMove[]> => {
      const board = await readBoard(ctx.storage);
      const sessions = await listSessions();
      const subjects = await Promise.all(sessions.map((session) => subjectFor(ctx, session)));
      return previewRules(board, subjects);
    },

    updateSettings: async (patch: Partial<BoardSettings>) => {
      const board = await commit((document) => updateSettingsOnBoard(document, patch));
      return { board };
    },

    upsertColumn: async (column: Column) => {
      const board = await commit((document) => upsertColumnOnBoard(document, column));
      return { board };
    },

    removeColumn: async (columnID: string) => {
      const board = await commit((document) => removeColumnFromBoard(document, columnID));
      return { board };
    },

    reorderColumns: async (ids: readonly string[]) => {
      const board = await commit((document) => reorderColumnsOnBoard(document, ids));
      return { board };
    },

    setDefaultColumn: async (columnID: string) => {
      const current = await readBoard(ctx.storage);
      if (!current.columns.some((column) => column.id === columnID)) {
        throw new BoardError(
          `Unknown column "${columnID}". Valid columns: ${describeColumns(current)}.`,
        );
      }

      const board = await commit((document) =>
        document.defaultColumn === columnID ? document : { ...document, defaultColumn: columnID },
      );
      return { board };
    },

    replaceBoard: async (value: unknown) => {
      const document = parseBoard(value);
      const current = await readBoard(ctx.storage);
      const board = await commit(() => ({ ...document, revision: current.revision }));
      return { board };
    },

    /** The server build has no fork call: the tool reports this instead of guessing. */
    forkUnavailable: (): BoardError =>
      new BoardError(
        'Forking is not available from the server in this OpenCode build: the server session API has no fork call. Use the board card menu (Fork…) in the desktop app.',
      ),
  };
}

export type Operations = ReturnType<typeof createOperations>;
