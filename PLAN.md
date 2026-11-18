# Session Kanban — implementation plan

A global board for OpenCode Desktop where each card is a live OpenCode session. The board is shared
across projects, starts sessions, follows them without polling, moves cards by user-defined rules, and
exposes tools so the agent can read and move the board.

Status: refined design with product decisions settled, ready for an M0 spike.
Target: OpenCode Desktop with the experimental GUI plugin API (`@opencode/plugin` 2.3.x).

## Settled product decisions

| Question | Decision |
| --- | --- |
| Default columns | `Backlog · In progress · Waiting · Done · Failed` |
| Board tab | Pinned in every session's side region |
| Header chip | `running · waiting` |
| Rule archiving | Rules never archive; archiving is a user or agent action |
| Quick-board dialog | Included in v1 beside the side panel |
| Fork from a card | Included in v1 |
| Fork placement | Inherits the source card's column |
| Fork visibility | Follows its root session: an archived root hides the fork, a deleted root takes it away |
| Rule notifications | On by default |
| First release surface | Panel, dialog, command, launcher, header chip |

## Decisions

These replace the assumptions in the first draft. Each is grounded in the shipped SDK types or the
server's own data.

1. **The board is a session side panel, not a global window surface.** The GUI API has no full-window
   contribution point. Available surfaces are a session `Panel` (which the user can drag to the bottom
   pane), four slots (`window.bottom`, `session.header`, `session.location.menu`,
   `session.panel.end`), modal dialogs (max `x-large`, 980×600), and a titlebar pill. The primary
   board is a pinned, wide side panel; a dialog gives a "quick board" that also works from Home and
   drafts.
2. **Board state is server-owned.** Agent tools run in the server and cannot read GUI window stores.
   The board document lives in plugin storage and the GUI is a client over RPC.
3. **One board per server, across all projects.** Verified: plugin storage keys are
   `plugin:<plugin id>:<key>` in one shared `kv` table with no location component.
4. **No polling.** Session state comes from the event stream plus the window's synced client data.
   A single 30 s tick exists only for idle-duration rules.
5. **Columns are user buckets, and the board is two-way.** Cards still show a status badge, but the
   agent now reports its own state with `kanban_move` (`sessionID: "me"`), and a user move into a
   starting column sends the session a message. Rules remain the only mover triggered by events.
6. **Placements are sparse.** An unplaced session renders in the default column virtually. Installing
   the plugin writes nothing per session.
7. **Tools and RPC are different things.** Tools are the agent surface; RPC is the transport between
   the GUI and the server part.
8. **Forks are first-class cards.** `session.fork` creates a child session with copied history, so
   `parentID` alone cannot decide what is a subagent. A session with `fork` set renders as a card;
   only a child without `fork` is a subagent.
9. **Rules never archive.** A rule can move, pin, and notify. Hiding a session from the app's list
   stays a deliberate user or agent action.
10. **A fork follows its root.** A fork inherits the source card's column when created, and its
    visibility follows the root session: an archived root hides the fork, and a deleted root removes
    it. Walk the `parentID` chain to the root; never treat the immediate parent as the authority.
11. **The agent can report its own state.** A session hook adds a short instruction to each model
    request of a card session, naming the card's column and the column mapping, and telling the agent
    to call `kanban_move` with `sessionID: "me"` only when its state changes. The instruction is
    marked in the request's system parts so every plugin instance in the process adds it once. It is
    on by default; `agentUpdatesCard` turns it off. Agent moves get `source: "agent"`, so rules treat
    them like `auto` and only `manual` or pinned cards stay protected.
12. **A user move can start the agent.** Moving a card into a `startAgent` column from a different
    column sends one message: the queued task if there is one, else the column's `startPrompt`, else
    the built-in "Continue with this task." for a session that has run. Agent, rule, and tool moves
    never trigger it, and a running or waiting session is skipped. The decision runs inside the
    board write, so a double drop cannot prompt twice; the message is sent after the placement is
    stored.
13. **Backlog is a task queue.** A task given to a New session in a non-starting column is stored on
    the placement and sent when the card reaches a starting column. It is a launch queue tied to a
    session, not a separate task tracker.
14. **One-time sort, never automatic.** Existing unplaced cards can be placed by state once, with a
    preview and a confirmation. The sort writes `source: "auto"` and never touches placed or pinned
    cards.

## Goals

- One visual overview of relevant root and forked sessions across every project on the server.
- Start a session from a column or a card, or fork one, and place it immediately.
- Live title, status, run outcome, waiting state, last activity, and project without a refresh control.
- Rules that move sessions on events, with predictable precedence and no manual-override fights.
- Agent tools to list, inspect, move, start, and fork sessions, working with the panel closed.
- Per-window filters and saved views over a single shared board.

## Non-goals (v1)

- Task management independent of sessions.
- Cross-machine or cloud sync.
- Editing a session's content in the board.
- A background watcher that moves cards from status alone. A card moves when the agent reports, a
  rule fires, or the user asks.
- Rule-driven archiving.
- A full-window board page. This needs a new GUI surface from OpenCode; do not emulate it with
  `window.bottom`.

## Product surfaces

| Surface | Purpose | Notes |
| --- | --- | --- |
| Side panel `kanban:board` | The board | `region: "side"`, `wide`, numeric `width`, `PanelTab.pinned`, `mobile` view |
| Command `kanban.open` | Toggle the board on the routed session | default bind `mod+shift+b`, also a `/kanban` slash command |
| `session.panel` menu item | Launcher row in the side region's **+** menu | `primary` only if the board should be the default tab |
| Dialog "Quick board" | Board from Home, a draft, or any screen | `<ctx.ui.Dialog size="x-large">` (980×600), same component as the panel |
| `session.header` slot | `running · waiting` chip that opens the board | compact form when the title does not fit |
| Settings page `kanban` | Columns, rules, defaults, reset | searchable `entries`; keeps rule editing out of the panel |

The panel receives `props.session`, so a column's **New session** action defaults to that session's
project and directory. The board content itself never depends on the routed session.

## Architecture

One package, three parts plus a shared contract.

```
src/
├── index.ts            server part: storage, rules, tools, RPC implementation
├── rpc.ts              Rpc.define contract: methods, events, errors
├── gui.tsx             ./gui-experimental entry: Plugin.define({ ...definition, setup, main? })
├── core/               pure, unit-tested logic shared by both sides
│   ├── board.ts        schema, revision guard, migrations, placement reducer
│   ├── rules.ts        trigger/condition evaluation, precedence, dedupe
│   └── status.ts       derived card state from session info + client data
└── gui/
    ├── definition.ts   stores, i18n
    ├── board.tsx       board view (columns, cards, filters, DnD)
    ├── panel.tsx       Panel registration
    ├── dialog.tsx      quick-board dialog host
    ├── settings.tsx    SettingsPage
    ├── command.tsx     Command, MenuItem, Slot, TitlebarItem
    └── client.ts       RPC client with retry and snapshot cache
```

### Server part

- Registers the RPC contract and the `kanban` tool namespace.
- Owns the board document in `ctx.storage`, guarded by `revision`.
- Runs the rules engine over the `AsyncIterable` from `ctx.event.subscribe({ types: [...] })`. Every
  location instance sees the server's events; the board lock and the `(rule, session, event)` dedupe
  make duplicate instances harmless. One engine and its idle tick are elected per process through
  `globalThis`, with takeover when the owner unloads. Rules only touch sessions that render as cards
  (roots and forks; subagents only with `showSubagents`).
- Emits `changed` after every mutation, and `notify` intents for rule actions that need a window.

### RPC contract

Methods:

| Method | Input | Output |
| --- | --- | --- |
| `snapshot` | — | `{ version, revision, columns, placements[], rules[], settings }` |
| `move` | `{ sessionKey, columnId, index, source? }` | `{ revision, started }` |
| `setPinned` | `{ sessionKey, pinned }` | `{ revision }` |
| `clearManual` | `{ sessionKey }` | `{ revision }` |
| `prune` | `{ keys }` | `{ revision }` |
| `columns.upsert` / `columns.remove` / `columns.reorder` | column patch | `{ revision }` |
| `columns.default` | `{ id }` | `{ revision }` |
| `rules.upsert` / `rules.remove` / `rules.reorder` | rule patch | `{ revision }` |
| `rules.preview` | — | `{ moves: { sessionKey, from, to, ruleID }[] }` |
| `settings.update` | partial settings | `{ revision }` |
| `session.create` | `{ directory, columnId, title?, task? }` | `{ sessionID, revision, started, queued }` |
| `sort.preview` | — | `{ moves, counts }` |
| `sort.apply` | — | `{ revision, placed }` |
| `board.replace` | `{ document }` | `{ revision }` |

Events: `changed` `{ revision }`, `notify` `{ id, title, message, variant, sessionKey }`.

`move` takes the index among the target column's cards; the server reads its own document, computes
the fractional position, and rebalances only when the gap collapses. `prune` takes the session keys a
window knows are gone, because the server cannot enumerate sessions.

The window creates sessions through `session.create` so the start-or-queue rule lives on the server;
it still forks through the client and places the fork with `move` (`source: "auto"`), because the
window owns the synced session store that `remember` feeds.

Every method returns the new `revision`. Writes are serialized by one in-process lock shared through
`globalThis`, so two locations cannot lose an update; a revision read-back stays as a second check. Duplicate writes are therefore harmless when
more than one plugin instance is loaded.

Event subscriptions are live only. A window that reconnects must re-request `snapshot`; drive that
from the reactive `ctx.servers.get("sidecar")?.connected`.

### GUI part

- Holds a Solid mirror of the snapshot for optimistic drag feedback; a failed write reverts it.
- Re-fetches the snapshot on `changed` (debounced 100 ms) rather than applying deltas.
- Never writes `localStorage` for board data. Only view preferences are stored per window.

## Data model

Stored under one key (`board`) as a single JSON document.

```jsonc
{
  "version": 1,
  "revision": 42,
  "columns": [
    {
      "id": "backlog",
      "title": "Backlog",
      "order": 0,
      "color": null,
      "startAgent": false,
      "startPrompt": null        // null uses "Continue with this task."
    }
  ],
  "defaultColumn": "backlog",
  "placements": {
    "sidecar\nses_abc": {
      "columnId": "review",
      "position": 1536.5,
      "source": "manual",          // manual | rule | auto | agent
      "pinned": false,
      "ruleID": null,
      "updatedAt": 1763000000000,
      "lastRuleEventID": null,
      "task": null                 // a queued task, sent on a starting column
    }
  },
  "rules": [
    {
      "id": "rule_1",
      "name": "Failed runs go to Failed",
      "enabled": true,
      "priority": 10,
      "trigger": ["run.failed"],
      "match": "all",              // all | any
      "conditions": [{ "type": "directory", "op": "prefix", "value": "/work" }],
      "actions": [{ "type": "move", "toColumn": "failed" }],
      "overrideManual": false,
      "cooldownMs": 0
    }
  ],
  "settings": {
    "showSubagents": false,
    "archived": "hide",            // hide | column
    "idleMinutes": 10,
    "notifyOnRuleMove": true,
    "agentUpdatesCard": true
  }
}
```

Older documents omit `startAgent`, `startPrompt`, `task`, and `agentUpdatesCard`. `parseBoard`
normalizes them on read: `startAgent` defaults to `id === "in-progress"`, the others to `null` and
`true`, so a board written before this feature still loads and the next write stores the new shape.

Notes:

- Placement keys use `SessionRef.key` (`<server id>\n<session id>`). v1 serves only the built-in
  `sidecar` server, but the key needs no change when more are added.
- `position` is fractional. A drop writes one card and, only when the gap collapses, rebalances the
  column.
- Placements for deleted or archived sessions are pruned on read, not by a background job.
- Values are small (a few hundred placements is well under any storage limit). If write contention
  ever appears, split placements into `placement/<sessionKey>` keys; do not do that up front.
- `version` exists so a future schema change can migrate on load. Unknown versions load read-only and
  show a "newer board" error instead of overwriting.
- Plugin storage takes `Schema.Json`. Keep `BoardDocument` a type alias, not an interface, so the
  document assigns to it without a cast.

## Derived card state

Never persisted. Computed by `core/status.ts` from the window's synced data.

| Card state | Source |
| --- | --- |
| waiting | `data.session.permission.sessions()` or `data.session.form.sessions()` contains the id |
| running | `data.session.status(id) === "running"` (status is only `idle` or `running`), or `data.session.active().includes(id)` |
| failed | `Session.Info.outcome === "failed"` |
| interrupted | `Session.Info.outcome === "interrupted"` |
| idle | none of the above |
| archived | `Session.Info.time.archived` is set |
| last activity | `Session.Info.time.updated` |
| project | `Session.Info.location.directory`, plus `subpath` when present |

Bootstrap on first open:

1. `session.list({ parentID: null, archived: false, limit: 200 })` through `ctx.client`.
2. `data.session.remember(info)` for each result.
3. Subscribe to server events; never poll.

A child session is a subagent only when `parentID` is set and `fork` is absent. A fork is marked by
`fork` and names its source in `fork.sessionID`; it has no `parentID`. Subagents are hidden unless
`settings.showSubagents` is on, in which case they render nested under their root card. A fork always
renders as its own card while its root is visible.

A fork's visibility follows its root: resolve `parentID` to the root session and apply that session's
archived state to the whole family. A deleted root removes the fork's placement on the next sweep.
The fork keeps its own column until its root disappears; it never becomes a root card.

## Features

### Board

- Columns: add, rename, recolor, reorder, delete, and set **Start the agent** plus a **Start
  message**. Deleting a column moves its cards to `defaultColumn`.
- Cards show title, project and subpath, status badge, last activity, agent and model, and cost for
  the current run. No task checklist in v1.
- A running card shows a quiet activity indicator; respect `prefers-reduced-motion`.
- Drag and drop is native HTML5 DnD. Every card also has a **Move to…** menu, which is the only
  reordering path on touch and the keyboard path everywhere.
- Filters: text, project, status, "running or waiting only". Stored per window, not on the server.
- Card actions: Open (focus the session tab), Move to…, Fork…, Pin, Archive, Copy session ID.
- Forked sessions render as normal cards, grouped under their root with a fork marker, and inherit the
  source card's column. Their visibility follows the root session.
- Opening a card uses `ctx.tabs.open({ server, id }, { focus: true })`. The board closes on narrow
  screens after opening.
- **Two-way moves.** The agent moves its own card when its state changes (`source: "agent"`), and a
  user move into a starting column starts the session (see Starting sessions). Moving a card and
  setting its column from settings are the only ways a column starts work.
- A card whose placement holds a queued task shows a small **Task queued** marker with the task in
  its tooltip.
- **Sort sessions by state** in settings: a preview with counts per column, then one confirmed write
  that places unplaced cards by state.

### Starting sessions

- **New session** on a column opens a small dialog: project (defaults to the panel's session
  project), optional title, optional **Task**. It creates the session through `session.create`,
  writes the placement, and opens the tab. In a starting column the task runs at once; otherwise it
  waits on the placement. On Home the dialog requires an explicit project.
- **Start from card** creates a new session in the source session's project with an optional prompt.
- **Fork from card** calls `ctx.client.session.fork({ sessionID })` with no `before`, so the full
  history is copied, then `data.session.remember(info)`, places the fork in the source card's column,
  and opens it. The fork does not run until the user prompts it. Choosing a fork point is v1.1; v1
  copies the full history.
- An agent can do the same through `kanban_fork`.

### Sync

- `session.created`, `session.deleted`, `session.archived`, `session.unarchived`, `session.renamed`,
  `session.status`, `session.execution.*`, `permission.*`, `form.*` keep the board current.
- A deleted session removes its placement; an archived one hides or moves to an Archived column per
  settings. A fork follows its root: an archived root hides the family, and a deleted root removes
  the fork's placement too.
- Rule moves and manual moves both arrive through `changed`, so two windows stay consistent.
- While the server is unreachable the board shows the last snapshot and a stale banner. It never
  blocks on a write.

### Rules

Triggers (closed set):

`status.running`, `status.idle`, `run.succeeded`, `run.failed`, `run.interrupted`,
`waiting.permission`, `waiting.form`, `created`, `idle.for`.

Conditions (closed set, all cheap):

| Type | Operators |
| --- | --- |
| `directory` | `prefix`, `eq` |
| `project` | `eq` (project id) |
| `title` | `contains`, `matches` (literal, case-insensitive) |
| `agent` | `eq` |
| `root` | is true |
| `cost` | `gt` |
| `idleMinutes` | `gt` |

Actions: `move`, `pin`, `notify`. Archiving is never a rule action.

Semantics:

- Rules evaluate on their trigger events in ascending `priority`; the first matching rule per session
  wins for that event.
- An action applies at most once per `(ruleID, sessionKey, eventID)`, recorded in
  `lastRuleEventID`. This makes concurrent evaluation across plugin instances harmless.
- A placement with `source: "manual"` or `pinned: true` is skipped unless the rule sets
  `overrideManual`. An agent's own placement (`source: "agent"`) is movable, like `auto`.
- Board-originated moves never re-enter the engine.
- Archived and deleted sessions are never moved, and neither is a fork whose root is archived.
- `cooldownMs` bounds repeat firings per session (for example a flapping retry loop).
- **Dry run** (`rules.preview`) lists what would move now and applies nothing.
- `notify` emits an RPC `notify` event; the first window to handle the id shows a toast and, when the
  window is unfocused, a system notification through `ctx.attention.notify({ title, session, id })`
  (`title` is required; `id` dedupes across windows).

Starting an agent is a user action, not a rule action. A rule-driven prompt would cost tokens on
every event and could loop; a user move is bounded because it needs a person, and the session is
skipped while it is already running or waiting. Rule actions stay `move`, `pin`, and `notify`.

### Tools

Registered by the server part, namespace `kanban`, `codemode: true`. Effective names are
`kanban_list`, `kanban_get`, and so on.

| Tool | Input | Permission |
| --- | --- | --- |
| `kanban_list` | `{ column?, project?, status?, text?, includeSubagents? }` | none |
| `kanban_get` | `{ sessionID }` | none |
| `kanban_move` | `{ sessionID, column }` | none |
| `kanban_pin` | `{ sessionID, pinned }` | none |
| `kanban_clear_manual` | `{ sessionID }` | none |
| `kanban_archive` | `{ sessionID, archived }` | `kanban.archive` |
| `kanban_fork` | `{ sessionID, column? }` | `kanban.fork` |
| `kanban_create_session` | `{ directory, title?, prompt?, column }` | `kanban.prompt` when the task runs immediately |
| `kanban_list_rules` | — | none |
| `kanban_set_rule` | rule patch, or `{ id, remove: true }` | `kanban.rules` |
| `kanban_preview_rules` | — | none |

- `sessionID` accepts `"me"`, resolved from the tool call's own `context.sessionID`.
- Tools call the same server operations as the RPC handlers, so every tool works with no window open.
- `kanban_list` derives `running` and `waiting` from the plugin's own event stream: the server has no
  session-status query, so a session that changed state before the server started reads `idle` until
  its next event, and a session waiting on a form is not visible server-side.
- `kanban_fork` reports that the server session API of this build has no fork call; the board's
  **Fork…** action is the v1 path.
- `kanban_archive` verifies `time.archived` after the update. A server build that ignores the flag
  returns a failure message instead of a false success.
- `kanban_move` sets `source: "manual"`. Unknown column or session returns a clear tool message rather
  than throwing.
- Tools work with the panel closed; no window has to be open.

Settings page:

- Columns (default set: `Backlog · In progress · Waiting · Done · Failed`), default column, archived
  behaviour, idle minutes, and rule notifications (on by default).
- Rule list with priority, enable toggle, inline editor, and a dry-run button.
- Reset board, and export/import the JSON document (cheap support path).

## Milestones

**M0 — spike (half a day).** Prove the load-bearing assumptions before writing UI:

1. Two project instances share one `board` document.
2. An RPC registered in one location is callable from a window whose session is in another.
3. A panel at `width` 900 renders and accepts native DnD inside it.
4. The GUI bundle loads from a local package with `vite build --watch`.

Exit criteria: all four observed in the running app. If RPC routing fails, stop and re-plan before M1.

**M1 — read-only board.** Bootstrap, derived state, filters, header chip, empty/error/stale states,
panel and dialog hosts.

**M2 — placements.** DnD, keyboard "Move to…", card actions including fork, persistence, revision
guard, multi-window sync.

**M3 — rules.** Engine, settings editor, dry run, notifications.

**M4 — tools.** Contract, permissions, `me` alias, tool message quality.

**M5 — polish.** i18n, reduced motion, narrow-screen behaviour, reset/export, QA matrix.

## Verification

Unit tests (pure modules, no desktop app):

- Placement reducer: move, reposition, rebalance, column delete, prune.
- Rule evaluation: precedence, first-match, manual override, dedupe by event id, cooldown, dry run.
- Migrations: unknown version refuses to write.
- Status derivation: idle/running/waiting/failed/interrupted/archived.
- Card classification: root, fork, and subagent, including a fork with a parent that is also a fork.
- Fork visibility: archived root, deleted root, and a chain of forks.

Manual QA matrix in Desktop:

| Dimension | Values |
| --- | --- |
| Projects | two projects with sessions |
| Sessions | running, waiting on a permission, failed run, idle, a fork |
| Windows | 1200 px and 700 px wide |
| Panel | `narrow`, wide, side and bottom placement, mobile view |
| Theme | light and dark |
| Multi-window | change in one window appears in the other within a second |
| Lifecycle | reload app, disable plugin, delete a session, archive a session, archive or delete a fork's root |
| Surfaces | panel, quick-board dialog from Home, command, launcher, header chip |

Acceptance: no layout overflow at 700 px; every drag has a keyboard equivalent; a stopped server shows
the stale banner and recovers without a reload; rules never move a manually placed card.

## Risks

- **Experimental GUI API.** Panels, slots, and stores may change between desktop releases. Pin the
  tested build, keep GUI-specific code thin, and put logic in `core/`.
- **Per-location plugin instances.** The docs imply one instance per location. The design is
  stateless over shared storage and deduped by event id, so this is safe by construction, but it must
  be confirmed in M0.
- **RPC registration and routing across instances** are unverified. This is the M0 gate.
- **Idle-duration rules** depend on the 30 s tick and on `time.updated` semantics. Verify that a
  session that is waiting for input reports the timestamp the rule expects.
- **No E2E harness for GUI plugins.** Budget manual QA per milestone; do not claim UI verification
  from unit tests.

## Resolved questions

The three questions from the previous revision are settled and folded into the decisions above:

1. A fork inherits the source card's column.
2. A fork follows its root: the same archived or deleted status as its root session.
3. Rule notifications are on by default.
