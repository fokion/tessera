import type {
  DashboardConfig,
  GridSize,
  LayoutItem,
  WidgetLayoutSpec,
} from '../src/types';

export const CONFIG: DashboardConfig = {
  breakpoints: [
    { name: 'lg', columns: 4, minWidth: 1024 },
    { name: 'md', columns: 2, minWidth: 640 },
    { name: 'sm', columns: 1, minWidth: 0 },
  ],
  maxItems: 20,
  maxRows: 100,
  defaultMaxSize: { w: 4, h: 4 },
};

export function spec(
  type: string,
  sizes: GridSize[],
  bounds: { minSize?: GridSize; maxSize?: GridSize } = {},
): WidgetLayoutSpec {
  return { type, sizes, ...bounds };
}

export function item(
  id: string,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  config: Record<string, unknown> = {},
): LayoutItem {
  return { id, type, config, x, y, w, h };
}

export const SPECS: WidgetLayoutSpec[] = [
  spec('weather', [{ w: 2, h: 2 }]),
  spec('calendar', [{ w: 2, h: 2 }]),
  spec('notes', [{ w: 2, h: 2 }], {
    minSize: { w: 2, h: 1 },
    maxSize: { w: 3, h: 3 },
  }),
  spec('food', [{ w: 2, h: 2 }]),
  spec('manuals', [{ w: 4, h: 1 }]),
];

export const DEFAULT_ITEMS: LayoutItem[] = [
  item('weather', 'weather', 0, 0, 2, 2),
  item('calendar', 'calendar', 2, 0, 2, 2),
  item('notes', 'notes', 0, 2, 2, 2),
  item('food', 'food', 2, 2, 2, 2),
  item('manuals', 'manuals', 0, 4, 4, 1),
];
