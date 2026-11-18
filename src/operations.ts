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
import { planSort, type SortPlan } from './core/sort';
import {
  decideCreate,
  decideStart,
  startColumn,
  startsAgent,
  type StartDecision,
} from './core/start';
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

  function sessionIDOfKey(key: string): string {
    const index = key.indexOf('\n');
    return index === -1 ? key : key.slice(index + 1);
  }

  async function sendStart(sessionID: string, decision: StartDecision): Promise<boolean> {
    if (decision.kind === 'none') return false;

    try {
      await ctx.session.prompt({ sessionID, text: decision.text });
      // The task is cleared only after it was sent, so a failed prompt keeps it queued.
      if (decision.kind === 'task') {
        await commit((document) => setTask(document, sessionKey(sessionID), null));
      }
      return true;
    } catch (cause) {
      console.error('[kanban] could not start the agent', cause);
      return false;
    }
  }

  /** The one-time sort's subjects: visible cards with their state and placement. */
  async function sortSubjects(): Promise<{ board: BoardDocument; plan: SortPlan }> {
    const board = await readBoard(ctx.storage);
    const sessions = await listSessions();
    const activity = sharedActivity().snapshot();
    const states = selectCards(factsOf(sessions), {
      running: activity.running,
      waiting: activity.waiting,
      showSubagents: board.settings.showSubagents,
    });
    const byID = new Map(sessions.map((session) => [session.id, session]));

    return {
      board,
      plan: planSort(
        board,
        states.map((state) => {
          const key = sessionKey(state.id);
          return {
            sessionKey: key,
            status: state.status,
            placed: board.placements[key] !== undefined,
            pinned: board.placements[key]?.pinned ?? false,
            ran: byID.get(state.id)?.time.idle !== undefined,
          };
        }),
      ),
    };
  }

  function setTask(board: BoardDocument, key: string, task: string | null): BoardDocument {
    const placement = board.placements[key];
    if (!placement || placement.task === task) return board;

    return {
      ...board,
      placements: { ...board.placements, [key]: { ...placement, task } },
    };
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
      const target = current.columns.find((column) => column.id === columnId);
      if (!target) {
        throw new BoardError(
          `Unknown column "${columnId}". Valid columns: ${describeColumns(current)}.`,
        );
      }

      // Only a user move can start an agent, so read the session facts only for that case.
      const sessionID = sessionIDOfKey(sessionKeyValue);
      let ran = false;
      if (source === 'manual' && startsAgent(target)) {
        const info = await ctx.session.get({ sessionID }).catch(() => undefined);
        ran = info?.time.idle !== undefined;
      }

      let decision: StartDecision = { kind: 'none' };
      const board = await commit((document) => {
        const column = document.columns.find((candidate) => candidate.id === columnId) ?? target;
        const before = document.placements[sessionKeyValue];
        const activity = sharedActivity();
        decision = decideStart({
          source,
          from: before?.columnId ?? document.defaultColumn,
          column,
          task: before?.task ?? null,
          running: activity.isRunning(sessionID),
          waiting: activity.isWaiting(sessionID),
          ran,
        });

        return dropPlacement(document, {
          sessionKey: sessionKeyValue,
          columnId,
          index,
          source,
          updatedAt: Date.now(),
        }).board;
      });

      // A floating promise would lose the report; the move already succeeded, so a failure here
      // is logged and reported as "not started" instead of reverting the card.
      const started = decision.kind === 'none' ? false : await sendStart(sessionID, decision);
      return { board, started };
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
      /** Start the agent now. Omitted, the column decides. */
      readonly start?: boolean | undefined;
    }) => {
      const current = await readBoard(ctx.storage);
      const column = resolveColumn(current, input.column);
      const task = input.prompt?.trim() ?? '';
      const decision = decideCreate(column, task, input.start);

      const session = await ctx.session.create({
        location: { directory: input.directory },
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      });

      // The task is queued before a start too, so a prompt that fails leaves it on the card.
      let board = await commit((document) => {
        const next = dropPlacement(document, {
          sessionKey: sessionKey(session.id),
          columnId: column.id,
          index: columnOrder(document, column.id).length,
          source: 'auto',
          updatedAt: Date.now(),
        }).board;

        return task ? setTask(next, sessionKey(session.id), task) : next;
      });

      if (!decision.send) {
        return { board, column, session, started: false, queued: decision.queue };
      }

      const started = await sendStart(session.id, { kind: 'task', text: task });
      if (!started) return { board, column, session, started: false, queued: true };

      // The card follows the agent: once the task is accepted, it moves to a starting column.
      const target = startColumn(board.columns, column);
      if (target.id !== column.id) {
        board = await commit(
          (document) =>
            dropPlacement(document, {
              sessionKey: sessionKey(session.id),
              columnId: target.id,
              index: columnOrder(document, target.id).length,
              source: 'auto',
              updatedAt: Date.now(),
            }).board,
        );
      } else {
        board = await readBoard(ctx.storage);
      }

      return { board, column: target, session, started: true, queued: false };
    },

    /** The one-time sort's preview: unplaced cards by state, and the counts per column. */
    sortPreview: async (): Promise<SortPlan> => (await sortSubjects()).plan,

    /** Applies a plan in one write. A card placed since the preview is left alone. */
    sortApply: async () => {
      const { plan } = await sortSubjects();
      if (plan.moves.length === 0) return { board: await readBoard(ctx.storage), placed: 0 };

      let placed = 0;
      const now = Date.now();
      const board = await commit((document) =>
        plan.moves.reduce((next, move) => {
          if (next.placements[move.sessionKey]) return next;
          placed += 1;
          return dropPlacement(next, {
            sessionKey: move.sessionKey,
            columnId: move.columnId,
            index: columnOrder(next, move.columnId).length,
            source: 'auto',
            updatedAt: now,
          }).board;
        }, document),
      );

      return { board, placed };
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
