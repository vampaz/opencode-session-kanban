import { describe, expect, it } from 'vitest';

import {
  cardKind,
  cardStatus,
  familyArchived,
  groupForks,
  isVisible,
  placementGone,
  rulesApplyTo,
  projectLabel,
  rootID,
  selectCards,
  type CardKind,
  type SessionFacts,
} from './status';

function session(overrides: Partial<SessionFacts> & { id: string }): SessionFacts {
  return {
    archived: false,
    outcome: undefined,
    updated: 0,
    parentID: undefined,
    fork: undefined,
    ...overrides,
  };
}

/** `root` ├─ `fork` └─ `forkOfFork`, plus `sub` under `root`. */
function family(): SessionFacts[] {
  return [
    session({ id: 'root' }),
    session({ id: 'fork', parentID: 'root', fork: { sessionID: 'root' } }),
    session({ id: 'forkOfFork', parentID: 'fork', fork: { sessionID: 'fork' } }),
    session({ id: 'sub', parentID: 'root' }),
  ];
}

function map(sessions: readonly SessionFacts[]): ReadonlyMap<string, SessionFacts> {
  return new Map(sessions.map((item) => [item.id, item]));
}

describe('cardKind', () => {
  it('classifies a root, a fork, and a subagent', () => {
    expect(cardKind(session({ id: 'a' }))).toBe('root');
    expect(cardKind(session({ id: 'b', parentID: 'a', fork: {} }))).toBe('fork');
    expect(cardKind(session({ id: 'c', parentID: 'a' }))).toBe('subagent');
  });

  it('treats a fork of a fork as a fork', () => {
    expect(cardKind(session({ id: 'c', parentID: 'b', fork: {} }))).toBe('fork');
  });
});

describe('rootID', () => {
  it('walks a chain of forks to the root', () => {
    const sessions = map(family());

    expect(rootID(sessions, 'root')).toBe('root');
    expect(rootID(sessions, 'fork')).toBe('root');
    expect(rootID(sessions, 'forkOfFork')).toBe('root');
  });

  it('returns undefined when a parent was deleted', () => {
    const sessions = map([session({ id: 'fork', parentID: 'gone', fork: {} })]);

    expect(rootID(sessions, 'fork')).toBeUndefined();
    expect(isVisible(sessions, sessions.get('fork')!, { showSubagents: false })).toBe(false);
  });

  it('stops on a cycle', () => {
    const sessions = map([
      session({ id: 'a', parentID: 'b', fork: {} }),
      session({ id: 'b', parentID: 'a', fork: {} }),
    ]);

    expect(rootID(sessions, 'a')).toBeUndefined();
  });
});

describe('forks that carry only fork.sessionID', () => {
  it('classifies them as forks and follows the source to the root', () => {
    const sessions = map([
      session({ id: 'root' }),
      session({ id: 'fork', fork: { sessionID: 'root' } }),
    ]);
    const fork = sessions.get('fork')!;

    expect(cardKind(fork)).toBe('fork');
    expect(rootID(sessions, 'fork')).toBe('root');
    expect(isVisible(sessions, fork, { showSubagents: false })).toBe(true);
  });

  it('hides a fork under an archived source', () => {
    const sessions = map([
      session({ id: 'root', archived: true }),
      session({ id: 'fork', fork: { sessionID: 'root' } }),
    ]);

    expect(isVisible(sessions, sessions.get('fork')!, { showSubagents: false })).toBe(false);
    expect(familyArchived(sessions, 'fork')).toBe(true);
  });

  it('hides a fork whose source was deleted', () => {
    const sessions = map([session({ id: 'fork', fork: { sessionID: 'gone' } })]);

    expect(rootID(sessions, 'fork')).toBeUndefined();
    expect(isVisible(sessions, sessions.get('fork')!, { showSubagents: false })).toBe(false);
  });
});

describe('rulesApplyTo', () => {
  it('allows roots and forks, and subagents only when they are shown', () => {
    const root = session({ id: 'root' });
    const fork = session({ id: 'fork', fork: { sessionID: 'root' } });
    const subagent = session({ id: 'sub', parentID: 'root' });

    expect(rulesApplyTo(root, { showSubagents: false })).toBe(true);
    expect(rulesApplyTo(fork, { showSubagents: false })).toBe(true);
    expect(rulesApplyTo(subagent, { showSubagents: false })).toBe(false);
    expect(rulesApplyTo(subagent, { showSubagents: true })).toBe(true);
  });

  it('uses fork before parentID, like the board', () => {
    expect(
      rulesApplyTo({ parentID: 'root', fork: { sessionID: 'root' } }, { showSubagents: false }),
    ).toBe(true);
    expect(rulesApplyTo({ parentID: 'root' }, { showSubagents: false })).toBe(false);
  });
});

describe('visibility', () => {
  it('hides subagents unless they are enabled', () => {
    const sessions = map(family());
    const sub = sessions.get('sub')!;

    expect(isVisible(sessions, sub, { showSubagents: false })).toBe(false);
    expect(isVisible(sessions, sub, { showSubagents: true })).toBe(true);
  });

  it('hides an archived root and its whole family', () => {
    const sessions = map(
      family().map((item) => (item.id === 'root' ? { ...item, archived: true } : item)),
    );

    expect(isVisible(sessions, sessions.get('root')!, { showSubagents: false })).toBe(false);
    expect(isVisible(sessions, sessions.get('fork')!, { showSubagents: false })).toBe(false);
    expect(isVisible(sessions, sessions.get('forkOfFork')!, { showSubagents: false })).toBe(false);
    expect(familyArchived(sessions, 'forkOfFork')).toBe(true);
  });

  it('keeps a fork visible under a live root, in its own column', () => {
    const sessions = map(family());

    expect(isVisible(sessions, sessions.get('fork')!, { showSubagents: false })).toBe(true);
    expect(familyArchived(sessions, 'fork')).toBe(false);
  });
});

describe('cardStatus', () => {
  it('prefers waiting over running and running over a past failure', () => {
    const failed = session({ id: 'a', outcome: 'failed' });

    expect(cardStatus({ session: failed, running: true, waiting: true })).toBe('waiting');
    expect(cardStatus({ session: failed, running: true, waiting: false })).toBe('running');
    expect(cardStatus({ session: failed, running: false, waiting: false })).toBe('failed');
  });

  it('reports an interrupted or idle run', () => {
    expect(
      cardStatus({
        session: session({ id: 'a', outcome: 'interrupted' }),
        running: false,
        waiting: false,
      }),
    ).toBe('interrupted');
    expect(
      cardStatus({
        session: session({ id: 'a', outcome: 'succeeded' }),
        running: false,
        waiting: false,
      }),
    ).toBe('idle');
  });
});

describe('selectCards', () => {
  it('keeps roots and forks, and skips subagents by default', () => {
    const cards = selectCards(family(), {
      running: new Set(['fork']),
      waiting: new Set(['root']),
      showSubagents: false,
    });

    expect(cards.map((card) => card.id)).toEqual(['root', 'fork', 'forkOfFork']);
    expect(cards.map((card) => card.status)).toEqual(['waiting', 'running', 'idle']);
    expect(cards.map((card) => card.rootID)).toEqual(['root', 'root', 'root']);
  });

  it('keeps archived cards when the board shows an Archived column', () => {
    const sessions = [
      session({ id: 'root', archived: true }),
      session({ id: 'fork', parentID: 'root', fork: { sessionID: 'root' } }),
      session({ id: 'live' }),
    ];
    const cards = selectCards(sessions, {
      running: new Set(),
      waiting: new Set(),
      showSubagents: false,
      includeArchived: true,
    });

    expect(cards.map((card) => card.id)).toEqual(['root', 'fork', 'live']);
    expect(cards.map((card) => card.archived)).toEqual([true, true, false]);
  });

  it('reads waiting from the window data for forks', () => {
    const cards = selectCards(family(), {
      running: new Set(),
      waiting: new Set(['forkOfFork']),
      showSubagents: false,
    });

    expect(cards.find((card) => card.id === 'forkOfFork')?.status).toBe('waiting');
  });
});

describe('placementGone', () => {
  const facts = (list: SessionFacts[]) => map(list);

  it('keeps a placement whose ancestor is not loaded yet', () => {
    const sessions = facts([session({ id: 'fork', fork: { sessionID: 'root' } })]);

    expect(placementGone(sessions, () => false, 'fork')).toBe(false);
  });

  it('keeps a placement for a session the window has not loaded', () => {
    expect(placementGone(facts([]), () => false, 'unknown')).toBe(false);
  });

  it('reports a missing session as gone', () => {
    expect(placementGone(facts([]), (id) => id === 'gone', 'gone')).toBe(true);
  });

  it('reports a missing ancestor as gone', () => {
    const sessions = facts([session({ id: 'fork', fork: { sessionID: 'gone' } })]);

    expect(placementGone(sessions, (id) => id === 'gone', 'fork')).toBe(true);
  });

  it('reports a family under an archived root as gone', () => {
    const sessions = facts([
      session({ id: 'root', archived: true }),
      session({ id: 'fork', fork: { sessionID: 'root' } }),
    ]);

    expect(placementGone(sessions, () => false, 'fork')).toBe(true);
    expect(placementGone(sessions, () => false, 'root')).toBe(true);
  });

  it('keeps an archived session in the middle of a live family', () => {
    const sessions = facts([
      session({ id: 'root' }),
      session({ id: 'mid', fork: { sessionID: 'root' }, archived: true }),
      session({ id: 'tip', fork: { sessionID: 'mid' } }),
    ]);

    expect(placementGone(sessions, () => false, 'tip')).toBe(false);
  });

  it('keeps a cycle', () => {
    const sessions = facts([
      session({ id: 'a', fork: { sessionID: 'b' } }),
      session({ id: 'b', fork: { sessionID: 'a' } }),
    ]);

    expect(placementGone(sessions, () => false, 'a')).toBe(false);
  });
});

describe('groupForks', () => {
  it('puts a fork right after its root', () => {
    const cards: { id: string; kind: CardKind; rootID: string }[] = [
      { id: 'a', kind: 'root', rootID: 'a' },
      { id: 'b', kind: 'root', rootID: 'b' },
      { id: 'a-fork', kind: 'fork', rootID: 'a' },
      { id: 'a-fork-fork', kind: 'fork', rootID: 'a' },
    ];

    expect(groupForks(cards).map((card) => card.id)).toEqual(['a', 'a-fork', 'a-fork-fork', 'b']);
  });

  it('leaves a fork in place when its root is in another column', () => {
    const cards: { id: string; kind: CardKind; rootID: string }[] = [
      { id: 'fork', kind: 'fork', rootID: 'elsewhere' },
      { id: 'a', kind: 'root', rootID: 'a' },
    ];

    expect(groupForks(cards).map((card) => card.id)).toEqual(['fork', 'a']);
  });
});

describe('projectLabel', () => {
  it('uses the last directory segment and keeps the subpath', () => {
    expect(projectLabel('/work/session-kanban')).toBe('session-kanban');
    expect(projectLabel('/work/session-kanban/')).toBe('session-kanban');
    expect(projectLabel('/work/mono', 'packages/ui')).toBe('mono/packages/ui');
    expect(projectLabel('/tmp/sk-kanban-scratch', '../../../tmp/sk-kanban-scratch')).toBe(
      'sk-kanban-scratch',
    );
  });
});
