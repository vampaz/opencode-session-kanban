import { Show, createSignal } from 'solid-js';
import type { DialogHandle } from '@opencode/plugin/gui';

import { defaultBoard } from '../../core/board';
import type { SortCount } from '../../core/sort';
import type { UiContext } from '../client';
import { kanbanClient } from '../client';
import { messageOf, type SettingsApi } from './shared';

export function DataSection(props: { api: SettingsApi }) {
  const api = props.api;
  const ctx = api.ctx;

  function columnTitle(id: string): string {
    return api.columnTitle(id);
  }

  /** Preview the one-time sort, then place the cards only after a confirmation. */
  async function sortSessions(): Promise<void> {
    try {
      const preview = (await kanbanClient(ctx)['sort.preview']({})) as {
        moves: readonly { columnId: string }[];
        counts: readonly SortCount[];
      };
      if (preview.moves.length === 0) {
        ctx.toast.show({ title: ctx.t('settings.sortEmpty') });
        return;
      }

      const counts = preview.counts
        .map((count) =>
          ctx.t('settings.sortCount', {
            column: columnTitle(count.columnId),
            count: String(count.count),
          }),
        )
        .join(' · ');
      const confirmed = await ctx.dialogs.confirm({
        title: ctx.t('settings.sortTitle'),
        description: ctx.t('settings.sortDescription', {
          count: String(preview.moves.length),
          counts,
        }),
        confirm: ctx.t('settings.sortConfirm'),
      });
      if (!confirmed) return;

      const result = (await kanbanClient(ctx)['sort.apply']({})) as { placed: number };
      await api.refresh();
      ctx.toast.show({ title: ctx.t('settings.sortDone', { count: String(result.placed) }) });
    } catch (cause) {
      api.setError(messageOf(cause));
    }
  }

  async function copyJSON(): Promise<void> {
    const doc = api.document();
    if (!doc) return;
    await ctx.system.copy(JSON.stringify(doc, null, 2));
    ctx.toast.show({ title: ctx.t('settings.copied') });
  }

  async function saveJSON(): Promise<void> {
    const doc = api.document();
    if (!doc) return;
    const saved = await ctx.system.save({
      name: 'kanban-board.json',
      content: JSON.stringify(doc, null, 2),
    });
    if (saved) ctx.toast.show({ title: ctx.t('settings.saved') });
  }

  function importJSON(): void {
    ctx.dialogs.open((dialog) => (
      <ImportDialog
        ctx={ctx}
        dialog={dialog}
        apply={async (value) => {
          await api.run(() => kanbanClient(ctx)['board.replace']({ document: value }));
        }}
      />
    ));
  }

  async function resetBoard(): Promise<void> {
    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t('settings.resetTitle'),
      description: ctx.t('settings.resetDescription'),
      confirm: ctx.t('settings.reset'),
      danger: true,
    });
    if (!confirmed) return;

    await api.run(() => kanbanClient(ctx)['board.replace']({ document: defaultBoard() }));
    api.setMoves(undefined);
  }

  return (
    <ctx.ui.SettingsSection title={ctx.t('settings.data')}>
      <ctx.ui.SettingsRow
        id="data"
        title={ctx.t('settings.export')}
        description={ctx.t('settings.exportHint')}
      >
        <div class="sk-settings__add">
          <ctx.ui.Button onClick={() => void copyJSON()}>
            {ctx.t('settings.copyJSON')}
          </ctx.ui.Button>
          <ctx.ui.Button onClick={() => void saveJSON()}>
            {ctx.t('settings.saveFile')}
          </ctx.ui.Button>
        </div>
      </ctx.ui.SettingsRow>
      <ctx.ui.SettingsRow
        title={ctx.t('settings.import')}
        description={ctx.t('settings.importHint')}
      >
        <ctx.ui.Button onClick={importJSON}>{ctx.t('settings.import')}</ctx.ui.Button>
      </ctx.ui.SettingsRow>
      <ctx.ui.SettingsRow
        id="sort"
        title={ctx.t('settings.sort')}
        description={ctx.t('settings.sortHint')}
      >
        <ctx.ui.Button icon="status" onClick={() => void sortSessions()}>
          {ctx.t('settings.sortAction')}
        </ctx.ui.Button>
      </ctx.ui.SettingsRow>
      <ctx.ui.SettingsRow title={ctx.t('settings.reset')} description={ctx.t('settings.resetHint')}>
        <ctx.ui.Button variant="danger" onClick={() => void resetBoard()}>
          {ctx.t('settings.reset')}
        </ctx.ui.Button>
      </ctx.ui.SettingsRow>
    </ctx.ui.SettingsSection>
  );
}

function ImportDialog(props: {
  ctx: UiContext;
  dialog: DialogHandle;
  apply(value: unknown): Promise<void>;
}) {
  const ctx = props.ctx;
  const [text, setText] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  async function apply(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const parsed = JSON.parse(text()) as unknown;
      await props.apply(parsed);
      props.dialog.close();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ctx.ui.Dialog
      title={ctx.t('import.title')}
      description={ctx.t('import.description')}
      size="x-large"
      footer={
        <>
          <ctx.ui.Button variant="ghost" onClick={() => props.dialog.close()}>
            {ctx.t('import.cancel')}
          </ctx.ui.Button>
          <ctx.ui.Button variant="contrast" busy={busy()} onClick={() => void apply()}>
            {ctx.t('import.apply')}
          </ctx.ui.Button>
        </>
      }
    >
      <div class="sk-form">
        <textarea
          class="sk-textarea"
          aria-label={ctx.t('import.hint')}
          placeholder={ctx.t('import.hint')}
          value={text()}
          onInput={(event) => setText(event.currentTarget.value)}
        />
        <Show when={error()}>
          {(message) => (
            <p class="sk-detail" role="alert">
              {message()}
            </p>
          )}
        </Show>
      </div>
    </ctx.ui.Dialog>
  );
}
