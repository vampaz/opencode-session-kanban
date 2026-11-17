import { Rpc } from '@opencode/plugin/rpc';

const emptyInput = { type: 'object', properties: {}, additionalProperties: false } as const;

const columnSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    order: { type: 'number' },
    color: { type: ['string', 'null'] },
    collapsed: { type: 'boolean' },
  },
  required: ['id', 'title', 'order', 'color', 'collapsed'],
  additionalProperties: false,
} as const;

const placementSchema = {
  type: 'object',
  properties: {
    columnId: { type: 'string' },
    position: { type: 'number' },
    source: { type: 'string', enum: ['manual', 'rule', 'auto'] },
    pinned: { type: 'boolean' },
    ruleID: { type: ['string', 'null'] },
    updatedAt: { type: 'number' },
    lastRuleEventID: { type: ['string', 'null'] },
  },
  required: ['columnId', 'position', 'source', 'pinned', 'ruleID', 'updatedAt', 'lastRuleEventID'],
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
  },
  required: ['showSubagents', 'archived', 'idleMinutes', 'notifyOnRuleMove'],
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
    position: { type: 'number' },
  },
  required: ['sessionKey', 'columnId', 'position'],
  additionalProperties: false,
} as const;

const revisionSchema = {
  type: 'object',
  properties: { revision: { type: 'number' } },
  required: ['revision'],
  additionalProperties: false,
} as const;

/** M0 spike only: what answers a call, so a window in one location can see another location serve it. */
const whoamiSchema = {
  type: 'object',
  properties: {
    instanceId: { type: 'string' },
    pid: { type: 'number' },
    directory: { type: ['string', 'null'] },
    setupAt: { type: 'string' },
  },
  required: ['instanceId', 'pid', 'directory', 'setupAt'],
  additionalProperties: false,
} as const;

/** The contract between the server part and the desktop GUI. */
export const Kanban = Rpc.define({
  id: 'kanban',
  methods: {
    snapshot: { input: emptyInput, output: snapshotSchema },
    move: { input: moveInput, output: revisionSchema },
    // M0 spike only. Remove at M1, with the diagnostic footer in the board.
    whoami: { input: emptyInput, output: whoamiSchema },
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
  },
});
