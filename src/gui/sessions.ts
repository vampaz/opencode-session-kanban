import type { ServerRef } from '@opencode/plugin/gui';

import { selectCards, type SessionFacts } from '../core/status';
import type { UiContext } from './client';

/** The session fields the board and the header chip read. `Session.Info` satisfies this shape. */
export type SessionRow = {
  readonly id: string;
  readonly parentID?: string | undefined;
  readonly fork?: unknown;
  readonly title?: string | undefined;
  readonly subpath?: string | undefined;
  readonly agent?: string | undefined;
  readonly model?: { readonly id: string } | undefined;
  readonly cost: number;
  readonly outcome?: 'succeeded' | 'failed' | 'interrupted' | undefined;
  readonly time: { readonly updated: number; readonly archived?: number | undefined };
  readonly location: { readonly directory: string };
};

export function serverOf(ctx: UiContext): ServerRef | undefined {
  return ctx.servers.get('sidecar');
}

export function rowsOf(server: ServerRef | undefined): readonly SessionRow[] {
  return server?.data.session.list() ?? [];
}

export function factsOf(rows: readonly SessionRow[]): SessionFacts[] {
  return rows.map((row) => ({
    id: row.id,
    parentID: row.parentID,
    fork: row.fork,
    archived: row.time.archived !== undefined,
    outcome: row.outcome,
    updated: row.time.updated,
  }));
}

/** Sessions the window sees running, and those waiting on a permission or a form. */
export function activityOf(server: ServerRef | undefined): {
  running: ReadonlySet<string>;
  waiting: ReadonlySet<string>;
} {
  if (!server) return { running: new Set(), waiting: new Set() };

  const sessions = server.data.session;
  return {
    running: new Set(sessions.active()),
    waiting: new Set([...sessions.permission.sessions(), ...sessions.form.sessions()]),
  };
}

/** Counts for the header chip, over the same cards the board shows. */
export function countsOf(
  server: ServerRef | undefined,
  showSubagents = false,
): { running: number; waiting: number } {
  const activity = activityOf(server);
  const cards = selectCards(factsOf(rowsOf(server)), { ...activity, showSubagents });

  return {
    running: cards.filter((card) => card.status === 'running').length,
    waiting: cards.filter((card) => card.status === 'waiting').length,
  };
}
