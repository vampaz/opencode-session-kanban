import { Rpc } from '@opencode/plugin/rpc';

const emptyInput = { type: 'object', properties: {}, additionalProperties: false } as const;

const columnSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    order: { type: 'number' },
    color: { type: ['string', 'null'] },
    startAgent: { type: 'boolean' },
    startPrompt: { type: ['string', 'null'] },
  },
  required: ['id', 'title', 'order', 'color', 'startAgent', 'startPrompt'],
  additionalProperties: false,
} as const;

const placementSchema = {
  type: 'object',
  properties: {
    columnId: { type: 'string' },
    position: { type: 'number' },
    source: { type: 'string', enum: ['manual', 'rule', 'auto', 'agent'] },
    pinned: { type: 'boolean' },
    ruleID: { type: ['string', 'null'] },
    updatedAt: { type: 'number' },
    lastRuleEventID: { type: ['string', 'null'] },
    task: { type: ['string', 'null'] },
  },
  required: [
    'columnId',
    'position',
    'source',
    'pinned',
    'ruleID',
    'updatedAt',
    'lastRuleEventID',
    'task',
  ],
  additionalProperties: false,
} as const;

const ruleSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    enabled: { type: 'boolean' },
    priority: { type: 'number' },
    trigger: { type: 'array', items: { type: 'string' } },
    match: { type: 'string', enum: ['all', 'any'] },
    conditions: { type: 'array', items: { type: 'object' } },
    actions: { type: 'array', items: { type: 'object' } },
    overrideManual: { type: 'boolean' },
    cooldownMs: { type: 'number' },
  },
  required: [
    'id',
    'name',
    'enabled',
    'priority',
    'trigger',
    'match',
    'conditions',
    'actions',
    'overrideManual',
    'cooldownMs',
  ],
  additionalProperties: false,
} as const;

const settingsSchema = {
  type: 'object',
  properties: {
    showSubagents: { type: 'boolean' },
    archived: { type: 'string', enum: ['hide', 'column'] },
    idleMinutes: { type: 'number' },
    notifyOnRuleMove: { type: 'boolean' },
    agentUpdatesCard: { type: 'boolean' },
  },
  required: ['showSubagents', 'archived', 'idleMinutes', 'notifyOnRuleMove', 'agentUpdatesCard'],
  additionalProperties: false,
} as const;

const snapshotSchema = {
  type: 'object',
  properties: {
    version: { type: 'number' },
    revision: { type: 'number' },
    columns: { type: 'array', items: columnSchema },
    defaultColumn: { type: 'string' },
    placements: { type: 'object', additionalProperties: placementSchema },
    rules: { type: 'array', items: ruleSchema },
    settings: settingsSchema,
  },
  required: ['version', 'revision', 'columns', 'defaultColumn', 'placements', 'rules', 'settings'],
  additionalProperties: false,
} as const;

const moveInput = {
  type: 'object',
  properties: {
    sessionKey: { type: 'string' },
    columnId: { type: 'string' },
    // The index among the target column's cards. The server reads its own document, so a caller
    // never needs to compute a fractional position from a snapshot it may have already lost.
    index: { type: 'number' },
    // `auto` marks a placement the board chose (a new session's column), not a person's override,
    // so rules may still move it. Omitted means `manual`.
    source: { type: 'string', enum: ['manual', 'auto'] },
  },
  required: ['sessionKey', 'columnId', 'index'],
  additionalProperties: false,
} as const;

const sessionKeyInput = {
  type: 'object',
  properties: { sessionKey: { type: 'string' } },
  required: ['sessionKey'],
  additionalProperties: false,
} as const;

const setPinnedInput = {
  type: 'object',
  properties: {
    sessionKey: { type: 'string' },
    pinned: { type: 'boolean' },
  },
  required: ['sessionKey', 'pinned'],
  additionalProperties: false,
} as const;

const pruneInput = {
  type: 'object',
  properties: { keys: { type: 'array', items: { type: 'string' } } },
  required: ['keys'],
  additionalProperties: false,
} as const;

const ruleInput = {
  type: 'object',
  properties: { rule: { type: 'object' } },
  required: ['rule'],
  additionalProperties: false,
} as const;

const columnInput = {
  type: 'object',
  properties: { column: { type: 'object' } },
  required: ['column'],
  additionalProperties: false,
} as const;

const idInput = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
  additionalProperties: false,
} as const;

const idsInput = {
  type: 'object',
  properties: { ids: { type: 'array', items: { type: 'string' } } },
  required: ['ids'],
  additionalProperties: false,
} as const;

const settingsInput = {
  type: 'object',
  properties: { patch: { type: 'object' } },
  required: ['patch'],
  additionalProperties: false,
} as const;

const documentInput = {
  type: 'object',
  properties: { document: { type: 'object' } },
  required: ['document'],
  additionalProperties: false,
} as const;

const previewSchema = {
  type: 'object',
  properties: {
    moves: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sessionKey: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          ruleID: { type: 'string' },
        },
        required: ['sessionKey', 'from', 'to', 'ruleID'],
        additionalProperties: false,
      },
    },
  },
  required: ['moves'],
  additionalProperties: false,
} as const;

const notifySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    message: { type: 'string' },
    variant: { type: 'string', enum: ['default', 'error'] },
    sessionKey: { type: 'string' },
  },
  required: ['id', 'title'],
  additionalProperties: false,
} as const;

const revisionSchema = {
  type: 'object',
  properties: { revision: { type: 'number' } },
  required: ['revision'],
  additionalProperties: false,
} as const;

const moveOutputSchema = {
  type: 'object',
  properties: { revision: { type: 'number' }, started: { type: 'boolean' } },
  required: ['revision', 'started'],
  additionalProperties: false,
} as const;

const createInput = {
  type: 'object',
  properties: {
    directory: { type: 'string' },
    columnId: { type: 'string' },
    title: { type: 'string' },
    task: { type: 'string' },
    // Start the agent now. Omitted, the column decides.
    start: { type: 'boolean' },
  },
  required: ['directory', 'columnId'],
  additionalProperties: false,
} as const;

const createOutputSchema = {
  type: 'object',
  properties: {
    sessionID: { type: 'string' },
    revision: { type: 'number' },
    // The column the card ended in: a started ticket moves to a starting column.
    columnId: { type: 'string' },
    started: { type: 'boolean' },
    queued: { type: 'boolean' },
  },
  required: ['sessionID', 'revision', 'columnId', 'started', 'queued'],
  additionalProperties: false,
} as const;

const sortPreviewSchema = {
  type: 'object',
  properties: {
    moves: {
      type: 'array',
      items: {
        type: 'object',
        properties: { sessionKey: { type: 'string' }, columnId: { type: 'string' } },
        required: ['sessionKey', 'columnId'],
        additionalProperties: false,
      },
    },
    counts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { columnId: { type: 'string' }, count: { type: 'number' } },
        required: ['columnId', 'count'],
        additionalProperties: false,
      },
    },
  },
  required: ['moves', 'counts'],
  additionalProperties: false,
} as const;

const sortApplySchema = {
  type: 'object',
  properties: { revision: { type: 'number' }, placed: { type: 'number' } },
  required: ['revision', 'placed'],
  additionalProperties: false,
} as const;

/** The contract between the server part and the desktop GUI. */
export const Kanban = Rpc.define({
  id: 'kanban',
  methods: {
    snapshot: { input: emptyInput, output: snapshotSchema },
    move: { input: moveInput, output: moveOutputSchema },
    'session.create': { input: createInput, output: createOutputSchema },
    'sort.preview': { input: emptyInput, output: sortPreviewSchema },
    'sort.apply': { input: emptyInput, output: sortApplySchema },
    setPinned: { input: setPinnedInput, output: revisionSchema },
    clearManual: { input: sessionKeyInput, output: revisionSchema },
    prune: { input: pruneInput, output: revisionSchema },
    'rules.upsert': { input: ruleInput, output: revisionSchema },
    'rules.remove': { input: idInput, output: revisionSchema },
    'rules.reorder': { input: idsInput, output: revisionSchema },
    'rules.preview': { input: emptyInput, output: previewSchema },
    'settings.update': { input: settingsInput, output: revisionSchema },
    'columns.upsert': { input: columnInput, output: revisionSchema },
    'columns.remove': { input: idInput, output: revisionSchema },
    'columns.reorder': { input: idsInput, output: revisionSchema },
    'columns.default': { input: idInput, output: revisionSchema },
    'board.replace': { input: documentInput, output: revisionSchema },
  },
  events: {
    changed: {
      schema: {
        type: 'object',
        properties: { revision: { type: 'number' } },
        required: ['revision'],
        additionalProperties: false,
      },
    },
    notify: { schema: notifySchema },
  },
});
