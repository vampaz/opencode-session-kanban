# Changelog

## 0.1.0 - 2026-11-17

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

### Rules, M3

- A pure rules engine: the closed trigger and condition sets, `all`/`any` matching, ascending
  priority with one match per session and event, manual and pinned guards with `overrideManual`,
  per-rule cooldown, and event-id dedupe recorded in `lastRuleEventID`.
- The server engine follows the event stream and a shared 30 s idle tick (one per process),
  re-checks the live document under the board lock, and emits `changed` plus rule notifications.
- RPC: `rules.upsert`, `rules.remove`, `rules.reorder`, `rules.preview`, `settings.update`,
  `columns.upsert`, `columns.remove`, `columns.reorder`, `columns.default`, and `board.replace`.
- Rule notifications: a toast, and a system notification with the rule event id when the window is
  unfocused.
- The `kanban` settings page: board defaults, column editor (add, rename, recolour, reorder,
  collapse, delete), rule list with an inline editor and dry run, export, import, and reset.
- A `created` rule is evaluated just after the window's initial placement, so it can move a new
  session instead of racing it; the initial placement is `source: "auto"`.

### Engine fixes

- Rules only apply to sessions that render as cards: roots and forks, and subagents only while
  `showSubagents` is on, using the board's own classification.
- The idle tick makes one listing request instead of a `session.get` per session, and builds each
  subject from the listed row.
- One engine and one idle tick run per process, elected through `globalThis` with takeover when the
  owner unloads or the plugin reloads; the event-id dedupe stays as the safety net.

### Agent tools, M4

- Eleven tools under the `kanban` namespace with codemode: `list`, `get`, `move`, `pin`,
  `clear_manual`, `archive`, `fork`, `create_session`, `list_rules`, `set_rule`, `preview_rules`.
- The tools share the RPC server operations, so they work with no window open; `sessionID` accepts
  `me`, a move is a manual placement, and an unknown column lists the valid ids.
- `kanban_list` derives running and waiting from the plugin's event stream, with the server's missing
  status and form APIs documented in the tool description.
- Permissions through `ctx.permission.assert`: `kanban.archive`, `kanban.fork`, `kanban.rules`, and
  `kanban.prompt` for a starter prompt. `kanban_fork` reports the missing server fork call.
