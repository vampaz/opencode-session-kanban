import { For, Show } from 'solid-js';

import type { Rule } from '../../core/rules';
import { kanbanClient } from '../client';
import { openRuleEditor } from '../rule-editor';
import { messageOf, type SettingsApi } from './shared';

export function RulesSection(props: { api: SettingsApi }) {
  const api = props.api;
  const ctx = api.ctx;

  function sortedRules(): Rule[] {
    return [...(api.document()?.rules ?? [])].sort((left, right) => left.priority - right.priority);
  }

  function saveRule(rule: Rule): void {
    void api.run(() => kanbanClient(ctx)['rules.upsert']({ rule }));
  }

  function editRule(rule?: Rule): void {
    const doc = api.document();
    if (!doc) return;
    openRuleEditor(ctx, { board: doc, ...(rule ? { rule } : {}), save: saveRule });
  }

  function toggleRule(rule: Rule, enabled: boolean): void {
    void api.run(() => kanbanClient(ctx)['rules.upsert']({ rule: { ...rule, enabled } }));
  }

  function moveRule(rule: Rule, delta: number): void {
    const ids = sortedRules().map((candidate) => candidate.id);
    const index = ids.indexOf(rule.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void api.run(() => kanbanClient(ctx)['rules.reorder']({ ids }));
  }

  async function deleteRule(rule: Rule): Promise<void> {
    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t('settings.deleteRuleTitle', { title: rule.name }),
      description: ctx.t('settings.deleteRuleDescription'),
      confirm: ctx.t('settings.delete'),
      danger: true,
    });
    if (!confirmed) return;

    await api.run(() => kanbanClient(ctx)['rules.remove']({ id: rule.id }));
    api.setMoves(undefined);
  }

  async function dryRun(): Promise<void> {
    try {
      const result = (await kanbanClient(ctx)['rules.preview']({})) as {
        moves: NonNullable<ReturnType<SettingsApi['moves']>>;
      };
      api.setMoves(result.moves);
      api.setError(undefined);
    } catch (cause) {
      api.setError(messageOf(cause));
    }
  }

  return (
    <ctx.ui.SettingsSection title={ctx.t('settings.rules')}>
      <For
        each={sortedRules()}
        fallback={
          <ctx.ui.SettingsRow title={ctx.t('settings.noRules')}>
            <ctx.ui.Button icon="plus" onClick={() => editRule()}>
              {ctx.t('settings.addRule')}
            </ctx.ui.Button>
          </ctx.ui.SettingsRow>
        }
      >
        {(rule, index) => (
          <div class="sk-settings__rule">
            <ctx.ui.Switch
              label={ctx.t('rule.enabled')}
              hideLabel
              checked={rule.enabled}
              onChange={(checked) => toggleRule(rule, checked)}
            />
            <div class="sk-settings__grow">
              <div class="sk-settings__name">{rule.name || ctx.t('settings.untitledRule')}</div>
              <div class="sk-settings__meta">
                {`${rule.priority} · ${rule.trigger
                  .map((trigger) => ctx.t(`trigger.${trigger}`))
                  .join(', ')}`}
              </div>
            </div>
            <ctx.ui.Button variant="ghost" size="small" onClick={() => editRule(rule)}>
              {ctx.t('settings.edit')}
            </ctx.ui.Button>
            <ctx.ui.IconButton
              icon="arrow-up"
              label={ctx.t('settings.moveUp')}
              disabled={index() === 0}
              onClick={() => moveRule(rule, -1)}
            />
            <ctx.ui.IconButton
              icon="arrow-down-to-line"
              label={ctx.t('settings.moveDown')}
              disabled={index() === sortedRules().length - 1}
              onClick={() => moveRule(rule, 1)}
            />
            <ctx.ui.IconButton
              icon="trash"
              label={ctx.t('settings.deleteRule')}
              onClick={() => void deleteRule(rule)}
            />
          </div>
        )}
      </For>
      <ctx.ui.SettingsRow title={ctx.t('settings.dryRun')}>
        <div class="sk-settings__preview">
          <ctx.ui.Button icon="status" onClick={() => void dryRun()}>
            {ctx.t('settings.dryRun')}
          </ctx.ui.Button>
          <Show when={api.moves()}>
            {(list) => (
              <div class="sk-settings__moves">
                <Show
                  when={list().length > 0}
                  fallback={<p class="sk-detail">{ctx.t('settings.previewEmpty')}</p>}
                >
                  <For each={list()}>
                    {(move) => (
                      <p class="sk-detail">
                        {ctx.t('settings.previewLine', {
                          session: api.sessionTitle(move.sessionKey),
                          column: api.columnTitle(move.to),
                        })}
                      </p>
                    )}
                  </For>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </ctx.ui.SettingsRow>
      <ctx.ui.SettingsRow title={ctx.t('settings.addRule')}>
        <ctx.ui.Button icon="plus" onClick={() => editRule()}>
          {ctx.t('settings.addRule')}
        </ctx.ui.Button>
      </ctx.ui.SettingsRow>
    </ctx.ui.SettingsSection>
  );
}
