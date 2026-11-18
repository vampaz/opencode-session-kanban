import { randomUUID } from 'node:crypto';

import type { CardStatus } from '../core/status';

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

const CARD_STATUSES: readonly CardStatus[] = [
  'idle',
  'running',
  'waiting',
  'failed',
  'interrupted',
];

export function parseString(value: unknown, name: string): Parsed<string> {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, message: `${name} must be a non-empty string.` };
  }
  return { ok: true, value: value.trim() };
}

export function parseOptionalString(value: unknown, name: string): Parsed<string | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== 'string') return { ok: false, message: `${name} must be a string.` };
  return { ok: true, value: value.trim() === '' ? undefined : value.trim() };
}

export function parseBoolean(value: unknown, name: string): Parsed<boolean> {
  if (typeof value !== 'boolean') return { ok: false, message: `${name} must be true or false.` };
  return { ok: true, value };
}

/** `me` resolves to the session that made the tool call. */
export function resolveSessionID(value: unknown, callerSessionID: string): Parsed<string> {
  const parsed = parseString(value, 'sessionID');
  if (!parsed.ok) {
    return {
      ok: false,
      message: `${parsed.message} Use "me" for the current session.`,
    };
  }

  if (parsed.value.toLowerCase() === 'me') return { ok: true, value: callerSessionID };
  return { ok: true, value: parsed.value };
}

export function parseStatus(value: unknown): Parsed<CardStatus | undefined> {
  if (value === undefined || value === null || value === '') return { ok: true, value: undefined };
  if (typeof value !== 'string' || !(CARD_STATUSES as readonly string[]).includes(value)) {
    return {
      ok: false,
      message: `status must be one of: ${CARD_STATUSES.join(', ')}.`,
    };
  }

  return { ok: true, value: value as CardStatus };
}

export type ListQuery = {
  readonly column?: string;
  readonly project?: string;
  readonly status?: CardStatus;
  readonly text?: string;
  readonly includeSubagents?: boolean;
};

export function parseListQuery(value: unknown): Parsed<ListQuery> {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== 'object') return { ok: false, message: 'The filter must be an object.' };

  const input = value as Record<string, unknown>;
  const column = parseOptionalString(input.column, 'column');
  if (!column.ok) return column;
  const project = parseOptionalString(input.project, 'project');
  if (!project.ok) return project;
  const status = parseStatus(input.status);
  if (!status.ok) return status;
  const text = parseOptionalString(input.text, 'text');
  if (!text.ok) return text;

  let includeSubagents: boolean | undefined;
  if (input.includeSubagents !== undefined) {
    const parsed = parseBoolean(input.includeSubagents, 'includeSubagents');
    if (!parsed.ok) return parsed;
    includeSubagents = parsed.value;
  }

  return {
    ok: true,
    value: {
      ...(column.value ? { column: column.value } : {}),
      ...(project.value ? { project: project.value } : {}),
      ...(status.value ? { status: status.value } : {}),
      ...(text.value ? { text: text.value } : {}),
      ...(includeSubagents !== undefined ? { includeSubagents } : {}),
    },
  };
}

export type CreateInput = {
  readonly directory: string;
  readonly column: string;
  readonly title?: string;
  readonly prompt?: string;
};

export function parseCreateInput(value: unknown): Parsed<CreateInput> {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, message: 'The input must be an object.' };
  }

  const input = value as Record<string, unknown>;
  const directory = parseString(input.directory, 'directory');
  if (!directory.ok) return directory;
  const column = parseString(input.column, 'column');
  if (!column.ok) return column;
  const title = parseOptionalString(input.title, 'title');
  if (!title.ok) return title;
  const prompt = parseOptionalString(input.prompt, 'prompt');
  if (!prompt.ok) return prompt;

  return {
    ok: true,
    value: {
      directory: directory.value,
      column: column.value,
      ...(title.value ? { title: title.value } : {}),
      ...(prompt.value ? { prompt: prompt.value } : {}),
    },
  };
}

/** Fills the rule fields `kanban_set_rule` may omit before `parseRule` validates the result. */
export function withRuleDefaults(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const input = value as Record<string, unknown>;

  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id : `rule_${randomUUID()}`,
    name: input.name,
    enabled: input.enabled ?? true,
    priority: input.priority ?? 0,
    trigger: input.trigger ?? ['created'],
    match: input.match ?? 'all',
    conditions: input.conditions ?? [],
    actions: input.actions ?? [],
    overrideManual: input.overrideManual ?? false,
    cooldownMs: input.cooldownMs ?? 0,
  };
}
