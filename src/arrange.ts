import type {
  DashboardConfig,
  DashboardLayout,
  LayoutItem,
  WidgetLayoutSpec,
} from './types';
import {
  LAYOUT_SCHEMA,
  coerceLayout,
  defaultLayout,
  firstFreeSlot,
  layoutFor,
  normaliseLayout,
  primaryBreakpoint,
  reconcileItems,
  widgetBounds,
  type LegacyDashboardLayout,
} from './layout';

type Specs = readonly WidgetLayoutSpec[];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function find(items: readonly LayoutItem[], id: string): LayoutItem {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`No tile for ${id}`);
  return item;
}

function place(
  items: readonly LayoutItem[],
  specs: Specs,
  config: DashboardConfig,
  columns: number,
  next: LayoutItem,
): LayoutItem[] {
  return normaliseLayout(
    items.map((item) => (item.id === next.id ? next : item)),
    specs,
    columns,
    { pin: next.id },
    config,
  );
}

/** Move a tile so its top-left corner is at (x, y), kept inside the grid. */
export function moveTo(
  items: readonly LayoutItem[],
  specs: Specs,
  config: DashboardConfig,
  columns: number,
  id: string,
  x: number,
  y: number,
): LayoutItem[] {
  const current = find(items, id);
  return place(items, specs, config, columns, {
    ...current,
    x: clamp(x, 0, Math.max(0, columns - current.w)),
    y: Math.max(0, y),
  });
}

/** Resize a tile, kept inside its widget bounds and the grid width. */
export function resizeTo(
  items: readonly LayoutItem[],
  specs: Specs,
  config: DashboardConfig,
  columns: number,
  id: string,
  w: number,
  h: number,
): LayoutItem[] {
  const current = find(items, id);
  const spec = specs.find((candidate) => candidate.type === current.type);
  const bounds = spec
    ? widgetBounds(spec, config)
    : { min: { w: 1, h: 1 }, max: { w: columns, h: 4 }, default: { w: 2, h: 2 } };
  const width = clamp(w, bounds.min.w, Math.min(bounds.max.w, columns - current.x));
  const height = clamp(h, bounds.min.h, bounds.max.h);
  return place(items, specs, config, columns, { ...current, w: width, h: height });
}

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function isArrowKey(key: string): boolean {
  return key in DIRECTIONS;
}

const same = (a: LayoutItem, b: LayoutItem) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * One keyboard step: arrows move a tile by a cell, Shift+arrows resize it.
 * Returns null when the tile can't go further, so the caller can say so.
 */
export function nudge(
  items: readonly LayoutItem[],
  specs: Specs,
  config: DashboardConfig,
  columns: number,
  id: string,
  key: string,
  resize: boolean,
): LayoutItem[] | null {
  const direction = DIRECTIONS[key];
  if (!direction) return null;
  const [dx, dy] = direction;
  const current = find(items, id);

  if (resize) {
    const next = resizeTo(
      items,
      specs,
      config,
      columns,
      id,
      current.w + dx,
      current.h + dy,
    );
    return same(find(next, id), current) ? null : next;
  }

  if (dy > 0) {
    // Compaction undoes a one-row step into empty space, so step down until
    // the tile actually passes the tile below it.
    const bottom = Math.max(...items.map((item) => item.y + item.h));
    for (let y = current.y + 1; y <= bottom; y += 1) {
      const next = moveTo(items, specs, config, columns, id, current.x, y);
      if (find(next, id).y > current.y) return next;
    }
    return null;
  }

  const next = moveTo(
    items,
    specs,
    config,
    columns,
    id,
    current.x + dx,
    current.y + dy,
  );
  return same(find(next, id), current) ? null : next;
}

/** Grid cells covered by a pointer drag of (dx, dy) pixels. */
export function cellsFromPointer(
  dx: number,
  dy: number,
  columnStep: number,
  rowStep: number,
): { columns: number; rows: number } {
  return {
    columns: columnStep > 0 ? Math.round(dx / columnStep) + 0 : 0,
    rows: rowStep > 0 ? Math.round(dy / rowStep) + 0 : 0,
  };
}

/** What a screen reader hears after a tile moves or resizes. */
export function describeItem(item: LayoutItem, title: string): string {
  return `${title}, column ${item.x + 1}, row ${item.y + 1}, ${item.w} by ${item.h}.`;
}

/** Instance-set/config changes between two layouts at the same breakpoint. */
export interface InstanceDiff {
  added: LayoutItem[];
  removed: string[];
  updated: Array<{ id: string; config: Record<string, unknown> }>;
}

export function diffInstances(
  base: readonly LayoutItem[],
  next: readonly LayoutItem[],
): InstanceDiff {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));
  return {
    added: next.filter((item) => !baseById.has(item.id)),
    removed: [...baseById.keys()].filter((id) => !nextById.has(id)),
    updated: next
      .filter((item) => {
        const before = baseById.get(item.id);
        return before
          && JSON.stringify(before.config) !== JSON.stringify(item.config);
      })
      .map((item) => ({ id: item.id, config: item.config })),
  };
}

function applyDiffToPrimary(
  primaryItems: readonly LayoutItem[],
  diff: InstanceDiff,
  specs: Specs,
  config: DashboardConfig,
  columns: number,
): LayoutItem[] {
  const removed = new Set(diff.removed);
  const updated = new Map(diff.updated.map((entry) => [entry.id, entry.config]));
  const items = primaryItems
    .filter((item) => !removed.has(item.id))
    .map((item) => (
      updated.has(item.id)
        ? { ...item, config: updated.get(item.id) as Record<string, unknown> }
        : item
    ));

  for (const added of diff.added) {
    if (items.some((item) => item.id === added.id)) continue;
    const spec = specs.find((candidate) => candidate.type === added.type);
    const size = spec
      ? widgetBounds(spec, config).default
      : { w: added.w, h: added.h };
    items.push(firstFreeSlot(
      items,
      { id: added.id, type: added.type, config: added.config },
      Math.min(size.w, columns),
      size.h,
      columns,
    ));
  }

  return normaliseLayout(items, specs, columns, {}, config);
}

/**
 * The layout to save after arranging one breakpoint.
 *
 * The primary breakpoint owns the instance set and each instance's `config`.
 * Adding, removing or reconfiguring a widget at any breakpoint is applied to
 * the primary list, then every saved breakpoint is reconciled against it;
 * positions stay per-breakpoint. An unarranged non-primary breakpoint stays
 * absent so it continues to derive from the primary.
 */
export function withBreakpoint(
  layout: DashboardLayout | LegacyDashboardLayout | null,
  specs: Specs,
  config: DashboardConfig,
  breakpoint: string,
  items: LayoutItem[],
  defaultItems: readonly LayoutItem[] = [],
  baseItems?: readonly LayoutItem[],
): DashboardLayout {
  const upgraded = coerceLayout(layout);
  const primary = primaryBreakpoint(config);
  const primarySaved = upgraded?.breakpoints[primary.name];
  const primaryBase = primarySaved
    ? normaliseLayout(primarySaved, specs, primary.columns, {}, config)
    : defaultLayout(defaultItems, specs, primary.columns, config);

  let primaryItems: LayoutItem[];
  if (breakpoint === primary.name) {
    primaryItems = normaliseLayout(items, specs, primary.columns, {}, config);
  } else {
    const base = baseItems
      ?? layoutFor(upgraded, specs, config, breakpoint, defaultItems);
    primaryItems = applyDiffToPrimary(
      primaryBase,
      diffInstances(base, items),
      specs,
      config,
      primary.columns,
    );
  }

  const breakpoints: Record<string, LayoutItem[]> = {};
  for (const candidate of config.breakpoints) {
    if (candidate.name === primary.name) {
      breakpoints[candidate.name] = primaryItems;
      continue;
    }
    if (candidate.name === breakpoint) {
      breakpoints[candidate.name] = reconcileItems(
        items,
        primaryItems,
        specs,
        candidate.columns,
        config,
      );
      continue;
    }
    const saved = upgraded?.breakpoints[candidate.name];
    if (saved) {
      breakpoints[candidate.name] = reconcileItems(
        saved,
        primaryItems,
        specs,
        candidate.columns,
        config,
      );
    }
  }

  return { schema: LAYOUT_SCHEMA, breakpoints };
}

export { defaultLayout };
