import { Show, createSignal } from 'solid-js';
import type { DialogHandle, UiMenuEntry } from '@opencode/plugin/gui';

import { projectLabel } from '../core/status';
import { kanbanClient, type UiContext } from './client';
import { serverOf } from './sessions';

/** A small form that creates a session in a chosen directory and places it in a column. */
export function openNewSession(
  ctx: UiContext,
  options: {
    readonly columnId: string;
    readonly directory?: string | undefined;
  },
): void {
  ctx.dialogs.open((dialog) => (
    <NewSessionDialog
      ctx={ctx}
      dialog={dialog}
      columnId={options.columnId}
      directory={options.directory}
    />
  ));
}

function NewSessionDialog(props: {
  ctx: UiContext;
  dialog: DialogHandle;
  columnId: string;
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

    return list;
  }

  const [directory, setDirectory] = createSignal(props.directory ?? '');
  const [title, setTitle] = createSignal('');
  const [task, setTask] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();

  function projectItems(): UiMenuEntry[] {
    return choices().map((choice) => ({
      label: choice.label,
      onSelect: () => setDirectory(choice.directory),
    }));
  }

  async function create(): Promise<void> {
    const current = server();
    const target = directory().trim();
    if (!current || !target || busy()) return;

    setBusy(true);
    setError(undefined);
    try {
      // The server owns the start-or-queue rule, so the dialog only supplies the task.
      const result = (await kanbanClient(ctx)['session.create']({
        directory: target,
        columnId: props.columnId,
        ...(title().trim() ? { title: title().trim() } : {}),
        ...(task().trim() ? { task: task().trim() } : {}),
      })) as { sessionID: string; started: boolean; queued: boolean };

      const info = await current.client.session
        .get({ sessionID: result.sessionID })
        .catch(() => undefined);
      if (info) current.data.session.remember(info);

      ctx.tabs.open({ server: current.id, id: result.sessionID }, { focus: true });
      if (result.queued) ctx.toast.show({ title: ctx.t('newSession.queued') });
      else if (result.started) ctx.toast.show({ title: ctx.t('newSession.started') });
      props.dialog.close();
    } catch (cause) {
      console.error('[kanban] could not create the session', cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ctx.ui.Dialog
      title={ctx.t('newSession.title')}
      description={ctx.t('newSession.description')}
      footer={
        <>
          <ctx.ui.Button variant="ghost" onClick={() => props.dialog.close()}>
            {ctx.t('newSession.cancel')}
          </ctx.ui.Button>
          <ctx.ui.Button
            variant="contrast"
            busy={busy()}
            disabled={!directory().trim()}
            onClick={() => void create()}
          >
            {ctx.t('newSession.create')}
          </ctx.ui.Button>
        </>
      }
    >
      <div class="sk-form">
        <div class="sk-form__row">
          <ctx.ui.TextInput
            label={ctx.t('newSession.directory')}
            placeholder={ctx.t('newSession.directoryHint')}
            value={directory()}
            onInput={setDirectory}
            onSubmit={() => void create()}
          />
          <ctx.ui.Menu
            trigger="button"
            icon="folder"
            label={ctx.t('newSession.projects')}
            items={projectItems()}
            disabled={choices().length === 0}
          />
        </div>
        <ctx.ui.TextInput
          label={ctx.t('newSession.name')}
          placeholder={ctx.t('newSession.nameHint')}
          value={title()}
          onInput={setTitle}
          onSubmit={() => void create()}
        />
        <ctx.ui.TextInput
          label={ctx.t('newSession.task')}
          placeholder={ctx.t('newSession.taskHint')}
          value={task()}
          onInput={setTask}
          onSubmit={() => void create()}
        />
        <Show when={error()}>{(message) => <p class="sk-detail">{message()}</p>}</Show>
      </div>
    </ctx.ui.Dialog>
  );
}
