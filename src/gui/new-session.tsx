import { Match, Show, Switch, createSignal } from 'solid-js';
import type { DialogHandle } from '@opencode/plugin/gui';

import type { Column } from '../core/board';
import { startColumn, ticketText } from '../core/start';
import { projectLabel } from '../core/status';
import { kanbanClient, type UiContext } from './client';
import { serverOf } from './sessions';

/** The Select value that switches the project to a typed folder path. */
const OTHER_FOLDER = 'other';

/** Where the session runs: no choice yet, a known project, or a typed path. */
type ProjectChoice =
  | { readonly kind: 'unset' }
  | { readonly kind: 'known'; readonly directory: string }
  | { readonly kind: 'other'; readonly path: string };

/** The form edits until a create button, then waits for the server; a failure returns to editing. */
type Phase =
  | { readonly kind: 'editing'; readonly error?: string }
  | { readonly kind: 'creating'; readonly start: boolean };

/** A ticket form: a session in a chosen project, placed in a column, started now or kept for later. */
export function openNewSession(
  ctx: UiContext,
  options: {
    readonly column: Column;
    readonly columns: readonly Column[];
    readonly directory?: string | undefined;
  },
): void {
  ctx.dialogs.open((dialog) => (
    <NewSessionDialog
      ctx={ctx}
      dialog={dialog}
      column={options.column}
      columns={options.columns}
      directory={options.directory}
    />
  ));
}

function NewSessionDialog(props: {
  ctx: UiContext;
  dialog: DialogHandle;
  column: Column;
  columns: readonly Column[];
  directory?: string | undefined;
}) {
  const ctx = props.ctx;
  const server = () => serverOf(ctx);

  function choices(): { directory: string; label: string }[] {
    const current = server();
    const list = (current?.data.project.list() ?? []).map((project) => ({
      directory: project.canonical,
      label: project.name?.trim() || projectLabel(project.canonical),
    }));

    if (props.directory && !list.some((choice) => choice.directory === props.directory)) {
      list.unshift({ directory: props.directory, label: projectLabel(props.directory) });
    }

    // Projects can share a name, so a repeated name also shows its folder.
    // A Select needs unique values, so a directory listed twice keeps its first entry.
    const unique = list.filter(
      (choice, index) => list.findIndex((other) => other.directory === choice.directory) === index,
    );
    const counts = new Map<string, number>();
    for (const choice of unique) counts.set(choice.label, (counts.get(choice.label) ?? 0) + 1);
    return unique.map((choice) =>
      (counts.get(choice.label) ?? 0) > 1
        ? { ...choice, label: `${choice.label} · ${choice.directory}` }
        : choice,
    );
  }

  function initialProject(): ProjectChoice {
    if (props.directory) return { kind: 'known', directory: props.directory };
    return choices().length > 0 ? { kind: 'unset' } : { kind: 'other', path: '' };
  }

  const [project, setProject] = createSignal<ProjectChoice>(initialProject());
  const [title, setTitle] = createSignal('');
  const [task, setTask] = createSignal('');
  const [phase, setPhase] = createSignal<Phase>({ kind: 'editing' });
  const typingPath = project().kind === 'other';

  const target = () => startColumn(props.columns, props.column);
  const hasText = () => ticketText(title(), task()) !== '';
  const creating = (start: boolean) => {
    const current = phase();
    return current.kind === 'creating' && current.start === start;
  };

  function directory(): string {
    const current = project();
    if (current.kind === 'known') return current.directory;
    if (current.kind === 'other') return current.path.trim();
    return '';
  }

  function projectValue(): string | undefined {
    const current = project();
    if (current.kind === 'known') return current.directory;
    if (current.kind === 'other') return OTHER_FOLDER;
    return undefined;
  }

  function pickProject(value: string): void {
    setProject(
      value === OTHER_FOLDER ? { kind: 'other', path: '' } : { kind: 'known', directory: value },
    );
  }

  /** What each button does here, so the choice between them is plain before a click. */
  function outcome(): string {
    const keep = ctx.t('newSession.keeps', { column: props.column.title });
    if (!hasText()) return `${keep} ${ctx.t('newSession.startNeedsText')}`;
    const start =
      target().id === props.column.id
        ? ctx.t('newSession.startsHere')
        : ctx.t('newSession.starts', { column: target().title });
    return `${keep} ${start}`;
  }

  function errorMessage(): string | undefined {
    const current = phase();
    return current.kind === 'editing' ? current.error : undefined;
  }

  function columnTitle(id: string): string {
    return props.columns.find((column) => column.id === id)?.title ?? id;
  }

  async function create(start: boolean): Promise<void> {
    const current = server();
    const path = directory();
    if (!current || !path || phase().kind === 'creating') return;
    if (start && !hasText()) return;

    setPhase({ kind: 'creating', start });
    try {
      // The server owns the start-or-queue rule and the move, so the dialog only states the choice.
      const result = (await kanbanClient(ctx)['session.create']({
        directory: path,
        columnId: props.column.id,
        start,
        ...(title().trim() ? { title: title().trim() } : {}),
        ...(task().trim() ? { task: task().trim() } : {}),
      })) as { sessionID: string; columnId: string; started: boolean; queued: boolean };

      const info = await current.client.session
        .get({ sessionID: result.sessionID })
        .catch(() => undefined);
      if (info) current.data.session.remember(info);

      // The board stays in view; the toast opens the session for whoever wants it now.
      const column = columnTitle(result.columnId);
      const actions = [
        {
          label: ctx.t('newSession.open'),
          run: () => ctx.tabs.open({ server: current.id, id: result.sessionID }, { focus: true }),
        },
      ];
      if (result.started) {
        ctx.toast.show({
          title: ctx.t('newSession.started'),
          description: ctx.t('newSession.startedDetail', { column }),
          variant: 'success',
          actions,
        });
      } else if (start) {
        ctx.toast.show({
          title: ctx.t('newSession.startFailed'),
          description: ctx.t('newSession.startFailedDetail', { column }),
          variant: 'error',
          actions,
        });
      } else {
        ctx.toast.show({ title: ctx.t('newSession.saved', { column }), actions });
      }
      props.dialog.close();
    } catch (cause) {
      console.error('[kanban] could not create the session', cause);
      setPhase({ kind: 'editing', error: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  /**
   * Cmd+Enter (Ctrl+Enter) anywhere in the form creates and starts; Enter in a field only creates.
   * It runs in the capture phase, so a field's own Enter handler never sees the shortcut.
   */
  function startOnShortcut(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    void create(true);
  }

  return (
    <ctx.ui.Dialog
      title={ctx.t('newSession.title', { column: props.column.title })}
      description={ctx.t('newSession.description')}
      size="large"
      footer={
        <>
          <ctx.ui.Button variant="ghost" onClick={() => props.dialog.close()}>
            {ctx.t('newSession.cancel')}
          </ctx.ui.Button>
          <ctx.ui.Button
            busy={creating(false)}
            disabled={!directory() || creating(true)}
            onClick={() => void create(false)}
          >
            {ctx.t('newSession.create')}
          </ctx.ui.Button>
          <ctx.ui.Button
            variant="contrast"
            busy={creating(true)}
            disabled={!directory() || !hasText() || creating(false)}
            onClick={() => void create(true)}
          >
            {ctx.t('newSession.createAndStart')}
          </ctx.ui.Button>
        </>
      }
    >
      <div
        class="sk-form"
        ref={(element) => element.addEventListener('keydown', startOnShortcut, true)}
      >
        <div class="sk-field">
          <span class="sk-field__label" aria-hidden="true">
            {ctx.t('newSession.project')}
          </span>
          <Show when={choices().length > 0}>
            <ctx.ui.Select
              label={ctx.t('newSession.project')}
              placeholder={ctx.t('newSession.projectHint')}
              placement="bottom-start"
              options={[
                ...choices().map((choice) => ({ value: choice.directory, label: choice.label })),
                { value: OTHER_FOLDER, label: ctx.t('newSession.otherFolder') },
              ]}
              value={projectValue()}
              onChange={pickProject}
              class="sk-field__control"
            />
          </Show>
          <Switch>
            <Match when={project().kind === 'known' && directory()}>
              {(path) => <span class="sk-field__hint">{path()}</span>}
            </Match>
            <Match when={project().kind === 'other'}>
              <ctx.ui.TextInput
                label={ctx.t('newSession.directory')}
                placeholder={ctx.t('newSession.directoryHint')}
                size="large"
                class="sk-field__control"
                autofocus={typingPath}
                value={directory()}
                onInput={(path) => setProject({ kind: 'other', path })}
                onSubmit={() => void create(false)}
              />
            </Match>
          </Switch>
        </div>
        <div class="sk-field">
          <span class="sk-field__label" aria-hidden="true">
            {ctx.t('newSession.name')}
            <span class="sk-field__optional">{ctx.t('newSession.optional')}</span>
          </span>
          <ctx.ui.TextInput
            label={ctx.t('newSession.name')}
            placeholder={ctx.t('newSession.nameHint')}
            size="large"
            class="sk-field__control"
            autofocus={!typingPath}
            value={title()}
            onInput={setTitle}
            onSubmit={() => void create(false)}
          />
        </div>
        <div class="sk-field">
          <span class="sk-field__label" aria-hidden="true">
            {ctx.t('newSession.task')}
            <span class="sk-field__optional">{ctx.t('newSession.optional')}</span>
          </span>
          <textarea
            class="sk-textarea sk-textarea--task"
            aria-label={ctx.t('newSession.task')}
            placeholder={ctx.t('newSession.taskHint')}
            rows={4}
            value={task()}
            onInput={(event) => setTask(event.currentTarget.value)}
          />
        </div>
        <p class="sk-field__hint" aria-live="polite">
          {outcome()}
        </p>
        <Show when={errorMessage()}>
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
