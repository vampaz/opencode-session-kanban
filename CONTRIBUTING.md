# Contributing

## Requirements

- macOS, to exercise the desktop surfaces
- Node 22 or newer (`.nvmrc` pins the major)
- OpenCode 2.3.0 or newer

## Setup

```sh
npm ci
```

`npm ci` runs the `prepare` script, which builds `dist/gui-experimental.cjs`.

Load the checkout from the global configuration. OpenCode reloads it without a restart.

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": ["/absolute/path/to/opencode-session-kanban"],
}
```

Rebuild the desktop part while you work:

```sh
npm run dev:gui
```

A rebuild reloads the GUI in every window. The server part restarts with the plugin.

## Checks

Run these before you open a pull request. CI runs the same list.

```sh
npm run lint       # oxlint
npm run format     # oxfmt --check
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build:gui  # vite build
```

Tests live next to the code they cover as `[fileName].spec.ts`. Run one file with:

```sh
npm run test -- src/core/board.spec.ts
```

## What to test

`src/core/` is pure and free of Node, Solid, and `@opencode/plugin` imports, so it runs in Vitest
without the desktop app. From M1 on, the placement reducer, the rule engine, migrations, derived
status, and card classification belong there.

Desktop changes need a manual check as well: open the panel at a wide and a narrow window width,
exercise the changed flow, and confirm loading, empty, error, and stale states. The GUI plugin API
is experimental, so record the OpenCode build you tested.

## Style

- TypeScript, ESM only.
- Single quotes, oxfmt formatting.
- Functions use the `function` keyword.
- Keep `src/core/` free of Node and Solid imports, because the server part and the GUI bundle share
  it.
- Do not commit `dist/`; CI and `prepare` build it.

## Commits

Conventional Commits with an imperative subject under 72 characters. Put the reason in the body.
