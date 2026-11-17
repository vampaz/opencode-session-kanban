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

export type RuleCondition =
  | { readonly type: 'directory'; readonly op: 'prefix' | 'eq'; readonly value: string }
  | { readonly type: 'project'; readonly op: 'eq'; readonly value: string }
  | { readonly type: 'title'; readonly op: 'contains' | 'matches'; readonly value: string }
  | { readonly type: 'agent'; readonly op: 'eq'; readonly value: string }
  | { readonly type: 'root'; readonly value: boolean }
  | { readonly type: 'cost'; readonly op: 'gt'; readonly value: number }
  | { readonly type: 'idleMinutes'; readonly op: 'gt'; readonly value: number };

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
