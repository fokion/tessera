# API reference

Everything documented here is exported from `@fokion/tessera` unless noted
otherwise. Type-only exports are marked with `type`.

## Components

### `<Grid>`

Renders the CSS grid and, while `arranging` is true, the move handles, resize
corners, grid guides and drop preview.

```ts
interface GridProps {
  items: LayoutItem[];
  widgets: readonly AnyWidgetDef[];
  config: DashboardConfig;
  viewport: string;
  arranging: boolean;
  onChange: (items: LayoutItem[]) => void;
  announce: (message: string) => void;
  onConfigure?: (item: LayoutItem) => void;
  onRemove?: (item: LayoutItem) => void;
}
```

| Prop | Description |
| --- | --- |
| `items` | Instances to render. Usually `dashboard.items`. |
| `widgets` | Widget definitions. Instances of unknown types are skipped. |
| `config` | Breakpoints and grid metrics. |
| `viewport` | Active breakpoint name. |
| `arranging` | Shows arrange controls and makes the tile body inert. |
| `onChange` | Called with the previewed layout after a pointer drop or keyboard step. Usually `dashboard.setDraft`. |
| `announce` | Screen-reader message sink. Called after moves, resizes and cancelled drags. |
| `onConfigure` | Adds a settings button to every tile header. |
| `onRemove` | Adds a remove button to every tile header. |

`Grid` renders `<main data-tessera-grid>` with inline `display: grid`,
`grid-template-columns: repeat(columns, minmax(0, 1fr))`, `grid-auto-rows` and
`gap`. It uses `readingOrder` for the DOM order outside arrange mode and keeps
the DOM order stable while arranging so focus follows the tile.

### `<Tile>`

One card: header, widget body, optional controls. Most hosts use `Grid` and do
not render `Tile` directly.

```ts
interface TileProps {
  item: LayoutItem;
  widget: AnyWidgetDef;
  index: number;
  style?: CSSProperties;
  arranging?: boolean;
  lifted?: boolean;
  controls?: ReactNode;
  onConfigure?: (item: LayoutItem) => void;
  onRemove?: (item: LayoutItem) => void;
}
```

`Tile` merges `widget.defaultConfig` with `item.config`, validates the result
with `widget.configSchema`, and falls back to defaults when validation fails.
It wraps the widget in `TileErrorBoundary` and `Suspense`.

### `<TileErrorBoundary>`

```ts
interface TileErrorBoundaryProps {
  title: string;
  children: ReactNode;
  /** Change this (for example, the serialised config) to clear an error. */
  resetKey?: string;
}
```

Renders `data-tessera-error` with a Retry button when a child throws. The
`resetKey` change clears a previous error.

## Hooks

### `useDashboardLayout(options)`

Owns saved state, the arrange draft, the save status and conflict resolution.

```ts
interface UseDashboardLayoutOptions {
  specs: readonly WidgetSpecWithConfig[];
  config: DashboardConfig;
  adapter: LayoutAdapter;
  defaultItems?: readonly LayoutItem[];
  initial?: LayoutState | null;
  viewport?: string;
}
```

`initial` is read once at mount. `undefined` means "load from the adapter";
`null` means "no saved layout, use `defaultItems`". Pass a stable object if the
host re-renders frequently. Use `replaceSaved` for later external updates.

Returned object:

| Field | Type | Description |
| --- | --- | --- |
| `items` | `LayoutItem[]` | Draft items while arranging, otherwise saved items, with config validated. |
| `savedItems` | `LayoutItem[]` | Saved items at the current breakpoint. |
| `draft` | `LayoutItem[] \| null` | Working copy, or `null` when not arranging. |
| `arranging` | `boolean` | `draft !== null`. |
| `breakpoint` | `BreakpointConfig` | Active breakpoint. |
| `viewport` | `string` | Active breakpoint name. |
| `available` | `boolean` | Saved state is known and not `null`. |
| `loaded` | `boolean` | Saved state is known (including `null`). |
| `saved` | `LayoutState \| null \| undefined` | Raw adapter state. |
| `status` | `SaveStatus` | `{ kind: 'idle' }`, `{ kind: 'saving' }` or `{ kind: 'error', message }`. |
| `conflict` | `LayoutState \| null` | The other tab's state after a rejected save. |
| `start()` | `void` | Copy `savedItems` into a draft. |
| `cancel()` | `void` | Discard the draft. |
| `resetDraft()` | `void` | Replace the current breakpoint's draft with its default flow. |
| `save(version?)` | `Promise<void>` | Save the draft. Defaults to `saved.version`. |
| `reset(version?)` | `Promise<void>` | Call `adapter.reset`. |
| `setDraft(items)` | `void` | Replace the draft; used by `Grid.onChange`. |
| `addItem(type, configOverride?)` | `LayoutItem \| null` | Create an instance in the first free slot. `null` for unknown types, item or row limits. |
| `removeItem(id)` | `void` | Remove from the draft (creating one if needed). |
| `updateItemConfig(id, config)` | `void` | Validate and update a config in the draft. |
| `resolveConflict(choice)` | `void` | `'theirs'` adopts the other layout; `'mine'` merges and retries. |
| `replaceSaved(state)` | `void` | Replace saved state and leave arrange mode. |

### `useViewport(config)`

Returns the name of the widest breakpoint whose `minWidth` matches
`window.matchMedia`. Falls back to the primary breakpoint when `window` or
`matchMedia` is unavailable. Subscribes to media-query changes and cleans up on
unmount.

### `applyWidgetConfig(items, specs)`

Merges each widget's `defaultConfig` into its items and validates with the
widget's `configSchema`. Invalid configs fall back to the widget defaults.

### `isLayoutConflict(value)`

Type guard for `LayoutSaveResult`: true when the adapter returned
`{ conflict: true, current }`.

## Layout core

All functions are pure and framework-free.

### Constants

| Export | Value | Description |
| --- | --- | --- |
| `LAYOUT_SCHEMA` | `2` | Current persisted schema version. |
| `MAX_LAYOUT_ROWS` | `500` | `firstFreeSlot` search cap and default row ceiling. |
| `MAX_LAYOUT_ITEMS` | `100` | Default maximum items per breakpoint. |

### Migration

```ts
migrateLayout(raw: unknown): DashboardLayout | null
coerceLayout(layout: DashboardLayout | LegacyDashboardLayout | null | undefined): DashboardLayout | null
```

`migrateLayout` upgrades v1 `{ cell, x, y, w, h }` items to v2
`{ id, type, config, x, y, w, h }`. It returns `null` for unknown objects. A
v2 layout passes through unchanged. `coerceLayout` is the convenience wrapper
used by the render path.

### Breakpoints and bounds

```ts
primaryBreakpoint(config: DashboardConfig): BreakpointConfig
breakpointByName(config: DashboardConfig, name: string): BreakpointConfig | undefined
widgetBounds(spec, config): { default: GridSize; min: GridSize; max: GridSize }
readingOrder(items: readonly LayoutItem[]): string[]
```

`primaryBreakpoint` is `config.breakpoints[0]`. `widgetBounds` uses
`sizes[0]` as the default, `minSize` or `{ w: 1, h: 1 }` as the minimum, and
`maxSize`, `config.defaultMaxSize` or the widest column count as the maximum.
`readingOrder` returns ids sorted by `byReadingOrder`.

### Geometry

```ts
overlaps(a: LayoutItem, b: LayoutItem): boolean
byReadingOrder(a: LayoutItem, b: LayoutItem): number
firstFreeSlot(
  placed: readonly LayoutItem[],
  base: Pick<LayoutItem, 'id' | 'type' | 'config'>,
  w: number,
  h: number,
  columns: number,
): LayoutItem
```

`overlaps` is half-open rectangle intersection. `firstFreeSlot` scans rows top
to bottom and columns left to right, clamps the requested width to `columns`,
and throws `RangeError` after `MAX_LAYOUT_ROWS`.

### Normalisation and defaults

```ts
normaliseLayout(
  items: readonly LayoutItem[] | undefined,
  specs: readonly WidgetLayoutSpec[],
  columns: number,
  options?: { pin?: string },
  config?: DashboardConfig,
): LayoutItem[]

defaultLayout(
  items: readonly LayoutItem[],
  specs: readonly WidgetLayoutSpec[],
  columns: number,
  config?: DashboardConfig,
): LayoutItem[]
```

See [Normalisation](./concepts.md#normalisation) for the full algorithm.
`defaultLayout` is normalisation without a pin.

### Breakpoint reconciliation

```ts
reconcileItems(
  items: readonly LayoutItem[],
  primaryItems: readonly LayoutItem[],
  specs: readonly WidgetLayoutSpec[],
  columns: number,
  config: DashboardConfig,
): LayoutItem[]

layoutFor(
  layout: DashboardLayout | LegacyDashboardLayout | null | undefined,
  specs: readonly WidgetLayoutSpec[],
  config: DashboardConfig,
  breakpointName: string,
  defaultItems?: readonly LayoutItem[],
): LayoutItem[]

normaliseDashboardLayout(
  layout: DashboardLayout | LegacyDashboardLayout,
  specs: readonly WidgetLayoutSpec[],
  config: DashboardConfig,
): DashboardLayout
```

`layoutFor` is the main read path: migrate, pick the primary or saved
breakpoint layout, then normalise or flow. `reconcileItems` enforces the
primary breakpoint's instance set and config on a non-primary layout.
`normaliseDashboardLayout` normalises every known breakpoint and drops unknown
ones.

### Validation

```ts
validateLayoutBounds(
  layout: DashboardLayout | LegacyDashboardLayout,
  specs: readonly WidgetLayoutSpec[],
  config: DashboardConfig,
): string | null

createLayoutSchema(config: DashboardConfig): ZodObject
```

`validateLayoutBounds` returns `null` when valid, otherwise the first problem as
a human-readable string. It checks unknown breakpoints and widget types,
duplicate ids, widget bounds, grid width and row limits. It expects positions
to be already normalised; overlap repair is not its job.

`createLayoutSchema` returns a strict Zod object schema:

```ts
{
  schema: 2,
  breakpoints: Record<string, LayoutItem[]>,
}
```

Item ids match `^[A-Za-z0-9][A-Za-z0-9_-]*$`, coordinates are integers, and
`config` is a record of unknown values. Unknown breakpoints and tiles wider
than the breakpoint's columns are rejected by a `superRefine`.

## Arrange operations

```ts
moveTo(items, specs, config, columns, id, x, y): LayoutItem[]
resizeTo(items, specs, config, columns, id, w, h): LayoutItem[]
nudge(items, specs, config, columns, id, key, resize): LayoutItem[] | null
isArrowKey(key: string): boolean
cellsFromPointer(dx, dy, columnStep, rowStep): { columns: number; rows: number }
describeItem(item: LayoutItem, title: string): string
```

`moveTo` and `resizeTo` clamp to the grid and the widget bounds and normalise
with `pin: id`. `nudge` returns `null` when a step would not change the tile.
`cellsFromPointer` rounds a pixel delta to whole cells and returns `0` when a
step is non-positive.

### Diffs and saving

```ts
interface InstanceDiff {
  added: LayoutItem[];
  removed: string[];
  updated: Array<{ id: string; config: Record<string, unknown> }>;
  moved: LayoutItem[];
}

diffInstances(base: readonly LayoutItem[], next: readonly LayoutItem[]): InstanceDiff

mergeInstanceChanges(
  base: readonly LayoutItem[],
  mine: readonly LayoutItem[],
  theirs: readonly LayoutItem[],
  specs: readonly WidgetLayoutSpec[],
  config: DashboardConfig,
  columns: number,
): LayoutItem[]

withBreakpoint(
  layout: DashboardLayout | LegacyDashboardLayout | null,
  specs: readonly WidgetLayoutSpec[],
  config: DashboardConfig,
  breakpoint: string,
  items: LayoutItem[],
  defaultItems?: readonly LayoutItem[],
  baseItems?: readonly LayoutItem[],
): DashboardLayout
```

`diffInstances` reports added, removed, config-updated and moved instances.
`mergeInstanceChanges` implements the "keep mine" three-way merge described in
[Concepts](./concepts.md#conflicts-and-three-way-merge).

`withBreakpoint` produces the document to persist. When `breakpoint` is the
primary one, `items` becomes the primary layout. Otherwise the instance/config
diff between `baseItems` and `items` is applied to the primary layout, and the
current breakpoint plus every other saved breakpoint are reconciled against
the result. An unarranged non-primary breakpoint stays absent so it continues
to derive from the primary.

## Types

```ts
type GridSize = { w: number; h: number }

interface BreakpointConfig {
  name: string;
  columns: number;
  minWidth: number;
  maxRows?: number;
}

interface DashboardConfig {
  breakpoints: BreakpointConfig[];
  maxItems?: number;
  maxRows?: number;
  defaultMaxSize?: GridSize;
  rowHeight?: number;
  gap?: number;
}

interface LayoutItem {
  id: string;
  type: string;
  config: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DashboardLayout {
  schema: 2;
  breakpoints: Record<string, LayoutItem[]>;
}

interface LayoutState {
  layout: DashboardLayout | null;
  version: number;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

type LayoutSaveResult = LayoutState | LayoutConflict;

interface LayoutConflict<S = LayoutState> {
  conflict: true;
  current: S;
}

interface LayoutAdapter {
  load(): Promise<LayoutState>;
  save(layout: DashboardLayout, version: number): Promise<LayoutSaveResult>;
  reset(version: number): Promise<LayoutSaveResult>;
}

interface WidgetLayoutSpec {
  type: string;
  sizes: GridSize[];
  minSize?: GridSize;
  maxSize?: GridSize;
}

interface WidgetSpecWithConfig extends WidgetLayoutSpec {
  defaultConfig?: Record<string, unknown>;
  configSchema?: ZodType;
}

interface WidgetDef<TConfig = Record<string, unknown>> extends WidgetLayoutSpec {
  title: string;
  description?: string;
  icon?: ReactNode;
  configSchema?: ZodType<TConfig>;
  defaultConfig: TConfig;
  component: ComponentType<WidgetProps<TConfig>>;
  ConfigForm?: ComponentType<WidgetConfigFormProps<TConfig>>;
}

type AnyWidgetDef = WidgetDef<any>;

interface WidgetProps<TConfig = Record<string, unknown>> {
  config: TConfig;
  item: LayoutItem;
  widget: WidgetDef<TConfig>;
}

interface WidgetConfigFormProps<TConfig = Record<string, unknown>> {
  config: TConfig;
  item: LayoutItem;
  onChange: (config: TConfig) => void;
}

interface DashboardHooks {
  onAdd?: (type: string) => void;
  onRemove?: (item: LayoutItem) => void;
  onConfigure?: (item: LayoutItem) => void;
}
```

## CSS contract

| Hook | Element |
| --- | --- |
| `[data-tessera-grid]` | The CSS grid root (`<main>`). |
| `[data-tessera-tile]` | One widget card. |
| `[data-tessera-tile-header]` | Card header. |
| `[data-tessera-tile-body]` | Widget body. |
| `[data-tessera-handle]` | Move handle in arrange mode. |
| `[data-tessera-resize]` | Resize corner in arrange mode. |
| `[data-tessera-drop]` | Drop preview. |
| `[data-tessera-guide]` | Column guides in arrange mode. |
| `[data-tessera-veil]` | Inert overlay while arranging. |
| `[data-tessera-actions]` | Header action buttons. |
| `[data-tessera-icon-button]` | Configure / remove buttons. |
| `[data-tessera-error]` | Error-boundary fallback. |
| `[data-tessera-config-reset]` | Invalid-config notice. |
| `[data-tessera-skeleton]` | Suspense fallback. |
| `[data-tessera-sr-only]` | Screen-reader-only text. |

State attributes: `data-arranging`, `data-lifted`, `data-widget-type`,
`data-columns`.

CSS variables: `--tessera-radius`, `--tessera-surface`, `--tessera-border`,
`--tessera-text`, `--tessera-muted`, `--tessera-accent`,
`--tessera-accent-soft`, `--tessera-danger`, `--tessera-shadow`,
`--tessera-cols`, `--tessera-rows`, `--tessera-lift-x`, `--tessera-lift-y`.
