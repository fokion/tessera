# Development

## Toolchain

| Tool | Version |
| --- | --- |
| Node.js | 22 or newer |
| pnpm | 10 |
| React | 19 |
| TypeScript | 5.9 |
| Vite / Vitest | 7 / 4 |
| Zod | 4 |

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` runs the Vite library build (JavaScript + `tessera.css`) followed
by `tsc -p tsconfig.build.json` for declarations. Output goes to `dist/`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` over `src`, `test` and `vite.config.ts`. |
| `pnpm test` | `vitest run` in jsdom. |
| `pnpm test:watch` | Vitest watch mode. |
| `pnpm build` | Vite library build plus declaration emit. |
| `pnpm docs:diagrams` | Render every `.puml` file to `docs/diagrams/` with Docker. |
| `pnpm docs:check` | Syntax-check every `.puml` file without writing output. |

## Test layout

| File | Scope |
| --- | --- |
| `test/layout.test.ts` | Migration, normalisation, bounds, breakpoint reconciliation, validation, schema, seeded fuzz. |
| `test/arrange.test.ts` | Keyboard/pointer moves, swaps, edge cases, diffs and `withBreakpoint`. |
| `test/useDashboardLayout.test.tsx` | Config merging, invalid config fallback, save/conflict behaviour, per-breakpoint reset and inline-object stability. |
| `test/ErrorBoundary.test.tsx` | Error recovery and `resetKey`. |
| `test/fixtures.ts` | Shared config, specs and item helpers. |

The fuzz test is deterministic: a small linear congruential generator with seed
`42` produces the same 500 layouts on every run. When adding a new invariant,
add it to the fuzz loop so it is checked across random shapes, not only the
hand-written cases.

### Regression rules

- A test that renders the hook must pass stable objects for `initial`,
  `adapter`, `config`, `specs` and `defaultItems` when the test re-renders
  repeatedly. The hook no longer resets on an inline `initial`, but stable
  inputs keep tests fast and intention-revealing.
- Layout tests assert both the result and its invariants: `normaliseLayout`
  must be idempotent, and the output must have no overlaps and stay in bounds.
- When a bug involves an infinite update loop, add a bounded assertion (for
  example, a render count or a timeout) rather than relying on the test process
  being killed by the OOM killer.

## CI

`.github/workflows/ci.yml` runs on pushes to `main`/`master`, pull requests and
version tags:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build`
5. diagram syntax check

The publish job runs only for tags matching `v*` and publishes to GitHub
Packages with the workflow's `GITHUB_TOKEN`.

## Adding a widget

1. Add a `WidgetDef` with a unique `type`, `title`, `sizes`, `defaultConfig`
   and, when the widget has settings, a `configSchema`.
2. Export it from the host's widget registry.
3. Optionally provide `ConfigForm` for the host's settings dialog.
4. Add a fixture to `test/fixtures.ts` if the widget exercises layout behaviour
   that the existing fixtures do not cover.

The library never imports host widgets. It only receives them through `Grid`
and `useDashboardLayout`.

## Adding an export

1. Add the implementation to the relevant module (`layout.ts` for pure layout,
   `arrange.ts` for interactions, `useDashboardLayout.ts` for state).
2. Add the type or function to `src/index.ts`.
3. Document it in [API reference](./api-reference.md).
4. Add a test.

Keep the public surface small. Anything that does not need to be imported by a
host should stay internal.

## Adding a diagram

1. Add a `.puml` file to `docs/c4/` (C4 views) or `docs/plantuml/`
   (sequence/class/state/activity).
2. Give it a unique `@startuml <name>`.
3. Use `!include <C4/C4_Context>` etc. so the C4 standard library comes from
   the PlantUML installation rather than a network fetch.
4. Run `pnpm docs:check`, then `pnpm docs:diagrams`.
5. Link it from the relevant `README.md`.

## Release

1. Update `CHANGELOG.md`.
2. Bump `version` in `package.json`.
3. Commit, tag `vX.Y.Z`, push the tag.
4. The publish job builds and publishes to GitHub Packages.

The package is published to `https://npm.pkg.github.com` with restricted
access; consumers need the `@fokion` registry scope and a token.
