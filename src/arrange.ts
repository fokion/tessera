import type {
  DashboardConfig,
  DashboardLayout,
  LayoutItem,
  WidgetLayoutSpec,
} from './types';
import {
  defaultLayout,
  layoutFor,
  normaliseLayout,
  primaryBreakpoint,
  widgetBounds,
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

/**
 * The layout to save after arranging one breakpoint. The primary breakpoint
 * must always be present; other breakpoints that were never arranged stay
 * absent so they continue to derive from the primary.
 */
export function withBreakpoint(
  layout: DashboardLayout | null,
  specs: Specs,
  config: DashboardConfig,
  breakpoint: string,
  items: LayoutItem[],
  defaultItems: readonly LayoutItem[] = [],
): DashboardLayout {
  const primary = primaryBreakpoint(config);
  const saved = layout?.breakpoints ?? {};
  const primaryItems = breakpoint === primary.name
    ? items
    : saved[primary.name]
      ?? layoutFor(null, specs, config, primary.name, defaultItems);

  const breakpoints: Record<string, LayoutItem[]> = {
    ...saved,
    [primary.name]: primaryItems,
    [breakpoint]: items,
  };

  // An unarranged non-primary breakpoint stays derived rather than being
  // frozen to the current flow.
  if (breakpoint !== primary.name && !saved[breakpoint]) {
    breakpoints[breakpoint] = items;
  }

  return { schema: 1, breakpoints };
}

export { defaultLayout };
