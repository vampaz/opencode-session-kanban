# OpenCode Session Kanban

An [OpenCode 2](https://opencode.ai/docs/) plugin that puts every session on one board. A card is
a live session: its title, project, status, and last activity follow the session without a refresh
control. Move cards by hand or let rules move them when a run ends or a session waits for you. The
agent can read and move the board through its own tools.

Status: **v1 (0.1.0)**. The GUI plugin API is experimental; the package pins OpenCode 2.3.

## Features

- **Side panel `Session board`**: pinned in every session, its own width, with a `mobile` view at
  narrow window sizes.
- **Quick board dialog**: the same board from Home and drafts, where no session screen is up.
- **Command and slash command**: `Open session board` (`Cmd+Shift+B`) and `/kanban`.
- **Launcher**: the side region's **+** menu and New tab view list **Session board**.
- **Header chip**: `running · waiting` in the session header, opening the board and shrinking to an
  icon when the title needs the room.
- **Cards**: title, project and subpath, status badge, last activity, agent, model, and run cost.
  Forks carry a marker and group under their root. Subagents stay hidden unless the setting turns
  them on.
- **Filters**: text, project, status, and running-or-waiting only, stored per window.
- **Moving**: native drag and drop with an optimistic mirror, and a **Move to…** menu on every card
  for the keyboard and touch.
- **Card actions**: Open, Move to…, Fork…, Pin, Archive, Copy session ID.
- **New session**: from any column, with a project picker (the panel project by default, or any
  folder), a title, and a multi-line **Task**. Both buttons need the title and the task. **Create** keeps the card in the
  column with its title and task queued. **Create and start** (`Cmd+Enter`) sends the title and task
  to the new session's agent and moves the card to the first starting column. The board stays in
  view; the toast opens the session.
- **Two-way board**: each root and fork session gets a short board instruction in its model
  requests, so the agent moves its own card when its state changes (`source: agent`). Moving a card
  into a starting column starts the session: a queued task first, else the column's start message,
  else "Continue with this task." for a session that has run. Agent, rule, and tool moves never
  start anything.
- **Cards follow their runs**, on by default: the server moves a board card on its own run events, so
  a forgotten agent report cannot leave the board stale. A run that starts moves the card to In
  progress, a question for you moves it to In review (and back to In progress once you answer), a
  failure or interruption moves it to Failed, and a run that finishes while the card is still in a
  working column moves it to **Ready to deploy**. Only the
  agent or you move a card to **Done**, which means deployed. Cards you moved by hand or pinned
  stay put.
- **Sort sessions by state** in settings: a preview with counts per column, then one confirmed write
  that places unplaced cards (running → In progress, waiting → In review, finished → Ready to
  deploy, failed → Failed). Placed and pinned cards stay put.
- **Rules**: triggers on status, run outcome, waiting, creation, and idle time; conditions on
  directory, project, title, agent, root, cost, and idle minutes; actions `move`, `pin`, and
  `notify`. Rules run in priority order, skip manually placed cards unless they override them, never
  touch archived sessions, and dry-run with a button. Rule notifications show a toast, or a system
  notification when the window is unfocused.
- **Settings page `Session kanban`**: board defaults, agent self-reporting, columns (add, rename,
  recolour, reorder, delete, **Start the agent**, **Start message**), the one-time state sort, rule
  list with the inline editor and dry run, export, import, and reset.
- **Agent tools**: `kanban_list`, `kanban_get`, `kanban_move`, `kanban_pin`, `kanban_clear_manual`,
  `kanban_archive`, `kanban_fork`, `kanban_create_session`, `kanban_list_rules`,
  `kanban_set_rule`, `kanban_preview_rules`.

## Requirements

- OpenCode 2.3.0 or newer
- Node 22 or newer only to build from source

## Install

The package is not published yet. Install this checkout.

```sh
npm ci            # installs dependencies and builds the GUI bundle
```

Point the global configuration at the directory. OpenCode reloads configuration without a restart.

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": ["/absolute/path/to/opencode-session-kanban"],
}
```

Desktop loads GUI plugins from the global configuration, so use the global file to get the panel.

## Usage

- **Panel**: press `Cmd+Shift+B` in a session, or open the side region and pick **Session board**.
- **Quick board**: from Home or a draft, `Cmd+Shift+B` (or the command palette and `/kanban`) opens the same board in a dialog; in a session the same command opens the side panel.
- **Launcher**: the side region's **+** menu and New tab view list the board.
- **Header chip**: click the `running · waiting` chip to open the board.
- **Settings**: **Settings › Session kanban** for columns, rules, defaults, export/import, reset,
  and the one-time **Sort sessions by state**.
- **New session**: the **+** on a column header. **Create** keeps the card in that column with its
  title and task queued. **Create and start** (`Cmd+Enter`, or `Ctrl+Enter`) runs the agent on the
  title and task, then moves the card to the first starting column (default: In progress).
- **Start a session**: move its card into a starting column. The first move sends the queued task,
  or the column's start message for a session that has run before. A card that never ran and has no
  task is only placed.
- **Agent self-reporting**: on by default. Each model request of a card session is told its column and
  the state mapping, so the agent can move its own card to **Ready to deploy** when the work is done
  and to **Done** once it is deployed. Turn it off under **Agents update their card**.
- **Follow runs**: the built-in run sync above. Turn it off under **Cards follow their runs** when you
  want to place every card by hand.
- **Rules**: a rule moves, pins, or notifies; it never archives or prompts. Dry run lists what would
  move now.

### Agent tools

| Tool                    | Input                                                      | Permission                                     |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `kanban_list`           | `{ column?, project?, status?, text?, includeSubagents? }` | none                                           |
| `kanban_get`            | `{ sessionID }`                                            | none                                           |
| `kanban_move`           | `{ sessionID, column }`                                    | none                                           |
| `kanban_pin`            | `{ sessionID, pinned }`                                    | none                                           |
| `kanban_clear_manual`   | `{ sessionID }`                                            | none                                           |
| `kanban_archive`        | `{ sessionID, archived }`                                  | `kanban.archive`                               |
| `kanban_fork`           | `{ sessionID, column? }`                                   | `kanban.fork`                                  |
| `kanban_create_session` | `{ directory, column, title?, prompt? }`                   | `kanban.prompt` when the task runs immediately |
| `kanban_list_rules`     | —                                                          | none                                           |
| `kanban_set_rule`       | rule patch, or `{ id, remove: true }`                      | `kanban.rules`                                 |
| `kanban_preview_rules`  | —                                                          | none                                           |

`sessionID` accepts `"me"` for the calling session. `column` accepts a column id or title. Every
tool works with no window open, uses the server-side session API, and lists the valid column ids on
an unknown column. `kanban_move` records an `agent` placement, so rules may still move that card.

## Limits

- The GUI plugin API is experimental (`./gui-experimental`) and may change between OpenCode releases.
- **`kanban_fork` is not available from the server in OpenCode 2.3**: the server session API has no
  fork call. The tool reports this; use **Fork…** on the card in the desktop app.
- **`kanban_archive` may be unavailable from the server**: some 2.3 server builds accept the
  `archived` flag in `session.update` and ignore it. The tool verifies `time.archived` after the
  update and reports the limit instead of claiming success; use **Archive** on the card.
- **Status is event-fed**: the server has no session-status or form query, so the tools derive
  `running` and `waiting` from the plugin's event stream. A session that changed state before the
  server started reads `idle` until its next event, and a session waiting on a form is not visible
  to the server.
- **Listing caps**: the tools and the idle rules read at most 200 sessions per `session.list`
  call, and the desktop's fork bootstrap reads at most 5 pages (1000 sessions) to find forks whose
  root is not loaded yet. Sessions beyond those caps are not visible to the board until their
  family is loaded.
- Rules and movement only apply to sessions that render as cards (roots and forks; subagents only
  with `showSubagents`). Archived families are never moved.
- **Each start costs tokens.** Moving a card into a starting column sends one model request pair (the
  prompt and the reply), and the agent may run tools. A queued task is sent once. Starts are
  user-only, and a running or waiting session is skipped, but the cost is the session's normal cost.
- **Agent self-reporting depends on the model.** The instruction asks the agent to call
  `kanban_move`; a model may ignore it or choose a column badly. The setting only adds text; the
  board never guesses the agent's state.
- The sort never moves placed or pinned cards and never creates a placement for a session that never
  ran.
- Desktop only: the panel, dialog, chip, and notifications need the desktop app. The tools work
  wherever the server runs.

## Data and uninstall

The board document lives in plugin storage under the plugin id `kanban`, key `board`: columns,
placements, rules, and settings. Nothing leaves the machine; view preferences stay in the window.

To remove the plugin, remove the checkout path from `plugins` in `opencode.jsonc`; OpenCode reloads
it without a restart. The stored board stays in plugin storage until you reset it or clear the
plugin's storage.

## Development

```sh
npm ci            # installs dependencies and builds the GUI bundle
npm run lint      # oxlint
npm run format    # oxfmt --check
npm run typecheck # tsc --noEmit
npm test          # vitest
npm run build:gui # vite build
npm run dev:gui   # rebuild the GUI bundle on change
```

`src/core/` holds the pure logic shared by both parts: board document and placements, card status,
rules, events, and the write lock. `src/index.ts` is the server part, `src/engine.ts` the rules
engine, `src/operations.ts` the shared server operations behind the RPC and the tools, and
`src/gui.tsx` with `src/gui/` the desktop part. See [PLAN.md](PLAN.md) for the design.

## Manual QA checklist

Run against this checkout with the plugin in the global `opencode.jsonc`, and a scratch project
directory for throwaway sessions.

1. **Board and cards**: the panel opens at its width, lists sessions of several projects, and a card
   shows its title, project, status, agent, model, and cost without truncating short values.
2. **Moving**: drag a card between columns and within a column; then move one with **Move to…** from
   the keyboard. A failed write puts the card back.
3. **Actions**: Open focuses the session tab; Fork… adds a marked card beside its source; Archive
   hides the card; Copy session ID copies it.
4. **New session**: the column **+** opens the form with the column in its title. **Create** in
   Backlog shows **Task queued** and does not run; moving that card to In progress runs it, shows
   the start toast, and clears the task. **Create and start** in Backlog runs the agent on the title
   and task and moves the card to In progress. Both keep the board in view and toast an **Open**
   action.
5. **Rules**: a `created` rule places a new session; a manually placed (or pinned) card is skipped
   unless the rule overrides it; dry run lists moves without applying them; a rule notification shows
   a toast, or a system notification when the window is unfocused.
6. **Two-way moves**: the agent's own move shows `source: agent` in `kanban_get`; a card that never
   ran and has no task is only placed by a user move; an agent move into In progress sends nothing.
7. **Settings**: add, rename, recolour, reorder, and delete a column; set a start column and start
   message; edit a rule; sort preview shows counts and the confirmed sort places unplaced cards;
   export, import the same JSON (round-trips), and reset.
8. **States**: a failing snapshot shows the error state with Retry; a disconnected server keeps the
   last snapshot behind the stale banner and recovers without a reload.
9. **Narrow screen**: at about 700 px the filters wrap and the columns scroll sideways; opening a card
   closes the board.
10. **Themes**: the panel and dialog follow the app theme in light and dark; the running indicator stops
    moving with reduced motion on.
11. **Lifecycle**: deleting a session prunes its placement; archiving a root hides its forks; a GUI
    reload and a plugin disable/enable bring the board back without errors.

## License

MIT
