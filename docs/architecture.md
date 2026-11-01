# Architecture

## Purpose and boundaries

Tessera is a **library**, not an application. It owns:

- the layout document and its invariants,
- the layout maths for adding, moving, resizing and compacting tiles,
- the arrange-mode draft lifecycle,
- per-widget configuration merging and validation,
- presentation of tiles and their accessibility hooks.

It deliberately does **not** own:

- widget implementations (the host supplies `WidgetDef.component`),
- authentication, authorisation or tenancy,
- HTTP, databases or cache invalidation (the host supplies `LayoutAdapter`),
- a design system (the package is unstyled),
- routing or page composition.

The boundary is visible in the C4 views: the host application and its layout
API are external systems, and Tessera sits between them as a React component
and hook library. See the [C4 model](./c4/README.md) and the
[save/conflict sequence diagrams](./plantuml/README.md).

## Module map

```text
src/
  index.ts                 public entry point; re-exports the API and CSS
  types.ts                 shared contracts (config, instances, adapter, widgets)
  layout.ts                pure layout maths, migration, normalisation, validation
  arrange.ts               pure move/resize/nudge/diff/merge/save-at-breakpoint
  useDashboardLayout.ts    React state: load, draft, save, conflict, config merge
  components/
    Grid.tsx               CSS grid, pointer/keyboard arranging, drop preview
    Tile.tsx               card shell, config validation, Suspense
    ErrorBoundary.tsx      per-tile error isolation
  tessera.css              optional default styling
```

Dependency direction is deliberately one-way:

```text
index.ts
  ├─ components/Grid.tsx ──> arrange.ts ──> layout.ts ──> types.ts
  ├─ components/Tile.tsx ──> types.ts
  ├─ useDashboardLayout.ts ─> arrange.ts, layout.ts, types.ts
  └─ types.ts

layout.ts imports zod; everything else is React-only where it needs to be.
```

The layout core has no React dependency. That is what makes it usable on a
server for validation, migration and read-only previews, and what makes the
seeded fuzz test possible without a DOM.

## Read path

```text
LayoutState.layout
  └─ layoutFor(layout, specs, config, breakpoint, defaultItems)
       ├─ coerceLayout / migrateLayout        v1 -> v2
       ├─ normaliseLayout(primary)            invariants on the primary layout
       ├─ primary breakpoint?  ──────────────> return primaryItems
       ├─ saved non-primary?  ─ reconcileItems (keep positions, sync identity)
       └─ otherwise           ─ flowInto -> firstFreeSlot -> normaliseLayout
  └─ applyWidgetConfig(items, specs)           merge defaults + Zod parse
  └─ Grid / Tile                               render
```

`layoutFor` is deterministic and does not mutate its input. The hook memoises
it on `saved?.layout`, `specs`, `config`, `breakpoint.name` and `defaultItems`.

## Write path

```text
Grid pointer / keyboard
  └─ moveTo / resizeTo / nudge          pure, pinned normalisation
  └─ onChange -> setDraft
  └─ save(version)
       └─ withBreakpoint(...)           instance set + per-breakpoint positions
       └─ adapter.save(layout, version) compare-and-set at the host boundary
            ├─ accepted -> setSaved, clear draft
            └─ conflict -> setConflict, keep draft
                 └─ resolveConflict('mine')
                      ├─ layoutFor(theirs)
                      ├─ mergeInstanceChanges(base, mine, theirs)
                      └─ save merged against theirs.version
```

The primary breakpoint is the single source of truth for the instance set and
config. A write from any breakpoint is translated into a diff against the
primary layout, then every saved breakpoint is reconciled. This avoids the
classic bug where arranging on mobile deletes a widget that only existed on
desktop.

## Key design decisions

### Pure layout core

`layout.ts` and `arrange.ts` are pure functions over plain objects. They do not
read the DOM or React state. Benefits:

- server-side validation and migration use exactly the same code as the client,
- the algorithms are unit-testable and fuzz-testable,
- a host can build a read-only renderer or a different UI without the hook.

### Normalise on read, validate at the edge

Normalisation is *reparative*: unknown types are dropped, duplicates removed,
sizes clamped, overlaps pushed down, gaps compacted. It is safe to run on
untrusted or stale input and keeps the UI renderable.

Validation is *rejective*: `validateLayoutBounds` and `createLayoutSchema`
report a stale client or a malformed request. A server should validate before
persisting; the client normalises before rendering. Keeping the two separate
means a stale client cannot corrupt a layout, while a slightly out-of-date
layout still renders instead of blanking the dashboard.

### Drafts, not optimistic writes

The saved state is only replaced after the adapter accepts the write. Failed
saves leave the saved layout untouched; `status` explains the failure. This is
important for compare-and-set persistence: an optimistic UI would show a state
that was never stored.

### Conflict merge instead of last-write-wins

A conflict response carries the other tab's full state. `resolveConflict('mine')`
computes a three-way diff between the local base, the local draft and the other
state. It starts from the other state and applies only local changes. This
preserves unrelated edits made by the other tab. If both tabs changed the same
tile, the local change wins and normalisation resolves any geometric collision.

### Unstyled with explicit hooks

The grid places tiles with inline grid properties; visual styling is opt-in via
`tessera.css` or the host stylesheet. Every meaningful element has a stable
`data-tessera-*` attribute. This keeps the package usable inside an existing
design system without CSS specificity fights. `prefers-color-scheme` is
deliberately not used: a light host theme should not turn dark because the OS
is dark.

### Per-tile failure isolation

A widget is arbitrary host code. `TileErrorBoundary` and `Suspense` ensure one
crashing or suspending widget becomes one broken or loading card, not a blank
dashboard. A config change (`resetKey`) clears a previous error so the user can
recover by fixing the widget settings.

### Bounded work

All placement algorithms are bounded:

- `firstFreeSlot` scans at most `MAX_LAYOUT_ROWS` rows and returns
  `RangeError` past the cap,
- `normaliseLayout` resolves overlaps by moving tiles down within the finite
  set of tiles,
- `maxItems` / `maxRows` bound the payload at the schema edge.

This prevents a malformed layout from turning into an unbounded loop.

### Stable effect inputs

React effects must not depend on values the host recreates on every render.
The hook has three protections:

- `initial` is read once at mount; it is not an effect dependency, so passing
  an inline state object cannot trigger a reset loop.
- the initial adapter load runs once on mount; an inline `adapter` object cannot
  turn `load -> setSaved -> render` into a loop. Later refreshes go through the
  tab-visibility effect or `replaceSaved`.
- `defaultItems` defaults to a module-level empty array rather than a fresh
  `[]` on every render.

Hosts should still memoise `config`, `specs` and `adapter` where practical; it
reduces re-computation and effect churn even though it is no longer required
for correctness of the initial load.

## Trust boundaries

| Boundary | Input | Defence |
| --- | --- | --- |
| Adapter -> hook | `LayoutState` from the network | `layoutFor` normalises; `applyWidgetConfig` validates each config |
| Host -> `Grid` | `items`, `widgets` | Unknown types are skipped; sizes are clamped |
| Widget config | `item.config` | Zod schema, fallback to defaults, visible reset notice |
| Server endpoint | JSON layout | `createLayoutSchema` + `validateLayoutBounds` before persisting |
| Widget render | Host component | Error boundary + Suspense per tile |

The adapter's `version` is opaque; Tessera never interprets it. Compare-and-set
enforcement belongs to the host, because only the host knows its storage
semantics (row version, ETag, revision number, …).

## Performance characteristics

- Normalisation is `O(n²)` in the number of tiles because each tile checks the
  placed set. With the default `maxItems` of 100 this is small and predictable.
- `firstFreeSlot` scans rows and columns; the row cap bounds the worst case.
- The grid uses CSS grid placement rather than absolute positioning, so the
  browser handles layout and resizing.
- The hook memoises derived layouts and config application.
- There is no virtualisation. The item/row caps are the intended guard for very
  large dashboards.

## Testing strategy

- `test/layout.test.ts` covers migration, bounds, normalisation, breakpoint
  reconciliation, validation and a seeded 500-run fuzz over random layouts. The
  fuzz checks idempotence, no overlap, unique ids and bounds.
- `test/arrange.test.ts` covers keyboard and pointer moves, swaps, edge cases,
  per-widget bounds and primary-breakpoint propagation.
- `test/useDashboardLayout.test.tsx` covers config merging, fallback on invalid
  config, conflict merge and per-breakpoint reset.
- `test/ErrorBoundary.test.tsx` covers recovery and reset-key behaviour.

CI runs `pnpm typecheck`, `pnpm test`, `pnpm build` and the diagram check on
Node 22. See [Development](./development.md).

## Known limitations

- Only rectangle layouts are supported; there is no free-form canvas.
- Tiles cannot span across breakpoints with different column counts; each
  breakpoint stores its own rectangle.
- There is no built-in undo/redo history; the draft is a single snapshot.
- The default grid does not virtualise large dashboards.
- Server rendering needs a deterministic `viewport` prop to avoid a first-render
  mismatch; `useViewport` falls back to the primary breakpoint when
  `matchMedia` is unavailable.
