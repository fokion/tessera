# Changelog

## 0.3.1 — 2026-11-01

- "Keep mine" after a save conflict now replays the local instance, config and
  position changes on top of the other tab's layout instead of discarding its
  unrelated changes.
- Reset while arranging a non-primary breakpoint now derives that breakpoint
  from the current primary layout, so it no longer removes widgets from the
  primary dashboard.
- Test fixtures aligned with the v2 layout schema.
- `initial` is read once at mount and the adapter load runs once, so inline
  objects can no longer turn the hook into an infinite update loop.
- Added long-form documentation, a C4 model and PlantUML sequence, class,
  state and activity diagrams, with `docs:diagrams` / `docs:check` scripts.

## 0.3.0 — 2026-11-01

- Schema 2 with `migrateLayout` for home.portal v1 layouts.
- Per-breakpoint instance/config reconciliation.
- `firstFreeSlot` clamping and row cap.
- Widget config defaults/schema handling, error-boundary retry/reset and
  light-theme-safe CSS variables.

## 0.1.0 — 2026-11-01

- Initial extraction from `home.portal`'s dashboard engine.
- Instance-based items (`id`, `type`, `config`, `x`, `y`, `w`, `h`).
- Configurable breakpoints, columns, row height, gap and default max sizes.
- Widget registry with default/min/max sizes, config schema and config form.
- Pluggable `LayoutAdapter` with compare-and-set conflicts and reset.
- Arrange mode: pointer drag/resize, keyboard arrows, Shift+arrows resize,
  Escape cancel, pinned-tile overlap resolution and upward compaction.
- Unstyled components with `data-tessera-*` hooks and optional `tessera.css`.
- 500-run seeded layout fuzz plus arrange tests.
