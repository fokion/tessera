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
  WidgetSpecWithConfig,
} from './types';

export {
  LAYOUT_SCHEMA,
  MAX_LAYOUT_ITEMS,
  MAX_LAYOUT_ROWS,
  breakpointByName,
  byReadingOrder,
  coerceLayout,
  createLayoutSchema,
  defaultLayout,
  firstFreeSlot,
  layoutFor,
  migrateLayout,
  normaliseDashboardLayout,
  normaliseLayout,
  overlaps,
  primaryBreakpoint,
  readingOrder,
  reconcileItems,
  validateLayoutBounds,
  widgetBounds,
  type LegacyDashboardLayout,
  type LegacyLayoutItem,
} from './layout';

export {
  cellsFromPointer,
  describeItem,
  diffInstances,
  isArrowKey,
  moveTo,
  nudge,
  resizeTo,
  withBreakpoint,
  type InstanceDiff,
} from './arrange';

export {
  applyWidgetConfig,
  isLayoutConflict,
  useDashboardLayout,
  useViewport,
  type SaveStatus,
  type UseDashboardLayoutOptions,
} from './useDashboardLayout';

export { TileErrorBoundary } from './components/ErrorBoundary';
export { Grid, type GridProps } from './components/Grid';
export { Tile, type TileProps } from './components/Tile';
