# Changelog

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
