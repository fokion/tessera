import type { ComponentType, ReactNode } from 'react';
import type { ZodType } from 'zod';

/** A tile size in grid units. */
export interface GridSize {
  w: number;
  h: number;
}

/** One breakpoint: its column count and the viewport width it starts at. */
export interface BreakpointConfig {
  /** Stable key used in the persisted layout, e.g. `lg`, `md`, `sm`. */
  name: string;
  columns: number;
  /** Minimum viewport width in pixels. The widest matching breakpoint wins. */
  minWidth: number;
  /** Optional per-breakpoint row limit. */
  maxRows?: number;
}

/** Grid-wide configuration. Breakpoints are ordered widest first. */
export interface DashboardConfig {
  breakpoints: BreakpointConfig[];
  maxItems?: number;
  maxRows?: number;
  /** Default maximum widget size for specs that don't set `maxSize`. */
  defaultMaxSize?: GridSize;
  /** Row height in pixels. Defaults to 180. */
  rowHeight?: number;
  /** Grid gap in pixels. Defaults to 12. */
  gap?: number;
}

/** One widget instance placed on the dashboard. */
export interface LayoutItem {
  id: string;
  type: string;
  config: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  schema: 2;
  breakpoints: Record<string, LayoutItem[]>;
}

/** The adapter's persisted state. `layout: null` means "use the default". */
export interface LayoutState {
  layout: DashboardLayout | null;
  version: number;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

/** A save was rejected because someone else saved first. */
export interface LayoutConflict<S = LayoutState> {
  conflict: true;
  current: S;
}

export type LayoutSaveResult = LayoutState | LayoutConflict;

/**
 * Persistence boundary. The package never talks to a database or HTTP API
 * directly; the host app supplies one of these (TanStack Query, fetch, etc.).
 */
export interface LayoutAdapter {
  load(): Promise<LayoutState>;
  save(layout: DashboardLayout, version: number): Promise<LayoutSaveResult>;
  reset(version: number): Promise<LayoutSaveResult>;
}

/** The subset of a widget definition needed by layout maths. */
export interface WidgetLayoutSpec {
  type: string;
  sizes: GridSize[];
  minSize?: GridSize;
  maxSize?: GridSize;
}

/** A widget spec plus the config defaults/schema used by the hook. */
export interface WidgetSpecWithConfig extends WidgetLayoutSpec {
  defaultConfig?: Record<string, unknown>;
  configSchema?: ZodType;
}

export interface WidgetProps<TConfig = Record<string, unknown>> {
  config: TConfig;
  item: LayoutItem;
  widget: WidgetDef<TConfig>;
}

export interface WidgetConfigFormProps<TConfig = Record<string, unknown>> {
  config: TConfig;
  item: LayoutItem;
  onChange: (config: TConfig) => void;
}

/**
 * A widget that can be added to a dashboard.
 *
 * `sizes` is the list of preset sizes (the first is the default). `minSize`
 * and `maxSize` bound drag/keyboard resizing.
 */
export interface WidgetDef<TConfig = Record<string, unknown>>
  extends WidgetLayoutSpec {
  title: string;
  description?: string;
  icon?: ReactNode;
  configSchema?: ZodType<TConfig>;
  defaultConfig: TConfig;
  component: ComponentType<WidgetProps<TConfig>>;
  ConfigForm?: ComponentType<WidgetConfigFormProps<TConfig>>;
}

export type AnyWidgetDef = WidgetDef<any>;

export interface DashboardHooks {
  onAdd?: (type: string) => void;
  onRemove?: (item: LayoutItem) => void;
  onConfigure?: (item: LayoutItem) => void;
}
