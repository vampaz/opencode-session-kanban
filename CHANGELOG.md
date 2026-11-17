# Changelog

## Unreleased

### Added

- The package manifest, TypeScript, Vite, Vitest, oxlint, and oxfmt configuration.
- The RPC contract with `snapshot`, `move`, and the spike-only `whoami`, plus the `changed` event.
- The board document in plugin storage: default columns, a bounded revision guard, and a pure
  placement reducer with fractional positions, all unit-tested.
- A side panel at `width: 900` with drag and drop between columns, the `kanban.open` command, and a
  quick-board dialog.
- An M0 verification section in the README and the 2.3.0 API corrections in the plan.
- CI for lint, format, typecheck, tests, and the GUI build.
