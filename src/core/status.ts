/** The parts of a session the board derives from. `Session.Info` satisfies this shape. */
export type SessionFacts = {
  readonly id: string;
  readonly parentID?: string | undefined;
  readonly fork?: unknown;
  readonly archived: boolean;
  readonly outcome?: 'succeeded' | 'failed' | 'interrupted' | undefined;
  readonly updated: number;
};

/** Derived on read from session info and the window's synced data. Never stored on a card. */
export type CardStatus = 'idle' | 'running' | 'waiting' | 'failed' | 'interrupted';

/** What a session is on the board. A child is a subagent only when it has no `fork`. */
export type CardKind = 'root' | 'fork' | 'subagent';

export type CardState = {
  readonly id: string;
  readonly kind: CardKind;
  readonly rootID: string;
  readonly status: CardStatus;
  readonly archived: boolean;
  readonly updated: number;
};

export type SelectOptions = {
  readonly running: ReadonlySet<string>;
  readonly waiting: ReadonlySet<string>;
  readonly showSubagents: boolean;
};

export function cardKind(session: SessionFacts): CardKind {
  // The server marks a fork with `fork`; it carries no `parentID`, so the flag decides.
  if (session.fork !== undefined && session.fork !== null) return 'fork';
  return session.parentID ? 'subagent' : 'root';
}

/** The session a fork copied, from `fork.sessionID`. Subagents use `parentID` instead. */
function parentOf(session: SessionFacts): string | undefined {
  const fork = session.fork;
  if (typeof fork === 'object' && fork !== null) {
    const source = (fork as { readonly sessionID?: unknown }).sessionID;
    if (typeof source === 'string') return source;
  }

  return session.parentID;
}

/**
 * The top-most session of a family. Undefined when a parent is missing, which happens for a session
 * whose root was deleted, and for a cycle.
 */
export function rootID(
  sessions: ReadonlyMap<string, SessionFacts>,
  sessionID: string,
): string | undefined {
  const seen = new Set<string>();
  let current = sessions.get(sessionID);

  while (current) {
    if (seen.has(current.id)) return undefined;
    seen.add(current.id);

    const parentID = parentOf(current);
    if (!parentID) return current.id;

    const parent = sessions.get(parentID);
    if (!parent) return undefined;
    current = parent;
  }

  return undefined;
}

/**
 * Whether a placement's session is known to be gone. Only positive evidence counts: the session or
 * an ancestor on its chain is missing, or the resolved root is archived. An ancestor the window has
 * not loaded yet is unknown, not gone, so the placement is kept.
 */
export function placementGone(
  sessions: ReadonlyMap<string, SessionFacts>,
  missing: (sessionID: string) => boolean,
  sessionID: string,
): boolean {
  if (missing(sessionID)) return true;

  const seen = new Set<string>();
  let current = sessions.get(sessionID);

  while (current) {
    if (seen.has(current.id)) return false;
    seen.add(current.id);

    const parentID = parentOf(current);
    if (!parentID) return current.archived === true;
    if (missing(parentID)) return true;

    const parent = sessions.get(parentID);
    if (!parent) return false;
    current = parent;
  }

  return false;
}

/** Archived is a property of the family: an archived root takes its forks and subagents with it. */
export function familyArchived(
  sessions: ReadonlyMap<string, SessionFacts>,
  sessionID: string,
): boolean {
  const root = rootID(sessions, sessionID);
  return root !== undefined && sessions.get(root)?.archived === true;
}

export function isVisible(
  sessions: ReadonlyMap<string, SessionFacts>,
  session: SessionFacts,
  options: { readonly showSubagents: boolean },
): boolean {
  if (cardKind(session) === 'subagent' && !options.showSubagents) return false;

  const root = rootID(sessions, session.id);
  if (root === undefined) return false;
  return sessions.get(root)?.archived !== true;
}

/** Waiting wins over running, and a running session wins over the outcome of its previous run. */
export function cardStatus(input: {
  readonly session: SessionFacts;
  readonly running: boolean;
  readonly waiting: boolean;
}): CardStatus {
  if (input.waiting) return 'waiting';
  if (input.running) return 'running';
  if (input.session.outcome === 'failed') return 'failed';
  if (input.session.outcome === 'interrupted') return 'interrupted';
  return 'idle';
}

/** Every visible session as a card, in the order given. */
export function selectCards(
  sessions: readonly SessionFacts[],
  options: SelectOptions,
): CardState[] {
  const byID = new Map(sessions.map((session) => [session.id, session]));
  const cards: CardState[] = [];

  for (const session of sessions) {
    if (!isVisible(byID, session, options)) continue;

    cards.push({
      id: session.id,
      kind: cardKind(session),
      rootID: rootID(byID, session.id) ?? session.id,
      status: cardStatus({
        session,
        running: options.running.has(session.id),
        waiting: options.waiting.has(session.id),
      }),
      archived: session.archived,
      updated: session.updated,
    });
  }

  return cards;
}

/**
 * Puts each fork right after its root when both are in the same list, so a family reads as one
 * group. Forks of forks follow their nearest ancestor that is in the list.
 */
export function groupForks<
  T extends { readonly id: string; readonly kind: CardKind; readonly rootID: string },
>(cards: readonly T[]): T[] {
  const ids = new Set(cards.map((card) => card.id));
  const children = new Map<string, T[]>();

  for (const card of cards) {
    if (card.kind !== 'fork') continue;
    if (card.rootID === card.id || !ids.has(card.rootID)) continue;
    const list = children.get(card.rootID) ?? [];
    list.push(card);
    children.set(card.rootID, list);
  }

  const moved = new Set([...children.values()].flat());
  const ordered: T[] = [];

  for (const card of cards) {
    if (moved.has(card)) continue;
    ordered.push(card);
    const forks = children.get(card.id);
    if (forks) ordered.push(...forks);
  }

  return ordered;
}

/** The last segment of a project directory, which is how the host names an unlabelled project. */
export function projectLabel(directory: string, subpath?: string): string {
  const parts = directory.replace(/[\\/]+$/, '').split(/[\\/]/);
  const base = parts[parts.length - 1] || directory;
  // A subpath outside the project root (e.g. a scratch directory) reads as `../..`.
  return subpath && !subpath.startsWith('..') ? `${base}/${subpath}` : base;
}
