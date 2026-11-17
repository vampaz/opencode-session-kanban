/** The fields a fork pass needs from a listed session. `Session.Info` satisfies this shape. */
export type BootstrapRow = {
  readonly id: string;
  readonly parentID?: string | undefined;
  readonly fork?: unknown;
};

/** A fork names its source in `fork.sessionID`; a subagent uses `parentID`. */
function parentOf(row: BootstrapRow): string | undefined {
  const fork = row.fork;
  if (typeof fork === 'object' && fork !== null) {
    const source = (fork as { readonly sessionID?: unknown }).sessionID;
    if (typeof source === 'string') return source;
  }

  return row.parentID;
}

/**
 * What a fork pass must remember: every fork, plus any ancestor the window does not know yet.
 * Roots arrive in the first pass, so a fork under a known root costs one `remember`. Subagents,
 * and the subagent rows that are ancestors of nothing, stay out unless they are shown.
 */
export function selectBootstrapSessions<T extends BootstrapRow>(
  rows: readonly T[],
  known: ReadonlySet<string>,
  options: { readonly showSubagents: boolean },
): T[] {
  const byID = new Map(rows.map((row) => [row.id, row]));
  const selected = new Map<string, T>();

  function rememberWithAncestors(row: T): void {
    let current: T | undefined = row;
    const seen = new Set<string>();

    while (current) {
      if (seen.has(current.id)) return;
      seen.add(current.id);
      if (!known.has(current.id)) selected.set(current.id, current);
      const parentID = parentOf(current);
      if (!parentID) return;
      current = byID.get(parentID);
    }
  }

  for (const row of rows) {
    const fork = row.fork !== undefined && row.fork !== null;
    const subagent = row.parentID !== undefined && !fork;
    if (fork || (subagent && options.showSubagents)) rememberWithAncestors(row);
  }

  return [...selected.values()];
}
