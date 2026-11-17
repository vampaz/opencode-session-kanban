import { For, Index, Show, createSignal } from 'solid-js';
import type { DialogHandle, UiMenuEntry } from '@opencode/plugin/gui';

import type { BoardDocument } from '../core/board';
import {
  CONDITION_TYPES,
  RULE_TRIGGERS,
  type Rule,
  type RuleAction,
  type RuleCondition,
  type RuleTrigger,
} from '../core/rules';
import type { UiContext } from './client';

type PinMode = 'none' | 'pin' | 'unpin';

const CONDITION_OPERATORS: Record<RuleCondition['type'], readonly string[]> = {
  directory: ['prefix', 'eq'],
  project: ['eq'],
  title: ['contains', 'matches'],
  agent: ['eq'],
  root: [],
  cost: ['gt'],
  idleMinutes: ['gt'],
};

function newRule(board: BoardDocument): Rule {
  return {
    id: `rule_${Math.random().toString(36).slice(2, 10)}`,
    name: '',
    enabled: true,
    priority: board.rules.length * 10,
    trigger: ['created'],
    match: 'all',
    conditions: [],
    actions: [{ type: 'move', toColumn: board.defaultColumn }],
    overrideManual: false,
    cooldownMs: 0,
  };
}

export function openRuleEditor(
  ctx: UiContext,
  options: { readonly board: BoardDocument; readonly rule?: Rule; save(rule: Rule): void },
): void {
  ctx.dialogs.open((dialog) => (
    <RuleEditor
      ctx={ctx}
      dialog={dialog}
      board={options.board}
      rule={options.rule}
      save={options.save}
    />
  ));
}

function RuleEditor(props: {
  ctx: UiContext;
  dialog: DialogHandle;
  board: BoardDocument;
  rule?: Rule;
  save(rule: Rule): void;
}) {
  const ctx = props.ctx;
  // A new rule starts from the template, so the editor opens with its default trigger and move.
  const seed = props.rule ?? newRule(props.board);

  const [name, setName] = createSignal(seed.name);
  const [priority, setPriority] = createSignal(String(seed.priority));
  const [match, setMatch] = createSignal<'all' | 'any'>(seed.match);
  const [enabled, setEnabled] = createSignal(seed.enabled);
  const [overrideManual, setOverrideManual] = createSignal(seed.overrideManual);
  const [cooldown, setCooldown] = createSignal(String(seed.cooldownMs));
  const [triggers, setTriggers] = createSignal<RuleTrigger[]>([...seed.trigger]);
  const [conditions, setConditions] = createSignal<RuleCondition[]>([...seed.conditions]);

  const moveColumn = () => {
    const action = seed.actions.find((candidate) => candidate.type === 'move');
    return action?.type === 'move' ? action.toColumn : '';
  };
  const pinMode = (): PinMode => {
    const action = seed.actions.find((candidate) => candidate.type === 'pin');
    if (action?.type !== 'pin') return 'none';
    return action.pinned ? 'pin' : 'unpin';
  };

  const [column, setColumn] = createSignal(moveColumn());
  const [pin, setPin] = createSignal<PinMode>(pinMode());
  const [notify, setNotify] = createSignal(seed.actions.some((action) => action.type === 'notify'));
  const [error, setError] = createSignal<string>();

  function toggleTrigger(trigger: RuleTrigger, checked: boolean): void {
    setTriggers(
      checked ? [...triggers(), trigger] : triggers().filter((candidate) => candidate !== trigger),
    );
  }

  function updateCondition(index: number, next: RuleCondition): void {
    setConditions(conditions().map((item, position) => (position === index ? next : item)));
  }

  function removeCondition(index: number): void {
    setConditions(conditions().filter((_, position) => position !== index));
  }

  function conditionItems(index: number): UiMenuEntry[] {
    return CONDITION_TYPES.map((type) => ({
      label: ctx.t(`condition.${type}`),
      onSelect: () => updateCondition(index, defaultCondition(type)),
    }));
  }

  function addConditionItems(): UiMenuEntry[] {
    return CONDITION_TYPES.map((type) => ({
      label: ctx.t(`condition.${type}`),
      onSelect: () => setConditions([...conditions(), defaultCondition(type)]),
    }));
  }

  function operatorItems(index: number, type: RuleCondition['type']): UiMenuEntry[] {
    return CONDITION_OPERATORS[type].map((op) => ({
      label: ctx.t(`operator.${op}`),
      onSelect: () => updateCondition(index, withOperator(conditions()[index]!, op)),
    }));
  }

  function columnItems(): UiMenuEntry[] {
    return [
      { label: ctx.t('rule.noMove'), onSelect: () => setColumn('') },
      ...props.board.columns.map((candidate) => ({
        label: candidate.title,
        onSelect: () => setColumn(candidate.id),
      })),
    ];
  }

  function pinItems(): UiMenuEntry[] {
    return [
      { label: ctx.t('rule.pinNone'), onSelect: () => setPin('none') },
      { label: ctx.t('rule.pinOn'), onSelect: () => setPin('pin') },
      { label: ctx.t('rule.pinOff'), onSelect: () => setPin('unpin') },
    ];
  }

  function columnTitle(id: string): string {
    return props.board.columns.find((candidate) => candidate.id === id)?.title ?? id;
  }

  function pinLabel(): string {
    switch (pin()) {
      case 'pin':
        return ctx.t('rule.pinOn');
      case 'unpin':
        return ctx.t('rule.pinOff');
      default:
        return ctx.t('rule.pinNone');
    }
  }

  function save(): void {
    const ruleName = name().trim();
    if (!ruleName) {
      setError(ctx.t('rule.nameRequired'));
      return;
    }

    const actions: RuleAction[] = [];
    if (column()) actions.push({ type: 'move', toColumn: column() });
    if (pin() !== 'none') actions.push({ type: 'pin', pinned: pin() === 'pin' });
    if (notify()) actions.push({ type: 'notify' });

    props.save({
      id: seed.id,
      name: ruleName,
      enabled: enabled(),
      priority: Number(priority()) || 0,
      trigger: triggers(),
      match: match(),
      conditions: conditions(),
      actions,
      overrideManual: overrideManual(),
      cooldownMs: Math.max(0, Number(cooldown()) || 0),
    });
    props.dialog.close();
  }

  return (
    <ctx.ui.Dialog
      title={ctx.t(props.rule ? 'rule.edit' : 'rule.new')}
      size="x-large"
      footer={
        <>
          <ctx.ui.Button variant="ghost" onClick={() => props.dialog.close()}>
            {ctx.t('rule.cancel')}
          </ctx.ui.Button>
          <ctx.ui.Button variant="contrast" onClick={save}>
            {ctx.t('rule.save')}
          </ctx.ui.Button>
        </>
      }
    >
      <div class="sk-form">
        <ctx.ui.TextInput
          label={ctx.t('rule.name')}
          placeholder={ctx.t('rule.nameHint')}
          value={name()}
          onInput={setName}
          autofocus
        />
        <div class="sk-form__row">
          <ctx.ui.TextInput
            label={ctx.t('rule.priority')}
            value={priority()}
            onInput={setPriority}
          />
          <ctx.ui.Menu
            trigger="button"
            icon="checklist"
            label={match() === 'all' ? ctx.t('rule.matchAll') : ctx.t('rule.matchAny')}
            items={[
              { label: ctx.t('rule.matchAll'), onSelect: () => setMatch('all') },
              { label: ctx.t('rule.matchAny'), onSelect: () => setMatch('any') },
            ]}
          />
          <ctx.ui.TextInput
            label={ctx.t('rule.cooldown')}
            value={cooldown()}
            onInput={setCooldown}
          />
        </div>
        <div class="sk-form__row">
          <ctx.ui.Switch label={ctx.t('rule.enabled')} checked={enabled()} onChange={setEnabled} />
          <ctx.ui.Switch
            label={ctx.t('rule.override')}
            description={ctx.t('rule.overrideHint')}
            checked={overrideManual()}
            onChange={setOverrideManual}
          />
        </div>

        <div class="sk-rule__group">
          <span class="sk-rule__title">{ctx.t('rule.triggers')}</span>
          <div class="sk-rule__grid">
            <For each={RULE_TRIGGERS}>
              {(trigger) => (
                <ctx.ui.Switch
                  label={ctx.t(`trigger.${trigger}`)}
                  checked={triggers().includes(trigger)}
                  onChange={(checked) => toggleTrigger(trigger, checked)}
                />
              )}
            </For>
          </div>
        </div>

        <div class="sk-rule__group">
          <span class="sk-rule__title">{ctx.t('rule.conditions')}</span>
          <Index each={conditions()}>
            {(condition, index) => (
              <div class="sk-rule__condition">
                <ctx.ui.Menu
                  trigger="button"
                  label={ctx.t(`condition.${condition().type}`)}
                  items={conditionItems(index)}
                />
                <Show when={condition().type !== 'root'}>
                  <ctx.ui.Menu
                    trigger="button"
                    label={ctx.t(`operator.${operatorOf(condition())}`)}
                    items={operatorItems(index, condition().type)}
                  />
                  <ctx.ui.TextInput
                    label={ctx.t('rule.value')}
                    value={String(condition().value)}
                    onInput={(value) => updateCondition(index, withValue(condition(), value))}
                  />
                </Show>
                <Show when={condition().type === 'root'}>
                  <ctx.ui.Switch
                    label={ctx.t('rule.value')}
                    checked={condition().value === true}
                    onChange={(checked) => updateCondition(index, { type: 'root', value: checked })}
                  />
                </Show>
                <ctx.ui.IconButton
                  icon="trash"
                  label={ctx.t('rule.removeCondition')}
                  onClick={() => removeCondition(index)}
                />
              </div>
            )}
          </Index>
          <ctx.ui.Menu
            trigger="button"
            icon="plus"
            label={ctx.t('rule.addCondition')}
            items={addConditionItems()}
          />
        </div>

        <div class="sk-rule__group">
          <span class="sk-rule__title">{ctx.t('rule.actions')}</span>
          <div class="sk-form__row">
            <ctx.ui.Menu
              trigger="button"
              icon="arrow-right"
              label={column() ? columnTitle(column()) : ctx.t('rule.noMove')}
              items={columnItems()}
            />
            <ctx.ui.Menu trigger="button" icon="arrow-up" label={pinLabel()} items={pinItems()} />
            <ctx.ui.Switch label={ctx.t('rule.notify')} checked={notify()} onChange={setNotify} />
          </div>
        </div>

        <Show when={error()}>{(message) => <p class="sk-detail">{message()}</p>}</Show>
      </div>
    </ctx.ui.Dialog>
  );
}

function defaultCondition(type: RuleCondition['type']): RuleCondition {
  switch (type) {
    case 'directory':
      return { type, op: 'prefix', value: '' };
    case 'project':
      return { type, op: 'eq', value: '' };
    case 'title':
      return { type, op: 'contains', value: '' };
    case 'agent':
      return { type, op: 'eq', value: '' };
    case 'root':
      return { type, value: true };
    case 'cost':
      return { type, op: 'gt', value: 0 };
    case 'idleMinutes':
      return { type, op: 'gt', value: 0 };
  }
}

function operatorOf(condition: RuleCondition): string {
  return 'op' in condition ? condition.op : '';
}

function withOperator(condition: RuleCondition, op: string): RuleCondition {
  if (condition.type === 'root') return condition;
  if (condition.type === 'cost' || condition.type === 'idleMinutes') {
    return { type: condition.type, op: 'gt', value: condition.value };
  }
  if (condition.type === 'directory') {
    return { type: condition.type, op: op === 'eq' ? 'eq' : 'prefix', value: condition.value };
  }
  if (condition.type === 'title') {
    return {
      type: condition.type,
      op: op === 'matches' ? 'matches' : 'contains',
      value: condition.value,
    };
  }

  if (condition.type === 'agent') return { type: 'agent', op: 'eq', value: condition.value };
  if (condition.type === 'project') return { type: 'project', op: 'eq', value: condition.value };
  return condition;
}

function withValue(condition: RuleCondition, raw: string): RuleCondition {
  if (condition.type === 'root') return condition;
  if (condition.type === 'cost' || condition.type === 'idleMinutes') {
    return { ...condition, value: Number(raw) || 0 };
  }
  return { ...condition, value: raw };
}
