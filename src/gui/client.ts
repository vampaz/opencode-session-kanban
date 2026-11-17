import type { SetupContext } from '@opencode/plugin/gui';

import { Kanban } from '../rpc';
import type { definition } from './definition';

export type UiContext = SetupContext<typeof definition>;

/** The GUI's RPC client. The window reconnects on its own; a reconnected window re-requests `snapshot`. */
export function kanbanClient(ctx: UiContext) {
  return ctx.client.rpc(Kanban);
}
