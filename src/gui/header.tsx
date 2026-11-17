import { Show, createMemo } from 'solid-js';
import { Slot } from '@opencode/plugin/gui';

import type { UiContext } from './client';
import { openBoard } from './command';
import { countsOf, serverOf } from './sessions';

/** `running · waiting` in the session header, opening the board. */
export function addHeaderSlot(ctx: UiContext): void {
  ctx.add(Slot, {
    at: 'session.header',
    order: 10,
    render: (input) => <HeaderChip ctx={ctx} compact={input.compact} />,
  });
}

function HeaderChip(props: { ctx: UiContext; compact: boolean }) {
  const ctx = props.ctx;

  const counts = createMemo(() => countsOf(serverOf(ctx)));

  const summary = () =>
    ctx.t('header.summary', { running: counts().running, waiting: counts().waiting });
  const open = () => openBoard(ctx);

  return (
    <ctx.ui.Tooltip value={summary()}>
      <Show
        when={!props.compact}
        fallback={<ctx.ui.IconButton icon="dot-grid" label={summary()} onClick={open} />}
      >
        <ctx.ui.Button variant="ghost" size="small" icon="dot-grid" onClick={open}>
          <span class="sk-sr-only">{summary()}</span>
          <span
            class="sk-chip"
            aria-hidden="true"
          >{`${counts().running} · ${counts().waiting}`}</span>
        </ctx.ui.Button>
      </Show>
    </ctx.ui.Tooltip>
  );
}
