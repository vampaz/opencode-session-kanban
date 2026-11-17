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

## Verification

Load the checkout as above, then check the surfaces:

1. **Board.** Open a session and press `Cmd+Shift+B`, or run `Open session board` from the command
   palette or `/kanban`. The pinned **Session board** tab opens in the side region and lists the
   sessions of every project.
2. **Moving.** Drag a card onto another column, or onto a card to reorder it. Every card also has a
   **Move to…** menu, which is the keyboard and touch path; a failed write puts the card back.
3. **Cards.** Each card shows its title, project and subpath, status, last activity, agent, model, and
   run cost when the window has them. A fork carries a fork marker and sits under its root. Its menu
   opens, moves, forks, pins, archives, and copies the session ID.
4. **New session.** The **+** on a column header opens a small form: a project directory (the panel's
   project by default), an optional title, and an optional starter prompt.
5. **Filters.** Filter by text, project, and status, or switch on **Running or waiting only**. View
   preferences belong to the window, not the server, and one button clears them.
6. **Header chip.** The session header shows the `running · waiting` counts and opens the board. It
   shrinks to an icon when the title needs the room.
7. **Launcher and dialog.** The side region's **+** menu and New tab view list **Session board**. From
   Home the command opens the quick board in a dialog.
8. **States.** With no matches the board explains the filters; while the server is unreachable it
   keeps the last snapshot behind an offline banner and recovers without a reload.
9. **Narrow window.** At about 700 px the filters wrap and the columns scroll sideways without the
   page overflowing. On narrow screens the board is the panel's `mobile` view.

## License

MIT
