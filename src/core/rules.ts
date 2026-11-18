import {
  columnOrder,
  dropPlacement,
  pinPlacement,
  type BoardDocument,
  type Placement,
} from './board';

/** The closed trigger set. Webhooks and prompts are deliberately absent. */
export type RuleTrigger =
  | 'status.running'
  | 'status.idle'
  | 'run.succeeded'
  | 'run.failed'
  | 'run.interrupted'
  | 'waiting.permission'
  | 'waiting.form'
  | 'created'
  | 'idle.for';

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

export type RuleCondition =
  | { readonly type: 'directory'; readonly op: 'prefix' | 'eq'; readonly value: string }
  | { readonly type: 'project'; readonly op: 'eq'; readonly value: string }
  | { readonly type: 'title'; readonly op: 'contains' | 'matches'; readonly value: string }
  | { readonly type: 'agent'; readonly op: 'eq'; readonly value: string }
  | { readonly type: 'root'; readonly value: boolean }
  | { readonly type: 'cost'; readonly op: 'gt'; readonly value: number }
  | { readonly type: 'idleMinutes'; readonly op: 'gt'; readonly value: number };

export const CONDITION_TYPES = [
  'directory',
  'project',
  'title',
  'agent',
  'root',
  'cost',
  'idleMinutes',
] as const;

/** Archiving is never a rule action. */
export type RuleAction =
  | { readonly type: 'move'; readonly toColumn: string }
  | { readonly type: 'pin'; readonly pinned: boolean }
  | { readonly type: 'notify' };

export type Rule = {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly trigger: readonly RuleTrigger[];
  readonly match: 'all' | 'any';
  readonly conditions: readonly RuleCondition[];
  readonly actions: readonly RuleAction[];
  readonly overrideManual: boolean;
  readonly cooldownMs: number;
};

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

/** What a rule reads about the session an event is about. Derived, never stored. */
export type RuleSubject = {
  readonly sessionKey: string;
  readonly directory: string;
  readonly projectID: string;
  readonly title: string;
  readonly agent: string | undefined;
  readonly root: boolean;
  readonly cost: number;
  readonly idleMinutes: number;
  /** Archived itself, or part of an archived family, or an orphan of a deleted root. */
  readonly archived: boolean;
};

export type RuleEvent = {
  readonly trigger: RuleTrigger;
  readonly eventID: string;
  readonly now: number;
};

export type RuleOutcome = {
  readonly board: BoardDocument;
  readonly ruleID: string;
  readonly ruleName: string;
  readonly from: string;
  readonly to: string | undefined;
  readonly pinned: boolean | undefined;
  readonly notify: boolean;
  readonly changed: boolean;
};

export function conditionMatches(condition: RuleCondition, subject: RuleSubject): boolean {
  switch (condition.type) {
    case 'directory':
      return condition.op === 'eq'
        ? subject.directory === condition.value
        : subject.directory.startsWith(condition.value);
    case 'project':
      return subject.projectID === condition.value;
    case 'title': {
      const title = subject.title.toLowerCase();
      const value = condition.value.toLowerCase();
      return condition.op === 'matches' ? title === value : title.includes(value);
    }
    case 'agent':
      return subject.agent === condition.value;
    case 'root':
      return subject.root === condition.value;
    case 'cost':
      return subject.cost > condition.value;
    case 'idleMinutes':
      return subject.idleMinutes > condition.value;
  }
}

export function conditionsMatch(rule: Rule, subject: RuleSubject): boolean {
  if (rule.conditions.length === 0) return true;
  return rule.match === 'all'
    ? rule.conditions.every((condition) => conditionMatches(condition, subject))
    : rule.conditions.some((condition) => conditionMatches(condition, subject));
}

function byPriority(left: Rule, right: Rule): number {
  return left.priority - right.priority;
}

/** The move a rule wants, when its column exists and the card is not already there. */
function moveOf(rule: Rule, board: BoardDocument, from: string) {
  const action = rule.actions.find((candidate) => candidate.type === 'move');
  if (!action || action.toColumn === from) return undefined;
  if (!board.columns.some((column) => column.id === action.toColumn)) return undefined;
  return action;
}

function pinOf(rule: Rule, placement: Placement | undefined) {
  const action = rule.actions.find((candidate) => candidate.type === 'pin');
  if (!action) return undefined;
  return action.pinned === (placement?.pinned ?? false) ? undefined : action;
}

/**
 * The engine's single decision. Rules run in ascending `priority`; the first rule that matches the
 * trigger and conditions wins. A match with nothing to change is skipped, so a later rule may act.
 *
 * Guards: an archived (or deleted-root) session is never touched; a manual or pinned placement is
 * skipped unless the rule overrides it; a `(rule, session, event)` applies once, recorded in
 * `lastRuleEventID`; and `cooldownMs` bounds repeat firings from the placement's last write.
 */
export function applyRule(
  board: BoardDocument,
  subject: RuleSubject,
  event: RuleEvent,
): RuleOutcome | undefined {
  if (subject.archived) return undefined;

  const placement = board.placements[subject.sessionKey];
  const from = placement?.columnId ?? board.defaultColumn;

  for (const rule of [...board.rules].sort(byPriority)) {
    if (!rule.enabled || !rule.trigger.includes(event.trigger)) continue;
    if (!conditionsMatch(rule, subject)) continue;
    if (!rule.overrideManual && placement && (placement.source === 'manual' || placement.pinned)) {
      continue;
    }
    if (placement?.ruleID === rule.id && placement.lastRuleEventID === event.eventID) continue;
    if (
      placement?.ruleID === rule.id &&
      rule.cooldownMs > 0 &&
      event.now - placement.updatedAt < rule.cooldownMs
    ) {
      continue;
    }

    const move = moveOf(rule, board, from);
    const pin = pinOf(rule, placement);
    const notify = rule.actions.some((action) => action.type === 'notify');
    if (!move && !pin && !notify) continue;

    let next = board;
    if (move) {
      next = dropPlacement(next, {
        sessionKey: subject.sessionKey,
        columnId: move.toColumn,
        index: columnOrder(next, move.toColumn).length,
        source: 'rule',
        updatedAt: event.now,
      }).board;
    }
    if (pin) next = pinPlacement(next, subject.sessionKey, pin.pinned, event.now);

    const current = next.placements[subject.sessionKey];
    if (current) {
      next = {
        ...next,
        placements: {
          ...next.placements,
          [subject.sessionKey]: {
            ...current,
            ruleID: rule.id,
            lastRuleEventID: event.eventID,
          },
        },
      };
    }

    return {
      board: next,
      ruleID: rule.id,
      ruleName: rule.name,
      from,
      to: move?.toColumn,
      pinned: pin?.pinned,
      notify,
      changed: next !== board,
    };
  }

  return undefined;
}

export type PreviewMove = {
  readonly sessionKey: string;
  readonly from: string;
  readonly to: string;
  readonly ruleID: string;
};

/** Dry run: what the rules would move right now, without triggers and without writing. */
export function previewRules(
  board: BoardDocument,
  subjects: readonly RuleSubject[],
): PreviewMove[] {
  const moves: PreviewMove[] = [];

  for (const subject of subjects) {
    if (subject.archived) continue;

    const placement = board.placements[subject.sessionKey];
    const from = placement?.columnId ?? board.defaultColumn;

    for (const rule of [...board.rules].sort(byPriority)) {
      if (!rule.enabled) continue;
      if (!conditionsMatch(rule, subject)) continue;
      if (
        !rule.overrideManual &&
        placement &&
        (placement.source === 'manual' || placement.pinned)
      ) {
        continue;
      }

      const move = moveOf(rule, board, from);
      if (!move) continue;

      moves.push({ sessionKey: subject.sessionKey, from, to: move.toColumn, ruleID: rule.id });
      break;
    }
  }

  return moves;
}
