import type { BoardSettings, Column } from './core/board';
import {
  RULE_TRIGGERS,
  type Rule,
  type RuleAction,
  type RuleCondition,
  type RuleTrigger,
} from './core/rules';

type Json = Record<string, unknown>;

function record(value: unknown, name: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name}.`);
  }
  return value as Json;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Invalid ${name}.`);
  return value;
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${name}.`);
  return value;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${name}.`);
  return value;
}

function trigger(value: unknown): RuleTrigger {
  const candidate = text(value, 'trigger');
  if (!(RULE_TRIGGERS as readonly string[]).includes(candidate)) {
    throw new Error(`Unknown trigger: ${candidate}.`);
  }
  return candidate as RuleTrigger;
}

function condition(value: unknown): RuleCondition {
  const item = record(value, 'condition');
  const valueField = item.value;

  switch (item.type) {
    case 'directory':
      if (item.op !== 'prefix' && item.op !== 'eq') throw new Error('Unknown directory operator.');
      return { type: 'directory', op: item.op, value: text(valueField, 'condition value') };
    case 'project':
      if (item.op !== 'eq') throw new Error('Unknown project operator.');
      return { type: 'project', op: 'eq', value: text(valueField, 'condition value') };
    case 'title':
      if (item.op !== 'contains' && item.op !== 'matches') {
        throw new Error('Unknown title operator.');
      }
      return { type: 'title', op: item.op, value: text(valueField, 'condition value') };
    case 'agent':
      if (item.op !== 'eq') throw new Error('Unknown agent operator.');
      return { type: 'agent', op: 'eq', value: text(valueField, 'condition value') };
    case 'root':
      return { type: 'root', value: bool(valueField, 'condition value') };
    case 'cost':
      if (item.op !== 'gt') throw new Error('Unknown cost operator.');
      return { type: 'cost', op: 'gt', value: finite(valueField, 'condition value') };
    case 'idleMinutes':
      if (item.op !== 'gt') throw new Error('Unknown idle operator.');
      return { type: 'idleMinutes', op: 'gt', value: finite(valueField, 'condition value') };
    default:
      throw new Error(`Unknown condition type: ${String(item.type)}.`);
  }
}

function action(value: unknown): RuleAction {
  const item = record(value, 'action');

  switch (item.type) {
    case 'move':
      return { type: 'move', toColumn: text(item.toColumn, 'action column') };
    case 'pin':
      return { type: 'pin', pinned: bool(item.pinned, 'action pin') };
    case 'notify':
      return { type: 'notify' };
    default:
      throw new Error(`Unknown action: ${String(item.type)}.`);
  }
}

export function parseRule(value: unknown): Rule {
  const item = record(value, 'rule');
  const triggers = item.trigger;
  const conditions = item.conditions;
  const actions = item.actions;
  if (!Array.isArray(triggers)) throw new Error('A rule needs a trigger list.');
  if (!Array.isArray(conditions)) throw new Error('A rule needs a condition list.');
  if (!Array.isArray(actions)) throw new Error('A rule needs an action list.');
  if (item.match !== 'all' && item.match !== 'any') throw new Error('A rule needs a match mode.');

  const cooldown = item.cooldownMs === undefined ? 0 : finite(item.cooldownMs, 'cooldown');
  if (cooldown < 0) throw new Error('The cooldown cannot be negative.');

  return {
    id: text(item.id, 'rule id'),
    name: text(item.name, 'rule name'),
    enabled: bool(item.enabled, 'rule enabled'),
    priority: finite(item.priority, 'rule priority'),
    trigger: triggers.map(trigger),
    match: item.match,
    conditions: conditions.map(condition),
    actions: actions.map(action),
    overrideManual: bool(item.overrideManual, 'override manual'),
    cooldownMs: cooldown,
  };
}

export function parseColumn(value: unknown): Column {
  const item = record(value, 'column');

  return {
    id: text(item.id, 'column id'),
    title: text(item.title, 'column title'),
    order: finite(item.order, 'column order'),
    color: item.color === null ? null : text(item.color, 'column color'),
    collapsed: bool(item.collapsed, 'column collapsed'),
  };
}

export function parseIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Expected a list of ids.');
  return value.map((item) => text(item, 'id'));
}

export function parseSettings(value: unknown): Partial<BoardSettings> {
  const item = record(value, 'settings');
  const patch: Record<string, unknown> = {};

  if (item.showSubagents !== undefined)
    patch.showSubagents = bool(item.showSubagents, 'showSubagents');
  if (item.archived !== undefined) {
    if (item.archived !== 'hide' && item.archived !== 'column')
      throw new Error('Invalid archived.');
    patch.archived = item.archived;
  }
  if (item.idleMinutes !== undefined) {
    const minutes = finite(item.idleMinutes, 'idleMinutes');
    if (minutes < 0) throw new Error('Invalid idleMinutes.');
    patch.idleMinutes = minutes;
  }
  if (item.notifyOnRuleMove !== undefined) {
    patch.notifyOnRuleMove = bool(item.notifyOnRuleMove, 'notifyOnRuleMove');
  }

  return patch as Partial<BoardSettings>;
}
