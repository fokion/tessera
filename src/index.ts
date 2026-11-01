import './tessera.css';

export type {
  AnyWidgetDef,
  BreakpointConfig,
  DashboardConfig,
  DashboardHooks,
  DashboardLayout,
  GridSize,
  LayoutAdapter,
  LayoutConflict,
  LayoutItem,
  LayoutSaveResult,
  LayoutState,
  WidgetConfigFormProps,
  WidgetDef,
  WidgetLayoutSpec,
  WidgetProps,
} from './types';

export {
  LAYOUT_SCHEMA,
  MAX_LAYOUT_ITEMS,
  MAX_LAYOUT_ROWS,
  breakpointByName,
  byReadingOrder,
  createLayoutSchema,
  defaultLayout,
  firstFreeSlot,
  layoutFor,
  normaliseDashboardLayout,
  normaliseLayout,
  overlaps,
  primaryBreakpoint,
  readingOrder,
  validateLayoutBounds,
  widgetBounds,
} from './layout';

export {
  cellsFromPointer,
  describeItem,
  isArrowKey,
  moveTo,
  nudge,
  resizeTo,
  withBreakpoint,
} from './arrange';

export {
  isLayoutConflict,
  useDashboardLayout,
  useViewport,
  type SaveStatus,
  type UseDashboardLayoutOptions,
} from './useDashboardLayout';

export { TileErrorBoundary } from './components/ErrorBoundary';
export { Grid, type GridProps } from './components/Grid';
export { Tile, type TileProps } from './components/Tile';
