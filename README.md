# OpenCode Session Kanban

An [OpenCode 2](https://opencode.ai/v2/docs/) plugin that puts your sessions on a shared board. Each
card is a live session: its title, project, status, and last activity follow the session without a
refresh control. Move cards by hand, or let rules move them when a run ends or a session waits for
you. The agent can read and move the board too.

Status: **pre-alpha, M0 spike**. The repository holds the M0 spike: tooling, the RPC contract, a
shared board document in plugin storage, and a minimal board in a side panel and dialog. It exists to
check the desktop plugin API, not to manage work yet.

## Requirements

- OpenCode 2.3.0 or newer
- Node 22 or newer only when you build from source

## Local install

After `npm ci && npm run build:gui`, point the global configuration at this checkout. OpenCode
reloads configuration without a restart.

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": ["/absolute/path/to/opencode-session-kanban"],
}
```

Desktop loads GUI plugins from the global configuration, so use the global file to get the panel.
The path is the checkout on the machine that runs Desktop.

## Development

```sh
npm ci            # installs dependencies and builds the GUI bundle
npm run lint      # oxlint
npm run format    # oxfmt --check
npm run typecheck # tsc --noEmit
npm test          # vitest
npm run dev:gui   # rebuild the GUI bundle on change
```

`src/core/` holds the pure, unit-tested logic shared by the server part and the GUI. `src/index.ts`
is the server part, `src/rpc.ts` is the contract between the two, and `src/gui.tsx` with
`src/gui/` is the desktop part. See [PLAN.md](PLAN.md) for the design and the milestones.

## M0 verification

The spike exists to observe four assumptions in the running app. Run it against this checkout, a
global `plugins` entry as above, and at least two projects.

1. **Build and watch the bundle.** Start `npm run dev:gui` in one terminal. It rebuilds
   `dist/gui-experimental.cjs` on every source change.
2. **Load the plugin.** Open Desktop, then open the board with `Cmd+Shift+B` (or
   `Open session board` in the command palette). A session is required for the side panel; from Home
   the same command opens the quick-board dialog.
3. **One board, two projects.** Open a session in project A and another in project B. Move a card in
   one window, then close and reopen the board in the other: the card is in the same column and the
   revision is the same. Both windows read the single `board` key. Where the event stream works, the
   other window updates without reopening.
4. **RPC across locations.** The footer shows `Served by <instance> · pid <pid>` and the serving
   `Directory`, next to `Routed session directory`. With the two sessions in different projects the
   two directories differ: the window called an instance set up for another location.
5. **Panel and drag and drop.** The board opens in the side region at its own ~900 px width. Drag a
   card onto another column, then close and reopen the board: the card stays there. The server log has
   one `[kanban] server part ready` line per location, each with its own directory.
6. **Watch mode.** Edit `src/gui/board.tsx` while `npm run dev:gui` runs. The panel reloads with the
   change after the rebuild.

`whoami` and the footer are spike-only. They go away in M1 with the rest of the diagnostics.

## License

MIT
