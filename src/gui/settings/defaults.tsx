import type { UiMenuEntry } from '@opencode/plugin/gui';

import { SavedTextInput } from './field';
import type { SettingsApi } from './shared';

export function DefaultsSection(props: { api: SettingsApi }) {
  const api = props.api;
  const ctx = api.ctx;

  const settings = () => api.document()?.settings;

  function projectItems(): UiMenuEntry[] {
    return (api.document()?.columns ?? []).map((column) => ({
      label: column.title,
      onSelect: () => api.setDefaultColumn(column.id),
    }));
  }

  function archivedItems(): UiMenuEntry[] {
    return [
      { label: ctx.t('settings.archivedHide'), onSelect: () => api.setSetting('archived', 'hide') },
      {
        label: ctx.t('settings.archivedColumn'),
        onSelect: () => api.setSetting('archived', 'column'),
      },
    ];
  }

  return (
    <ctx.ui.SettingsSection title={ctx.t('settings.board')}>
      <ctx.ui.SettingsRow
        id="default-column"
        title={ctx.t('settings.defaultColumn')}
        description={ctx.t('settings.defaultColumnHint')}
      >
        <ctx.ui.Menu
          trigger="button"
          icon="layout-left"
          label={api.columnTitle(api.document()?.defaultColumn ?? '')}
          items={projectItems()}
        />
      </ctx.ui.SettingsRow>
      <ctx.ui.SettingsRow
        id="archived"
        title={ctx.t('settings.archived')}
        description={ctx.t('settings.archivedHint')}
      >
        <ctx.ui.Menu
          trigger="button"
          icon="archive"
          label={
            settings()?.archived === 'hide'
              ? ctx.t('settings.archivedHide')
              : ctx.t('settings.archivedColumn')
          }
          items={archivedItems()}
        />
      </ctx.ui.SettingsRow>
      <ctx.ui.SettingsRow
        id="idle"
        title={ctx.t('settings.idleMinutes')}
        description={ctx.t('settings.idleMinutesHint')}
      >
        <SavedTextInput
          ctx={ctx}
          class="sk-settings__control"
          label={ctx.t('settings.idleMinutes')}
          value={String(settings()?.idleMinutes ?? 0)}
          onSave={(value) => api.setSetting('idleMinutes', Math.max(0, Number(value) || 0))}
        />
      </ctx.ui.SettingsRow>
      <ctx.ui.SettingsRow
        id="notify-moves"
        title={ctx.t('settings.notifyOnRuleMove')}
        description={ctx.t('settings.notifyOnRuleMoveHint')}
      >
        <ctx.ui.Switch
          label={ctx.t('settings.notifyOnRuleMove')}
          hideLabel
          checked={settings()?.notifyOnRuleMove ?? false}
          onChange={(checked) => api.setSetting('notifyOnRuleMove', checked)}
        />
      </ctx.ui.SettingsRow>
      <ctx.ui.SettingsRow
        id="follow-runs"
        title={ctx.t('settings.followRuns')}
        description={ctx.t('settings.followRunsHint')}
      >
        <ctx.ui.Switch
          label={ctx.t('settings.followRuns')}
          hideLabel
          checked={settings()?.followRuns ?? false}
          onChange={(checked) => api.setSetting('followRuns', checked)}
        />
      </ctx.ui.SettingsRow>
      <ctx.ui.SettingsRow
        id="agent-updates"
        title={ctx.t('settings.agentUpdatesCard')}
        description={ctx.t('settings.agentUpdatesCardHint')}
      >
        <ctx.ui.Switch
          label={ctx.t('settings.agentUpdatesCard')}
          hideLabel
          checked={settings()?.agentUpdatesCard ?? false}
          onChange={(checked) => api.setSetting('agentUpdatesCard', checked)}
        />
      </ctx.ui.SettingsRow>
    </ctx.ui.SettingsSection>
  );
}
