import { z } from 'zod';
import type {
  BreakpointConfig,
  DashboardConfig,
  DashboardLayout,
  GridSize,
  LayoutItem,
  WidgetLayoutSpec,
} from './types';

export const LAYOUT_SCHEMA = 1 as const;
export const MAX_LAYOUT_ROWS = 500;
export const MAX_LAYOUT_ITEMS = 100;

export function primaryBreakpoint(config: DashboardConfig): BreakpointConfig {
  return config.breakpoints[0];
}

export function breakpointByName(
  config: DashboardConfig,
  name: string,
): BreakpointConfig | undefined {
  return config.breakpoints.find((breakpoint) => breakpoint.name === name);
}

function widestColumns(config: DashboardConfig): number {
  return Math.max(1, ...config.breakpoints.map((breakpoint) => breakpoint.columns));
}

function specMap(
  specs: readonly WidgetLayoutSpec[],
): Map<string, WidgetLayoutSpec> {
  return new Map(specs.map((spec) => [spec.type, spec]));
}

/**
 * Default, minimum and maximum size for a widget.
 *
 * The host config decides the fallback maximum, so a 6-column dashboard is
 * not artificially capped at the old 4-column grid.
 */
export function widgetBounds(
  spec: Pick<WidgetLayoutSpec, 'sizes' | 'minSize' | 'maxSize'>,
  config: DashboardConfig,
): { default: GridSize; min: GridSize; max: GridSize } {
  const toSize = (size: GridSize | undefined, fallback: GridSize): GridSize => ({
    w: Math.max(1, size?.w ?? fallback.w),
    h: Math.max(1, size?.h ?? fallback.h),
  });
  return {
    default: toSize(spec.sizes[0], { w: 2, h: 2 }),
    min: toSize(spec.minSize, { w: 1, h: 1 }),
    max: toSize(spec.maxSize, config.defaultMaxSize ?? {
      w: widestColumns(config),
      h: 4,
    }),
  };
}

export function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function byReadingOrder(a: LayoutItem, b: LayoutItem): number {
  return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);
}

/** First free top-left slot, scanning rows top to bottom and columns left to right. */
export function firstFreeSlot(
  placed: readonly LayoutItem[],
  base: Pick<LayoutItem, 'id' | 'type' | 'config'>,
  w: number,
  h: number,
  columns: number,
): LayoutItem {
  for (let y = 0; ; y += 1) {
    for (let x = 0; x + w <= columns; x += 1) {
      const candidate: LayoutItem = { ...base, x, y, w, h };
      if (!placed.some((item) => overlaps(item, candidate))) return candidate;
    }
  }
}

function clampItem(
  item: LayoutItem,
  spec: WidgetLayoutSpec,
  config: DashboardConfig,
  columns: number,
): LayoutItem {
  const { min, max } = widgetBounds(spec, config);
  const w = Math.min(Math.max(item.w, min.w), max.w, columns);
  const h = Math.min(Math.max(item.h, min.h), max.h);
  const x = Math.min(Math.max(item.x, 0), columns - w);
  const y = Math.max(item.y, 0);
  return { ...item, x, y, w, h };
}

/**
 * Make any saved layout safe to render against the current widget registry:
 * drop unknown types and duplicate ids, clamp sizes to each widget's bounds
 * and the grid width, resolve overlaps by pushing tiles down, and compact
 * upwards. The result is sorted in reading order, and normalising it again is
 * a no-op.
 *
 * `pin` names the tile being moved or resized: it is placed first, so it keeps
 * the spot the person chose and the tiles it lands on move out of its way.
 */
export function normaliseLayout(
  items: readonly LayoutItem[] | undefined,
  specs: readonly WidgetLayoutSpec[],
  columns: number,
  options: { pin?: string } = {},
  config: DashboardConfig = {
    breakpoints: [{ name: 'default', columns, minWidth: 0 }],
  },
): LayoutItem[] {
  const known = specMap(specs);
  const seen = new Set<string>();
  const clamped: LayoutItem[] = [];

  for (const item of items ?? []) {
    if (!known.has(item.type) || seen.has(item.id)) continue;
    seen.add(item.id);
    clamped.push(clampItem(item, known.get(item.type) as WidgetLayoutSpec, config, columns));
  }

  // Resolve overlaps in reading order (the pinned tile first): a tile that
  // collides moves down. A tile the pinned tile lands on first tries the space
  // just above it, so moving a tile onto its neighbour swaps them instead of
  // being undone by compaction.
  const pinned = clamped.find((item) => item.id === options.pin);
  const pinnedFirst = (a: LayoutItem, b: LayoutItem) =>
    Number(b.id === options.pin) - Number(a.id === options.pin)
    || byReadingOrder(a, b);
  const placed: LayoutItem[] = [];
  for (const item of clamped.sort(pinnedFirst)) {
    const next = { ...item };
    if (
      pinned
      && next !== pinned
      && item.id !== pinned.id
      && overlaps(pinned, next)
    ) {
      const above = { ...next, y: pinned.y - next.h };
      if (above.y >= 0 && !placed.some((other) => overlaps(other, above))) {
        next.y = above.y;
      }
    }
    // `pin` is a snapshot; compare against the copy we are placing, not the
    // object that was sorted into the array.
    while (placed.some((other) => overlaps(other, next))) next.y += 1;
    placed.push(next);
  }

  // Compact upwards so there are no empty rows above a tile.
  placed.sort(byReadingOrder);
  for (const item of placed) {
    while (
      item.y > 0
      && !placed.some(
        (other) => other !== item && overlaps(other, { ...item, y: item.y - 1 }),
      )
    ) {
      item.y -= 1;
    }
  }

  return placed.sort(byReadingOrder);
}

/** The layout everyone gets before anyone arranges. */
export function defaultLayout(
  items: readonly LayoutItem[],
  specs: readonly WidgetLayoutSpec[],
  columns: number,
  config?: DashboardConfig,
): LayoutItem[] {
  return normaliseLayout(items, specs, columns, {}, config);
}

/** Widget ids in reading order. */
export function readingOrder(items: readonly LayoutItem[]): string[] {
  return [...items].sort(byReadingOrder).map((item) => item.id);
}

function flowInto(
  items: readonly LayoutItem[],
  columns: number,
  specs: readonly WidgetLayoutSpec[],
  config: DashboardConfig,
): LayoutItem[] {
  const flowed: LayoutItem[] = [];
  for (const item of [...items].sort(byReadingOrder)) {
    flowed.push(firstFreeSlot(
      flowed,
      { id: item.id, type: item.type, config: item.config },
      Math.min(item.w, columns),
      item.h,
      columns,
    ));
  }
  return normaliseLayout(flowed, specs, columns, {}, config);
}

/**
 * The layout to render at a breakpoint. The primary breakpoint falls back to
 * the supplied default instances; other breakpoints, when nobody arranged
 * them, are derived by flowing the primary layout into the narrower grid.
 */
export function layoutFor(
  layout: DashboardLayout | null | undefined,
  specs: readonly WidgetLayoutSpec[],
  config: DashboardConfig,
  breakpointName: string,
  defaultItems: readonly LayoutItem[] = [],
): LayoutItem[] {
  const breakpoint = breakpointByName(config, breakpointName)
    ?? primaryBreakpoint(config);
  const saved = layout?.breakpoints[breakpoint.name];
  if (saved) return normaliseLayout(saved, specs, breakpoint.columns, {}, config);

  const primary = primaryBreakpoint(config);
  if (breakpoint.name === primary.name) {
    return defaultLayout(defaultItems, specs, breakpoint.columns, config);
  }

  const primarySaved = layout?.breakpoints[primary.name];
  const primaryItems = primarySaved
    ? normaliseLayout(primarySaved, specs, primary.columns, {}, config)
    : defaultLayout(defaultItems, specs, primary.columns, config);
  return flowInto(primaryItems, breakpoint.columns, specs, config);
}

/** Normalise every breakpoint a stored layout carries. */
export function normaliseDashboardLayout(
  layout: DashboardLayout,
  specs: readonly WidgetLayoutSpec[],
  config: DashboardConfig,
): DashboardLayout {
  const breakpoints: Record<string, LayoutItem[]> = {};
  for (const breakpoint of config.breakpoints) {
    const items = layout.breakpoints[breakpoint.name];
    if (items) {
      breakpoints[breakpoint.name] = normaliseLayout(
        items,
        specs,
        breakpoint.columns,
        {},
        config,
      );
    }
  }
  return { schema: LAYOUT_SCHEMA, breakpoints };
}

/**
 * Strict checks for a layout a client wants to save. Positions and overlaps
 * are repaired by normalisation; an unknown widget or a size outside its
 * bounds means the client is out of date, so it is reported instead.
 */
export function validateLayoutBounds(
  layout: DashboardLayout,
  specs: readonly WidgetLayoutSpec[],
  config: DashboardConfig,
): string | null {
  const known = specMap(specs);
  for (const [breakpointName, items] of Object.entries(layout.breakpoints)) {
    const breakpoint = breakpointByName(config, breakpointName);
    if (!breakpoint) return `unknown breakpoint "${breakpointName}"`;
    const seen = new Set<string>();
    for (const item of items) {
      const spec = known.get(item.type);
      if (!spec) return `${breakpointName}: unknown widget type "${item.type}"`;
      if (seen.has(item.id)) return `${breakpointName}: "${item.id}" appears twice`;
      seen.add(item.id);
      const { min, max } = widgetBounds(spec, config);
      if (item.w < min.w || item.h < min.h || item.w > max.w || item.h > max.h) {
        return `${breakpointName}: "${item.id}" must be between ${min.w}x${min.h} and ${max.w}x${max.h}`;
      }
      if (item.x + item.w > breakpoint.columns) {
        return `${breakpointName}: "${item.id}" does not fit in ${breakpoint.columns} columns`;
      }
      const maxRows = breakpoint.maxRows ?? config.maxRows;
      if (maxRows !== undefined && item.y + item.h > maxRows) {
        return `${breakpointName}: "${item.id}" starts below the ${maxRows}-row limit`;
      }
    }
  }
  return null;
}

const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Zod schema for a layout payload, bound to a dashboard configuration.
 * Use `validateLayoutBounds` for widget-specific checks.
 */
export function createLayoutSchema(config: DashboardConfig) {
  const maxItems = config.maxItems ?? MAX_LAYOUT_ITEMS;
  const maxRows = config.maxRows ?? MAX_LAYOUT_ROWS;
  const item = z.object({
    id: z.string().min(1).max(80).regex(ITEM_ID_RE),
    type: z.string().min(1).max(80),
    config: z.record(z.string(), z.unknown()).default({}),
    x: z.number().int().min(0),
    y: z.number().int().min(0).max(maxRows),
    w: z.number().int().min(1),
    h: z.number().int().min(1).max(maxRows),
  }).strict();

  return z.object({
    schema: z.literal(LAYOUT_SCHEMA),
    breakpoints: z.record(z.string(), z.array(item).max(maxItems)),
  }).strict().superRefine((layout, ctx) => {
    for (const [name, items] of Object.entries(layout.breakpoints)) {
      const breakpoint = breakpointByName(config, name);
      if (!breakpoint) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['breakpoints', name],
          message: `unknown breakpoint "${name}"`,
        });
        continue;
      }
      for (const [index, placed] of items.entries()) {
        if (placed.x + placed.w > breakpoint.columns) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['breakpoints', name, index],
            message: `"${placed.id}" does not fit in ${breakpoint.columns} columns`,
          });
        }
      }
    }
  });
}
