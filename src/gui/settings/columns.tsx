import { Index, createSignal } from 'solid-js';

import type { Column } from '../../core/board';
import { DEFAULT_START_PROMPT } from '../../core/start';
import { kanbanClient, type UiContext } from '../client';
import { SavedTextInput } from './field';
import type { SettingsApi } from './shared';

export function ColumnsSection(props: { api: SettingsApi }) {
  const api = props.api;
  const ctx = api.ctx;
  const [newColumn, setNewColumn] = createSignal('');

  const columns = () => api.document()?.columns ?? [];

  function updateColumn(column: Column, patch: Partial<Column>): void {
    void api.run(() => kanbanClient(ctx)['columns.upsert']({ column: { ...column, ...patch } }));
  }

  function moveColumn(column: Column, delta: number): void {
    const ids = columns().map((candidate) => candidate.id);
    const index = ids.indexOf(column.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void api.run(() => kanbanClient(ctx)['columns.reorder']({ ids }));
  }

  async function deleteColumn(column: Column): Promise<void> {
    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t('settings.deleteColumnTitle', { title: column.title }),
      description: ctx.t('settings.deleteColumnDescription'),
      confirm: ctx.t('settings.delete'),
      danger: true,
    });
    if (!confirmed) return;

    await api.run(() => kanbanClient(ctx)['columns.remove']({ id: column.id }));
  }

  function addColumn(): void {
    const title = newColumn().trim();
    const doc = api.document();
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

    void api
      .run(() => kanbanClient(ctx)['columns.upsert']({ column }))
      .then(() => setNewColumn(''));
  }

  return (
    <ctx.ui.SettingsSection title={ctx.t('settings.columns')}>
      <Index each={columns()}>
        {(column) => (
          <ColumnRow
            ctx={ctx}
            column={column()}
            first={columns()[0]?.id === column().id}
            last={columns()[columns().length - 1]?.id === column().id}
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

function slug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || 'column';
}
