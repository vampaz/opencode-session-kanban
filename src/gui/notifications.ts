import { SESSION_SERVER, sessionIDOfKey } from '../core/session-ref';
import { kanbanClient, type UiContext } from './client';
import { createSeenTracker } from './dedupe';

/** Shows rule notifications from the server: a toast, and a system notification when unfocused. */
export function addNotifications(ctx: UiContext): () => void {
  const seen = createSeenTracker();

  return kanbanClient(ctx).events.on('notify', (event) => {
    const data = event.data as {
      readonly id?: unknown;
      readonly title?: unknown;
      readonly message?: unknown;
      readonly variant?: unknown;
      readonly sessionKey?: unknown;
    };

    const id = typeof data.id === 'string' ? data.id : undefined;
    if (!id || seen.has(id)) return;
    seen.add(id);

    const title = typeof data.title === 'string' ? data.title : ctx.t('notify.rule');
    const message = typeof data.message === 'string' ? data.message : undefined;
    const variant = data.variant === 'error' ? 'error' : 'default';

    ctx.toast.show({ title, ...(message ? { description: message } : {}), variant });

    if (!document.hasFocus()) {
      const sessionID =
        typeof data.sessionKey === 'string' ? sessionIDOfKey(data.sessionKey) : undefined;

      void ctx.attention.notify({
        id,
        title,
        ...(message ? { message } : {}),
        variant,
        ...(sessionID ? { session: { server: SESSION_SERVER, id: sessionID } } : {}),
      });
    }
  });
}
