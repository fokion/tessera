# Concepts

Tessera separates **what a widget is** from **where an instance sits**. Almost
every rule in the package follows from that split.

## Definitions vs instances

| Concept | Type | Owned by | Example |
| --- | --- | --- | --- |
| Widget definition | `WidgetDef` | The host application | "Allocation" chart, its config schema, sizes, component |
| Widget layout spec | `WidgetLayoutSpec` | The host application | The subset the layout engine needs: `type`, `sizes`, `minSize`, `maxSize` |
| Widget instance | `LayoutItem` | The saved layout | `{ id: 'a1', type: 'allocation', config: { topN: 10 }, x: 0, y: 0, w: 2, h: 2 }` |
| Dashboard layout | `DashboardLayout` | The adapter / database | `{ schema: 2, breakpoints: { lg: [...], md: [...] } }` |
| Persistence state | `LayoutState` | The adapter | `{ layout, version, updatedBy, updatedAt }` |

A definition can appear many times as instances. `id` identifies the instance;
`type` points at the definition. Removing a definition from the registry makes
its saved instances invisible: `normaliseLayout` drops unknown types rather
than rendering an empty card.

## Breakpoints

```ts
const config: DashboardConfig = {
  breakpoints: [
    { name: 'lg', columns: 4, minWidth: 1024 },
    { name: 'md', columns: 2, minWidth: 640 },
    { name: 'sm', columns: 1, minWidth: 0 },
  ],
};
```

Breakpoints are ordered **widest first**. The first entry is the **primary**
breakpoint. It is the source of truth for:

- which instances exist,
- each instance's `type` and `config`.

Every breakpoint owns its own `x`, `y`, `w` and `h`. When a non-primary
breakpoint has never been arranged, `layoutFor` derives it from the primary
reading order with `flowInto`: tiles are packed into the narrower grid by
`firstFreeSlot`, then normalised.

When a non-primary breakpoint *has* been arranged, `reconcileItems` keeps its
positions and sizes but:

- drops ids that are no longer in the primary layout,
- copies `type` and `config` from the primary instance,
- appends primary instances the breakpoint has not seen yet.

This makes adding, removing and reconfiguring a widget work identically from
any breakpoint.

## The layout document

The persisted document is versioned:

```json
{
  "schema": 2,
  "breakpoints": {
    "lg": [
      { "id": "allocation", "type": "allocation", "config": { "topN": 10 }, "x": 0, "y": 0, "w": 2, "h": 2 }
    ],
    "md": []
  }
}
```

`schema` is the literal `2` (`LAYOUT_SCHEMA`). Version 1, used by the original
`home.portal` dashboard, stored `{ cell, x, y, w, h }`. `migrateLayout` upgrades
it by mapping `cell` to both `id` and `type` and giving it an empty config.
`coerceLayout` returns a v2 layout unchanged, upgrades a v1 layout, and returns
`null` for anything else.

## Normalisation

`normaliseLayout(items, specs, columns, { pin }, config)` is the invariant
keeper. It is used when loading, rendering, arranging and saving, so every
consumer sees the same repaired layout. In order:

1. **Drop** instances whose `type` is not in the registry, and duplicate ids
   (first occurrence wins).
2. **Clamp** each size to the widget's `minSize` / `maxSize` and the grid
   width. A tile can never be wider than the breakpoint.
3. **Clamp** `x` into `[0, columns - w]` and `y` to `>= 0`.
4. **Resolve overlaps** in reading order. A colliding tile moves down one row at
   a time until it is free.
5. **Swap** when the moved tile is pinned: the pinned tile is placed first; a
   tile it lands on first tries the space immediately above the pinned tile, so
   dragging a tile onto its neighbour swaps them instead of being undone by
   compaction.
6. **Compact upwards** so no tile has an empty row above it.
7. **Sort** in reading order (`y`, then `x`, then `id`).

Normalisation is deterministic and idempotent: normalising an already
normalised layout is a no-op. The seeded 500-run fuzz test in
`test/layout.test.ts` checks idempotence, absence of overlaps, unique ids and
bounds on random inputs.

### Reading order

```ts
byReadingOrder(a, b) = a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)
```

Reading order is the order a person sees the tiles: top to bottom, left to
right, with the id as a stable tie-breaker. It is used for overlap resolution,
compaction, `readingOrder()` and the non-arranging DOM order.

### Pinned tiles

`normaliseLayout` accepts `{ pin: itemId }`. The pinned tile keeps the position
the person chose; tiles it lands on move out of the way. `moveTo`, `resizeTo`
and `nudge` use this internally so a pointer drag or keyboard step behaves the
way the person expects.

## Default layout

`defaultLayout(items, specs, columns, config)` is just
`normaliseLayout(items, specs, columns, {}, config)`. Hosts provide the initial
instances through `defaultItems`; they are only used when the adapter has no
stored layout (or the stored layout has no entry for the primary breakpoint).

## Arrange mode and the draft

The hook keeps two layouts:

- `saved` — the last layout accepted by the adapter (or the initial state),
- `draft` — a working copy. `arranging` is `draft !== null`.

All mutations happen on the draft. Saving is explicit:

```ts
start();          // savedItems -> draft
setDraft(next);   // Grid pointer / keyboard preview
save();           // draft -> withBreakpoint -> adapter.save
cancel();         // discard draft
resetDraft();     // replace draft with the default flow
```

`addItem`, `removeItem` and `updateItemConfig` create a draft automatically if
one does not exist. `status` reports `idle`, `saving` or `error`. The saved
layout is only replaced after the adapter accepts the write, so a failed save
never silently changes what the user sees on the next load.

## Arranging interactions

`Grid` supports two input paths:

- **Pointer**: pointer down on the move handle or the resize corner captures
  the pointer. `cellsFromPointer` converts pixel deltas into whole grid cells;
  `moveTo` / `resizeTo` produce a preview. The preview is committed on pointer
  up.
- **Keyboard**: arrows move by one cell, Shift+arrows resize, Escape cancels.
  `nudge` returns `null` at a boundary so the grid can announce that the tile
  cannot move further.

Every move is announced through the host's `announce` callback. The default
`describeItem` message reads like "Calendar, column 3, row 1, 2 by 3."

## Persistence and conflicts

`LayoutAdapter` has three operations:

```ts
interface LayoutAdapter {
  load(): Promise<LayoutState>;
  save(layout: DashboardLayout, version: number): Promise<LayoutSaveResult>;
  reset(version: number): Promise<LayoutSaveResult>;
}
```

`version` is opaque to Tessera. The host's adapter is responsible for
compare-and-set semantics. A rejected write returns:

```ts
interface LayoutConflict<S = LayoutState> {
  conflict: true;
  current: S;
}
```

The hook stores `current` as `dashboard.conflict` and keeps the draft.

### Conflicts and three-way merge

`resolveConflict('theirs')` adopts the other layout and discards the draft.

`resolveConflict('mine')` performs a three-way merge:

1. `savedItems` is the **base** — what this tab started from.
2. `draft` is **mine** — the local changes.
3. `layoutFor(conflict.layout, …)` is **theirs** — what the other tab saved.

`mergeInstanceChanges(base, mine, theirs, specs, config, columns)`:

- starts from *theirs*,
- drops instances removed locally,
- applies local config changes and local positions/sizes,
- appends instances added locally,
- normalises the result.

The merged layout is then saved against *their* version. Because the primary
breakpoint owns the instance set, `withBreakpoint` applies the same diff to the
primary layout and reconciles every other saved breakpoint. Unrelated changes
from the other tab survive; collisions are resolved by normalisation.

### Reset semantics

`reset()` clears the adapter's saved state. `resetDraft()` replaces only the
current breakpoint's draft:

- on the primary breakpoint it uses `defaultLayout(defaultItems, …)`;
- on another breakpoint it flows the *current primary layout* into that
  breakpoint's columns, so widgets added on another breakpoint are not removed
  when the reset draft is saved.

## Widget configuration

A widget can declare:

- `defaultConfig` — merged into every stored instance,
- `configSchema` — a Zod schema used to validate the merged config.

`applyWidgetConfig` and `configFor` merge defaults and parse the result. When
the stored config is invalid, the widget falls back to its defaults and the
tile renders a `data-tessera-config-reset` notice instead of crashing. The
same fallback applies when `addItem` receives an invalid config override.

## Error isolation

`Tile` wraps each widget component in `TileErrorBoundary` and `Suspense`:

- a crashing widget becomes one broken card with a Retry button,
- a changed `resetKey` (the serialised config) clears a previous error,
- a suspended widget shows the `data-tessera-skeleton` placeholder.

The host can supply its own error UI by rendering a custom `Tile`; the default
grid uses `TileErrorBoundary` internally.

## Limits and validation

Two kinds of checks exist, for two different jobs:

- **Normalisation repairs** positions, overlaps and sizes. It is safe to run on
  any input and is what the render path uses.
- **Validation rejects** payloads that indicate a stale client or a bad
  request. `validateLayoutBounds` reports unknown widget types, duplicate ids,
  sizes outside a widget's bounds, unknown breakpoints and tiles past the grid
  or row limit. `createLayoutSchema(config)` is the Zod shape check for an HTTP
  boundary.

Limits:

| Constant / option | Default | Meaning |
| --- | --- | --- |
| `MAX_LAYOUT_ITEMS` / `config.maxItems` | 100 / unset | Maximum instances per breakpoint |
| `MAX_LAYOUT_ROWS` / `config.maxRows` | 500 / unset | Maximum row index, and the `firstFreeSlot` search cap |
| `config.maxRows` | unset | Optional global row limit |
| `BreakpointConfig.maxRows` | unset | Optional per-breakpoint row limit |

`firstFreeSlot` throws `RangeError` when it cannot find a slot within the row
cap; `addItem` catches that and returns `null` instead of hanging or growing
without bound.

## Server-side rendering

`useViewport` falls back to the primary breakpoint when `window` or
`matchMedia` is unavailable, so the hook is safe to render on the server. Pass
a known `viewport` to make the first client render match the server render.
Pass `initial` to skip the adapter load; it is read once at mount, and
`replaceSaved` is the explicit way to hand the hook a newer state later.
