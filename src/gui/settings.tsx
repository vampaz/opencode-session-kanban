import { For, Index, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { SettingsPage, type DialogHandle, type UiMenuEntry } from '@opencode/plugin/gui';

import { defaultBoard, type BoardDocument, type BoardSettings, type Column } from '../core/board';
import { DEFAULT_START_PROMPT } from '../core/start';
import type { SortCount } from '../core/sort';
import type { PreviewMove, Rule } from '../core/rules';
import { kanbanClient, type UiContext } from './client';
import { openRuleEditor } from './rule-editor';
import { serverOf } from './sessions';
import { commitText } from './text-field';

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
  const [newColumn, setNewColumn] = createSignal('');

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

  function updateColumn(column: Column, patch: Partial<Column>): void {
    void run(() => client()['columns.upsert']({ column: { ...column, ...patch } }));
  }

  function columnIDs(): string[] {
    return (document()?.columns ?? []).map((column) => column.id);
  }

  function moveColumn(column: Column, delta: number): void {
    const ids = columnIDs();
    const index = ids.indexOf(column.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(() => client()['columns.reorder']({ ids }));
  }

  async function deleteColumn(column: Column): Promise<void> {
    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t('settings.deleteColumnTitle', { title: column.title }),
      description: ctx.t('settings.deleteColumnDescription'),
      confirm: ctx.t('settings.delete'),
      danger: true,
    });
    if (!confirmed) return;

    await run(() => client()['columns.remove']({ id: column.id }));
  }

  function addColumn(): void {
    const title = newColumn().trim();
    const doc = document();
    if (!title || !doc) return;

    const base = slug(title);
    let id = base;
    let suffix = 2;
    while (doc.columns.some((column) => column.id === id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    const column: Column = {
      id,
      title,
      order: doc.columns.length,
      color: null,
      startAgent: false,
      startPrompt: null,
    };

    void run(() => client()['columns.upsert']({ column })).then(() => setNewColumn(''));
  }

  function sortedRules(): Rule[] {
    return [...(document()?.rules ?? [])].sort((left, right) => left.priority - right.priority);
  }

  function saveRule(rule: Rule): void {
    void run(() => client()['rules.upsert']({ rule }));
  }

  function editRule(rule?: Rule): void {
    const doc = document();
    if (!doc) return;
    openRuleEditor(ctx, { board: doc, ...(rule ? { rule } : {}), save: saveRule });
  }

  function toggleRule(rule: Rule, enabled: boolean): void {
    void run(() => client()['rules.upsert']({ rule: { ...rule, enabled } }));
  }

  function moveRule(rule: Rule, delta: number): void {
    const ids = sortedRules().map((candidate) => candidate.id);
    const index = ids.indexOf(rule.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(() => client()['rules.reorder']({ ids }));
  }

  async function deleteRule(rule: Rule): Promise<void> {
    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t('settings.deleteRuleTitle', { title: rule.name }),
      description: ctx.t('settings.deleteRuleDescription'),
      confirm: ctx.t('settings.delete'),
      danger: true,
    });
    if (!confirmed) return;

    await run(() => client()['rules.remove']({ id: rule.id }));
    setMoves(undefined);
  }

  async function dryRun(): Promise<void> {
    try {
      const result = (await client()['rules.preview']({})) as { moves: PreviewMove[] };
      setMoves(result.moves);
      setError(undefined);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  function columnTitle(id: string): string {
    return document()?.columns.find((column) => column.id === id)?.title ?? id;
  }

  function sessionTitle(sessionKey: string): string {
    const id = sessionKey.slice(sessionKey.indexOf('\n') + 1);
    const info = serverOf(ctx)
      ?.data.session.list()
      .find((session) => session.id === id);
    return info?.title?.trim() || id;
  }

  /** Preview the one-time sort, then place the cards only after a confirmation. */
  async function sortSessions(): Promise<void> {
    try {
      const preview = (await client()['sort.preview']({})) as {
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

      const result = (await client()['sort.apply']({})) as { placed: number };
      await refresh();
      ctx.toast.show({ title: ctx.t('settings.sortDone', { count: String(result.placed) }) });
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  function projectItems(): UiMenuEntry[] {
    return (document()?.columns ?? []).map((column) => ({
      label: column.title,
      onSelect: () => setDefaultColumn(column.id),
    }));
  }

  function archivedItems(): UiMenuEntry[] {
    return [
      { label: ctx.t('settings.archivedHide'), onSelect: () => setSetting('archived', 'hide') },
      {
        label: ctx.t('settings.archivedColumn'),
        onSelect: () => setSetting('archived', 'column'),
      },
    ];
  }

  async function copyJSON(): Promise<void> {
    const doc = document();
    if (!doc) return;
    await ctx.system.copy(JSON.stringify(doc, null, 2));
    ctx.toast.show({ title: ctx.t('settings.copied') });
  }

  async function saveJSON(): Promise<void> {
    const doc = document();
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
          await run(() => client()['board.replace']({ document: value }));
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

    await run(() => client()['board.replace']({ document: defaultBoard() }));
    setMoves(undefined);
  }

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
        {(doc) => (
          <div class="sk-settings">
            <ctx.ui.SettingsSection title={ctx.t('settings.board')}>
              <ctx.ui.SettingsRow
                id="default-column"
                title={ctx.t('settings.defaultColumn')}
                description={ctx.t('settings.defaultColumnHint')}
              >
                <ctx.ui.Menu
                  trigger="button"
                  icon="layout-left"
                  label={columnTitle(doc().defaultColumn)}
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
                    doc().settings.archived === 'hide'
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
                  value={String(doc().settings.idleMinutes)}
                  onSave={(value) => setSetting('idleMinutes', Math.max(0, Number(value) || 0))}
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
                  checked={doc().settings.notifyOnRuleMove}
                  onChange={(checked) => setSetting('notifyOnRuleMove', checked)}
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
                  checked={doc().settings.agentUpdatesCard}
                  onChange={(checked) => setSetting('agentUpdatesCard', checked)}
                />
              </ctx.ui.SettingsRow>
            </ctx.ui.SettingsSection>

            <ctx.ui.SettingsSection title={ctx.t('settings.columns')}>
              <Index each={doc().columns}>
                {(column) => (
                  <ColumnRow
                    ctx={ctx}
                    column={column()}
                    first={doc().columns[0]?.id === column().id}
                    last={doc().columns[doc().columns.length - 1]?.id === column().id}
                    onChange={(patch) => updateColumn(column(), patch)}
                    onMove={(delta) => moveColumn(column(), delta)}
                    onDelete={() => void deleteColumn(column())}
                  />
                )}
              </Index>
              <ctx.ui.SettingsRow title={ctx.t('settings.addColumn')}>
                <div class="sk-settings__add">
                  <ctx.ui.TextInput
                    label={ctx.t('settings.addColumn')}
                    placeholder={ctx.t('settings.columnNameHint')}
                    value={newColumn()}
                    onInput={setNewColumn}
                    onSubmit={addColumn}
                  />
                  <ctx.ui.Button icon="plus" onClick={addColumn} disabled={!newColumn().trim()}>
                    {ctx.t('settings.add')}
                  </ctx.ui.Button>
                </div>
              </ctx.ui.SettingsRow>
            </ctx.ui.SettingsSection>

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
                      <div class="sk-settings__name">
                        {rule.name || ctx.t('settings.untitledRule')}
                      </div>
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
                  <Show when={moves()}>
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
                                  session: sessionTitle(move.sessionKey),
                                  column: columnTitle(move.to),
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
              <ctx.ui.SettingsRow
                title={ctx.t('settings.reset')}
                description={ctx.t('settings.resetHint')}
              >
                <ctx.ui.Button variant="danger" onClick={() => void resetBoard()}>
                  {ctx.t('settings.reset')}
                </ctx.ui.Button>
              </ctx.ui.SettingsRow>
            </ctx.ui.SettingsSection>
          </div>
        )}
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

function ColumnRow(props: {
  ctx: UiContext;
  column: Column;
  first: boolean;
  last: boolean;
  onChange(patch: Partial<Column>): void;
  onMove(delta: number): void;
  onDelete(): void;
}) {
  const ctx = props.ctx;

  return (
    <div class="sk-settings__column">
      <div class="sk-settings__column-main">
        <input
          class="sk-color"
          type="color"
          aria-label={ctx.t('settings.color')}
          value={props.column.color ?? '#7ba797'}
          onChange={(event) => props.onChange({ color: event.currentTarget.value })}
        />
        <SavedTextInput
          ctx={ctx}
          class="sk-settings__grow"
          label={ctx.t('settings.columnName')}
          value={props.column.title}
          onSave={(title) => props.onChange({ title })}
        />
        <ctx.ui.IconButton
          icon="arrow-up"
          label={ctx.t('settings.moveUp')}
          disabled={props.first}
          onClick={() => props.onMove(-1)}
        />
        <ctx.ui.IconButton
          icon="arrow-down-to-line"
          label={ctx.t('settings.moveDown')}
          disabled={props.last}
          onClick={() => props.onMove(1)}
        />
        <ctx.ui.IconButton
          icon="trash"
          label={ctx.t('settings.deleteColumn')}
          onClick={props.onDelete}
        />
      </div>
      <div class="sk-settings__column-start">
        <ctx.ui.Switch
          label={ctx.t('settings.startAgent')}
          checked={props.column.startAgent}
          onChange={(checked) => props.onChange({ startAgent: checked })}
        />
        <SavedTextInput
          ctx={ctx}
          class="sk-settings__grow"
          label={ctx.t('settings.startPrompt')}
          placeholder={DEFAULT_START_PROMPT}
          value={props.column.startPrompt ?? ''}
          allowEmpty
          onSave={(value) => props.onChange({ startPrompt: value === '' ? null : value })}
        />
      </div>
    </div>
  );
}

/**
 * A text field that saves its value on Enter and when focus leaves it. A snapshot refresh replaces
 * the `value` prop on every change, so the field keeps its draft while the user edits it instead of
 * overwriting what they typed.
 */
function SavedTextInput(props: {
  ctx: UiContext;
  class?: string;
  label: string;
  placeholder?: string;
  value: string;
  /** Save an empty value instead of reverting, for a field that can be cleared. */
  allowEmpty?: boolean;
  onSave(value: string): void;
}) {
  const [draft, setDraft] = createSignal(props.value);
  const [editing, setEditing] = createSignal(false);
  const ctx = props.ctx;
  let saved = props.value;
  let seen = props.value;

  createEffect(() => {
    const stored = props.value;
    if (stored === seen) return;
    seen = stored;
    saved = stored;
    if (!editing()) setDraft(stored);
  });

  function commit(): void {
    const decision = commitText(draft(), saved, { allowEmpty: props.allowEmpty === true });
    if (decision.kind === 'save') {
      saved = decision.value;
      setDraft(decision.value);
      props.onSave(decision.value);
      return;
    }
    if (decision.kind === 'revert') setDraft(saved);
  }

  return (
    <div
      class={props.class}
      onFocusIn={() => setEditing(true)}
      onFocusOut={() => {
        setEditing(false);
        commit();
      }}
      on:keydown={(event: KeyboardEvent) => {
        if (event.key !== 'Escape' || !editing()) return;
        event.preventDefault();
        event.stopPropagation();
        setDraft(saved);
        setEditing(false);
        if (event.target instanceof HTMLElement) event.target.blur();
      }}
    >
      <ctx.ui.TextInput
        label={props.label}
        placeholder={props.placeholder}
        value={draft()}
        onInput={setDraft}
        onSubmit={commit}
      />
    </div>
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

function slug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || 'column';
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
