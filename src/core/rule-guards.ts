import type { Rule, RuleAction, RuleCondition, RuleTrigger } from './rules';

/**
 * The rule shape guards live in their own module on purpose: `board.ts` needs `isRule` at runtime,
 * and `rules.ts` imports from `board.ts`, so defining the guards in `rules.ts` would create a
 * runtime import cycle that breaks the plugin load in the live server. Type-only imports are
 * erased, so this module has no runtime dependencies and cannot cycle.
 */

/** The closed trigger set. Webhooks and prompts are deliberately absent. */
export const RULE_TRIGGERS: readonly RuleTrigger[] = [
  'status.running',
  'status.idle',
  'run.succeeded',
  'run.failed',
  'run.interrupted',
  'waiting.permission',
  'waiting.form',
  'created',
  'idle.for',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTrigger(value: unknown): value is RuleTrigger {
  return typeof value === 'string' && (RULE_TRIGGERS as readonly string[]).includes(value);
}

/** A pure guard for the stored and parsed condition shape. */
export function isRuleCondition(value: unknown): value is RuleCondition {
  if (!isRecord(value)) return false;

  switch (value.type) {
    case 'directory':
      return (value.op === 'prefix' || value.op === 'eq') && typeof value.value === 'string';
    case 'project':
      return value.op === 'eq' && typeof value.value === 'string';
    case 'title':
      return (value.op === 'contains' || value.op === 'matches') && typeof value.value === 'string';
    case 'agent':
      return value.op === 'eq' && typeof value.value === 'string';
    case 'root':
      return typeof value.value === 'boolean';
    case 'cost':
    case 'idleMinutes':
      return value.op === 'gt' && isFiniteNumber(value.value);
    default:
      return false;
  }
}

/** A pure guard for the stored and parsed action shape. */
export function isRuleAction(value: unknown): value is RuleAction {
  if (!isRecord(value)) return false;

  switch (value.type) {
    case 'move':
      return typeof value.toColumn === 'string';
    case 'pin':
      return typeof value.pinned === 'boolean';
    case 'notify':
      return true;
    default:
      return false;
  }
}

/** A pure guard for a whole rule, field by field. */
export function isRule(value: unknown): value is Rule {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.enabled === 'boolean' &&
    isFiniteNumber(value.priority) &&
    Array.isArray(value.trigger) &&
    value.trigger.every(isTrigger) &&
    (value.match === 'all' || value.match === 'any') &&
    Array.isArray(value.conditions) &&
    value.conditions.every(isRuleCondition) &&
    Array.isArray(value.actions) &&
    value.actions.every(isRuleAction) &&
    typeof value.overrideManual === 'boolean' &&
    isFiniteNumber(value.cooldownMs) &&
    value.cooldownMs >= 0
  );
}
