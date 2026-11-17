# Changelog

## Unreleased

### Added

- The package manifest, TypeScript, Vite, Vitest, oxlint, and oxfmt configuration.
- The RPC contract with `snapshot` and `move`, plus the `changed` event.
- The board document in plugin storage: default columns, a bounded revision guard, and a pure
  placement reducer with fractional positions, all unit-tested.
- A side panel at `width: 900` with drag and drop between columns, the `kanban.open` command, and a
  quick-board dialog.
- An M0 verification section in the README and the 2.3.0 API corrections in the plan.
- CI for lint, format, typecheck, tests, and the GUI build.

### Session board, M1

- Sessions of every project load once through `session.list`, then stay current from the window's
  synced data and events. No polling.
- Derived card state: waiting, running, failed, interrupted, idle, plus root, fork, and subagent
  classification. A fork follows its root, so an archived or deleted root hides it.
- Cards show title, project and subpath, status, last activity, agent, model, and cost. Forks carry a
  marker and group under their root.
- Window-local filters: text, project, status, and running-or-waiting only.
- The `running · waiting` header chip, the side-region launcher item, and the `/kanban` slash command.
- Empty, offline, and error states, with a retry on error.
- The M0 `whoami` method and the diagnostics footer are gone.

### Placements, M2

- Board writes are serialized by an in-process lock shared through `globalThis`; the revision check
  stays as a second line of defence, so concurrent commits no longer lose an update.
- Forks load at startup: a capped pass lists non-archived sessions and remembers forks with their
  missing ancestors, so a fork renders with its marker and family visibility before it is opened.
- Native drag and drop, with an optimistic mirror that reverts when a write fails. Every card also
  has a **Move to…** menu for the keyboard and touch.
- Card actions: Open, Move to…, Fork…, Pin, Archive, and Copy session ID.
- New session from any column, with the panel project as the default directory, an optional title,
  and an optional starter prompt.
- Placements of deleted sessions and archived families are pruned on read.
- RPC: `move` now takes a column index, plus `setPinned`, `clearManual`, and `prune`.
