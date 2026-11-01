import { Suspense, type CSSProperties, type ReactNode } from 'react';
import type { AnyWidgetDef, LayoutItem } from '../types';
import { TileErrorBoundary } from './ErrorBoundary';

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <circle cx="6" cy="3" r="1.2" />
      <circle cx="10" cy="3" r="1.2" />
      <circle cx="6" cy="8" r="1.2" />
      <circle cx="10" cy="8" r="1.2" />
      <circle cx="6" cy="13" r="1.2" />
      <circle cx="10" cy="13" r="1.2" />
    </svg>
  );
}

function ResizeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 3h4v4M7 13H3V9M13 3 9 7M3 13l4-4" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TileSkeleton() {
  return (
    <div data-tessera-skeleton aria-label="Loading widget">
      <span />
      <span />
      <span />
    </div>
  );
}

export interface TileProps {
  item: LayoutItem;
  widget: AnyWidgetDef;
  index: number;
  /** Grid placement; omitted when the host renders a stacked layout. */
  style?: CSSProperties;
  /** Arrange mode: the widget is inert and `controls` sit on top of it. */
  arranging?: boolean;
  lifted?: boolean;
  controls?: ReactNode;
  onConfigure?: (item: LayoutItem) => void;
  onRemove?: (item: LayoutItem) => void;
}

export function Tile({
  item,
  widget,
  index,
  style: placement,
  arranging = false,
  lifted = false,
  controls,
  onConfigure,
  onRemove,
}: TileProps) {
  const Widget = widget.component as React.ComponentType<{
    config: Record<string, unknown>;
    item: LayoutItem;
    widget: AnyWidgetDef;
  }>;
  const mergedConfig = { ...(widget.defaultConfig ?? {}), ...item.config };
  const parsedConfig = widget.configSchema?.safeParse(mergedConfig);
  const config = parsedConfig?.success
    ? (parsedConfig.data as Record<string, unknown>)
    : { ...(widget.defaultConfig ?? {}) };
  const configReset = Boolean(widget.configSchema && !parsedConfig?.success);
  const titleId = `tessera-tile-${item.id}`;
  const style = {
    ...placement,
    '--tessera-cols': String(item.w),
    '--tessera-rows': String(item.h),
  } as CSSProperties;

  return (
    <section
      data-tessera-tile=""
      data-widget-type={item.type}
      data-arranging={arranging ? '' : undefined}
      data-lifted={lifted ? '' : undefined}
      style={style}
      aria-labelledby={titleId}
    >
      <header data-tessera-tile-header="">
        <span data-tessera-index="" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div data-tessera-heading="">
          <h2 id={titleId}>
            {widget.icon ? (
              <span data-tessera-glyph="" aria-hidden="true">
                {widget.icon}
              </span>
            ) : null}
            {widget.title}
          </h2>
          {widget.description ? <p>{widget.description}</p> : null}
        </div>
        <span data-tessera-actions="">
          {onConfigure ? (
            <button
              type="button"
              data-tessera-icon-button=""
              aria-label={`Configure ${widget.title}`}
              title="Configure widget"
              onClick={() => onConfigure(item)}
            >
              <SettingsIcon />
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              data-tessera-icon-button=""
              aria-label={`Remove ${widget.title}`}
              title="Remove widget"
              onClick={() => onRemove(item)}
            >
              <RemoveIcon />
            </button>
          ) : null}
        </span>
      </header>
      <div data-tessera-tile-body="" inert={arranging || undefined}>
        <TileErrorBoundary
          title={widget.title}
          resetKey={JSON.stringify(item.config)}
        >
          <Suspense fallback={<TileSkeleton />}>
            {configReset ? (
              <p data-tessera-config-reset="" role="status">
                Saved settings were invalid; showing the widget defaults.
              </p>
            ) : null}
            <Widget config={config} item={item} widget={widget} />
          </Suspense>
        </TileErrorBoundary>
      </div>
      {controls ?? (arranging ? <span data-tessera-veil="" aria-hidden="true" /> : null)}
    </section>
  );
}

export { GripIcon, ResizeIcon, SettingsIcon, RemoveIcon, TileSkeleton };
