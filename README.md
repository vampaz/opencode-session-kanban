# OpenCode Session Kanban

An [OpenCode 2](https://opencode.ai/v2/docs/) plugin that puts your sessions on a shared board. Each
card is a live session: its title, project, status, and last activity follow the session without a
refresh control. Move cards by hand, or let rules move them when a run ends or a session waits for
you. The agent can read and move the board too.

Status: **pre-alpha, M0 spike**. The repository holds the scaffold only: tooling, the package
manifest, the RPC contract, and empty server and GUI entries. There is nothing to install and use
yet.

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

## License

MIT
