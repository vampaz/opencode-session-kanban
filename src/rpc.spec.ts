import { describe, expect, it } from 'vitest';

import { BOARD_VERSION, defaultBoard, parseBoard, type BoardDocument } from './core/board';
import type { Placement } from './core/board';
import { RULE_TRIGGERS, type Rule } from './core/rules';
import { sessionKeyOf } from './core/session-ref';
import { snapshotSchema } from './rpc';

/** The JSON-schema subset `rpc.ts` uses, and nothing more. */
type JsonSchema = {
  readonly type?: string | readonly string[];
  readonly enum?: readonly unknown[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | JsonSchema;
  readonly items?: JsonSchema;
};

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

const KNOWN_KEYWORDS = new Set([
  'type',
  'enum',
  'properties',
  'required',
  'additionalProperties',
  'items',
]);

/** Returns every mismatch, so a failure names the field that drifted. */
function validate(schema: JsonSchema, value: unknown, path = '$'): string[] {
  const errors: string[] = [];

  // A keyword this validator does not implement must fail loudly instead of being ignored, or the
  // contract test goes vacuous the day rpc.ts starts using it.
  for (const key of Object.keys(schema)) {
    if (!KNOWN_KEYWORDS.has(key)) {
      errors.push(`${path}: schema uses keyword "${key}", which this validator does not implement`);
    }
  }

  if (schema.enum && !schema.enum.some((allowed) => allowed === value)) {
    errors.push(`${path}: expected one of ${schema.enum.join(', ')}, got ${JSON.stringify(value)}`);
  }

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    if (!allowed.includes(actual)) {
      errors.push(`${path}: expected ${allowed.join('|')}, got ${actual}`);
      return errors;
    }
  }

  if (Array.isArray(value)) {
    const items = schema.items;
    if (items) {
      value.forEach((item, index) => {
        errors.push(...validate(items, item, `${path}[${index}]`));
      });
    }
    return errors;
  }

  if (typeOf(value) === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(object, key)) errors.push(`${path}: missing ${key}`);
    }

    const properties = schema.properties ?? {};
    for (const [key, property] of Object.entries(properties)) {
      if (Object.hasOwn(object, key)) {
        errors.push(...validate(property, object[key], `${path}.${key}`));
      }
    }

    const extra = Object.keys(object).filter((key) => !Object.hasOwn(properties, key));
    if (schema.additionalProperties === false) {
      for (const key of extra) errors.push(`${path}: unexpected ${key}`);
    } else if (typeof schema.additionalProperties === 'object') {
      const additional = schema.additionalProperties;
      for (const key of extra) {
        errors.push(...validate(additional, object[key], `${path}.${key}`));
      }
    }
  }

  return errors;
}

function placement(source: Placement['source'], overrides: Partial<Placement> = {}): Placement {
  return {
    columnId: 'backlog',
    position: 0,
    source,
    pinned: false,
    ruleID: null,
    updatedAt: 1_763_000_000_000,
    lastRuleEventID: null,
    task: null,
    ...overrides,
  };
}

const kitchenSinkRule: Rule = {
  id: 'rule_kitchen',
  name: 'Everything at once',
  enabled: true,
  priority: 10,
  trigger: [...RULE_TRIGGERS],
  match: 'any',
  conditions: [
    { type: 'directory', op: 'prefix', value: '/work' },
    { type: 'project', op: 'eq', value: 'proj_1' },
    { type: 'title', op: 'contains', value: 'fix' },
    { type: 'title', op: 'matches', value: 'Fix the tests' },
    { type: 'agent', op: 'eq', value: 'build' },
    { type: 'root', value: true },
    { type: 'cost', op: 'gt', value: 0.5 },
    { type: 'idleMinutes', op: 'gt', value: 30 },
  ],
  actions: [
    { type: 'move', toColumn: 'waiting' },
    { type: 'pin', pinned: true },
    { type: 'notify' },
  ],
  overrideManual: true,
  cooldownMs: 60_000,
};

/** Every stored field set, so a schema that drops one cannot pass. */
const kitchenSink: BoardDocument = {
  version: BOARD_VERSION,
  revision: 42,
  columns: [
    {
      id: 'backlog',
      title: 'Backlog',
      order: 0,
      color: '#112233',
      startAgent: false,
      startPrompt: null,
    },
    {
      id: 'in-progress',
      title: 'In progress',
      order: 1,
      color: null,
      startAgent: true,
      startPrompt: 'Pick up where you left off.',
    },
    {
      id: 'waiting',
      title: 'In review',
      order: 2,
      color: '#445566',
      startAgent: false,
      startPrompt: '',
    },
    {
      id: 'ready',
      title: 'Ready to deploy',
      order: 3,
      color: null,
      startAgent: false,
      startPrompt: null,
    },
    { id: 'done', title: 'Done', order: 4, color: null, startAgent: false, startPrompt: null },
    { id: 'failed', title: 'Failed', order: 5, color: null, startAgent: false, startPrompt: null },
  ],
  defaultColumn: 'backlog',
  placements: {
    [sessionKeyOf('ses_manual')]: placement('manual', { columnId: 'in-progress', position: 1024 }),
    [sessionKeyOf('ses_rule')]: placement('rule', {
      columnId: 'waiting',
      position: 2048,
      ruleID: 'rule_kitchen',
      lastRuleEventID: 'evt_1',
      pinned: true,
    }),
    [sessionKeyOf('ses_auto')]: placement('auto', { position: 3072, task: 'Ship it.' }),
    [sessionKeyOf('ses_agent')]: placement('agent', { columnId: 'failed', position: 4096 }),
  },
  rules: [kitchenSinkRule],
  settings: {
    showSubagents: true,
    archived: 'column',
    idleMinutes: 15,
    notifyOnRuleMove: false,
    agentUpdatesCard: false,
    followRuns: false,
  },
};

describe('snapshotSchema', () => {
  it('accepts the default board', () => {
    expect(validate(snapshotSchema, defaultBoard())).toEqual([]);
  });

  it('accepts a document with every field set', () => {
    expect(validate(snapshotSchema, kitchenSink)).toEqual([]);
  });

  it('keeps a kitchen-sink document through a storage round-trip', () => {
    const stored = JSON.parse(JSON.stringify(kitchenSink));

    expect(parseBoard(stored)).toEqual(kitchenSink);
  });

  it('rejects a document the schema does not describe', () => {
    const settings: Record<string, unknown> = { ...kitchenSink.settings };
    delete settings.agentUpdatesCard;

    expect(validate(snapshotSchema, { ...kitchenSink, settings })).not.toEqual([]);
    expect(validate(snapshotSchema, { ...kitchenSink, revision: '1' })).not.toEqual([]);
    expect(
      validate(snapshotSchema, {
        ...kitchenSink,
        placements: { [sessionKeyOf('ses_x')]: { ...placement('manual'), source: 'human' } },
      }),
    ).not.toEqual([]);
  });
});
