import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { SettingsPage } from '@opencode/plugin/gui';

import type { BoardDocument, BoardSettings } from '../../core/board';
import type { PreviewMove } from '../../core/rules';
import { sessionIDOfKey } from '../../core/session-ref';
import { kanbanClient, type UiContext } from '../client';
import { serverOf } from '../sessions';
import { ColumnsSection } from './columns';
import { DataSection } from './data';
import { DefaultsSection } from './defaults';
import { RulesSection } from './rules';
import { messageOf, type SettingsApi } from './shared';

export function addSettingsPage(ctx: UiContext): void {
  ctx.add(SettingsPage, {
    id: 'kanban',
    icon: 'dot-grid',
    get title() {
      return ctx.t('settings.title');
    },
    get entries() {
      return [
        {
          id: 'default-column',
          title: ctx.t('settings.defaultColumn'),
          keywords: 'board column default',
        },
        { id: 'archived', title: ctx.t('settings.archived'), keywords: 'archive hide column' },
        { id: 'idle', title: ctx.t('settings.idleMinutes'), keywords: 'idle rules minutes' },
        {
          id: 'follow-runs',
          title: ctx.t('settings.followRuns'),
          keywords: 'run state column ready deploy failed waiting',
        },
        {
          id: 'agent-updates',
          title: ctx.t('settings.agentUpdatesCard'),
          keywords: 'agent self report column move prompt',
        },
        {
          id: 'notify-moves',
          title: ctx.t('settings.notifyOnRuleMove'),
          keywords: 'notify rule move',
        },
        {
          id: 'columns',
          title: ctx.t('settings.columns'),
          keywords: 'rename color reorder delete add',
        },
        {
          id: 'rules',
          title: ctx.t('settings.rules'),
          keywords: 'trigger condition action priority preview dry run',
        },
        {
          id: 'data',
          title: ctx.t('settings.data'),
          keywords: 'export import reset json sort sessions state',
        },
      ];
    },
    render: () => <KanbanSettings ctx={ctx} />,
  });
}

function KanbanSettings(props: { ctx: UiContext }) {
  const ctx = props.ctx;
  const [document, setDocument] = createSignal<BoardDocument>();
  const [error, setError] = createSignal<string>();
  const [moves, setMoves] = createSignal<PreviewMove[]>();

  const client = () => kanbanClient(ctx);

  async function refresh(): Promise<void> {
    try {
      setDocument((await client().snapshot({})) as BoardDocument);
      setError(undefined);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await operation();
      await refresh();
      return result;
    } catch (cause) {
      setError(messageOf(cause));
      return undefined;
    }
  }

  onMount(() => {
    void refresh();
    const stop = client().events.on('changed', () => void refresh());
    onCleanup(stop);
  });

  function setSetting<Key extends keyof BoardSettings>(key: Key, value: BoardSettings[Key]): void {
    void run(() => client()['settings.update']({ patch: { [key]: value } }));
  }

  function setDefaultColumn(id: string): void {
    void run(() => client()['columns.default']({ id }));
  }

  function columnTitle(id: string): string {
    return document()?.columns.find((column) => column.id === id)?.title ?? id;
  }

  function sessionTitle(sessionKey: string): string {
    const id = sessionIDOfKey(sessionKey);
    const info = serverOf(ctx)
      ?.data.session.list()
      .find((session) => session.id === id);
    return info?.title?.trim() || id;
  }

  const api: SettingsApi = {
    ctx,
    document,
    moves,
    setMoves,
    run,
    refresh,
    setError,
    setSetting,
    setDefaultColumn,
    columnTitle,
    sessionTitle,
  };

  return (
    <ctx.ui.SettingsLayout
      title={ctx.t('settings.title')}
      description={ctx.t('settings.description')}
    >
      <Show
        when={document()}
        fallback={
          <div class="sk-settings__loading">
            <ctx.ui.Loader />
          </div>
        }
      >
        <div class="sk-settings">
          <DefaultsSection api={api} />
          <ColumnsSection api={api} />
          <RulesSection api={api} />
          <DataSection api={api} />
        </div>
      </Show>

      <Show when={error()}>
        {(message) => (
          <p class="sk-detail" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </ctx.ui.SettingsLayout>
  );
}
