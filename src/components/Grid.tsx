import {
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { AnyWidgetDef, DashboardConfig, LayoutItem } from '../types';
import {
  breakpointByName,
  primaryBreakpoint,
  readingOrder,
} from '../layout';
import {
  cellsFromPointer,
  describeItem,
  isArrowKey,
  moveTo,
  nudge,
  resizeTo,
} from '../arrange';
import { GripIcon, ResizeIcon, Tile } from './Tile';

interface Drag {
  id: string;
  kind: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  steps: { column: number; row: number };
  base: LayoutItem[];
  start: LayoutItem;
  preview: LayoutItem[];
  dx: number;
  dy: number;
}

const HELP_ID = 'tessera-arrange-help';

function placement(item: LayoutItem): CSSProperties {
  return {
    gridColumn: `${item.x + 1} / span ${item.w}`,
    gridRow: `${item.y + 1} / span ${item.h}`,
  };
}

/** One grid column and row in pixels, gap included, from the rendered grid. */
function gridSteps(
  grid: HTMLElement,
  columns: number,
  fallback: { rowHeight: number; gap: number },
): { column: number; row: number } {
  const style = getComputedStyle(grid);
  const columnGap = parseFloat(style.columnGap) || fallback.gap;
  const rowGap = parseFloat(style.rowGap) || columnGap;
  const rowHeight = parseFloat(style.gridAutoRows) || fallback.rowHeight;
  const width = grid.getBoundingClientRect().width;
  return {
    column: (width - columnGap * (columns - 1)) / columns + columnGap,
    row: rowHeight + rowGap,
  };
}

export interface GridProps {
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

export function Grid({
  items,
  widgets,
  config,
  viewport,
  arranging,
  onChange,
  announce,
  onConfigure,
  onRemove,
}: GridProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const breakpoint = breakpointByName(config, viewport) ?? primaryBreakpoint(config);
  const columns = breakpoint.columns;
  const rowHeight = config.rowHeight ?? 180;
  const gap = config.gap ?? 12;
  const shown = drag?.preview ?? items;
  const byId = new Map(shown.map((item) => [item.id, item]));
  const widgetMap = new Map(widgets.map((widget) => [widget.type, widget]));
  const rows = Math.max(1, ...shown.map((item) => item.y + item.h));

  // While arranging, the DOM order stays fixed so a focused handle keeps
  // focus as tiles move; otherwise it follows the reading order on screen.
  const order = arranging ? items.map((item) => item.id) : readingOrder(items);
  const ordered = order
    .map((id) => shown.find((item) => item.id === id))
    .filter((item): item is LayoutItem => Boolean(item));

  function begin(
    event: PointerEvent<HTMLElement>,
    id: string,
    kind: Drag['kind'],
  ) {
    if (event.button !== 0) return;
    const grid = event.currentTarget.closest<HTMLElement>('[data-tessera-grid]');
    const start = items.find((item) => item.id === id);
    if (!grid || !start) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id,
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      steps: gridSteps(grid, columns, { rowHeight, gap }),
      base: items,
      start,
      preview: items,
      dx: 0,
      dy: 0,
    });
  }

  function track(event: PointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const delta = cellsFromPointer(dx, dy, drag.steps.column, drag.steps.row);
    const preview = drag.kind === 'move'
      ? moveTo(
        drag.base,
        widgets,
        config,
        columns,
        drag.id,
        drag.start.x + delta.columns,
        drag.start.y + delta.rows,
      )
      : resizeTo(
        drag.base,
        widgets,
        config,
        columns,
        drag.id,
        drag.start.w + delta.columns,
        drag.start.h + delta.rows,
      );
    setDrag({ ...drag, dx, dy, preview });
  }

  function finish(event: PointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.preview.find((item) => item.id === drag.id);
    if (drag.preview !== drag.base) onChange(drag.preview);
    if (moved) {
      const widget = widgetMap.get(moved.type);
      announce(describeItem(moved, widget?.title ?? moved.type));
    }
    setDrag(null);
  }

  function key(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const item = items.find((candidate) => candidate.id === id);
    const widget = item ? widgetMap.get(item.type) : undefined;
    const name = widget?.title ?? item?.type ?? id;
    if (event.key === 'Escape' && drag) {
      event.stopPropagation();
      setDrag(null);
      announce(`${name} is back where it was.`);
      return;
    }
    if (!isArrowKey(event.key)) return;
    event.preventDefault();
    const next = nudge(
      items,
      widgets,
      config,
      columns,
      id,
      event.key,
      event.shiftKey,
    );
    const moved = next?.find((candidate) => candidate.id === id);
    if (next && moved) {
      onChange(next);
      announce(describeItem(moved, name));
    } else {
      announce(
        `${name} can't ${event.shiftKey ? 'change size' : 'move'} any further that way.`,
      );
    }
  }

  function liftOffset(item: LayoutItem): CSSProperties | undefined {
    if (!drag || drag.kind !== 'move' || drag.id !== item.id) return undefined;
    // Follow the pointer; the grid position underneath snaps cell by cell.
    const x = drag.dx - (item.x - drag.start.x) * drag.steps.column;
    const y = drag.dy - (item.y - drag.start.y) * drag.steps.row;
    return {
      '--tessera-lift-x': `${x}px`,
      '--tessera-lift-y': `${y}px`,
    } as CSSProperties;
  }

  const dropped = drag ? byId.get(drag.id) : undefined;

  return (
    <main
      data-tessera-grid=""
      data-arranging={arranging ? '' : undefined}
      data-columns={columns}
      aria-label="Dashboard widgets"
      aria-describedby={arranging ? HELP_ID : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: `${rowHeight}px`,
        gap: `${gap}px`,
        position: 'relative',
      }}
    >
      {arranging ? (
        <>
          <p id={HELP_ID} data-tessera-sr-only="">
            Arrange mode. Each tile has a handle: arrow keys move the tile,
            Shift and arrow keys resize it, and Escape cancels.
          </p>
          {Array.from({ length: columns }, (_, index) => (
            <span
              key={`guide-${index}`}
              data-tessera-guide=""
              aria-hidden="true"
              style={{
                gridColumn: `${index + 1} / span 1`,
                gridRow: `1 / span ${rows}`,
                pointerEvents: 'none',
              }}
            />
          ))}
        </>
      ) : null}

      {dropped ? (
        <div
          data-tessera-drop=""
          aria-hidden="true"
          style={{ ...placement(dropped), pointerEvents: 'none' }}
        >
          {drag?.kind === 'move'
            ? `Drop here · column ${dropped.x + 1}, row ${dropped.y + 1}`
            : `${dropped.w} × ${dropped.h}`}
        </div>
      ) : null}

      {ordered.map((item, index) => {
        const widget = widgetMap.get(item.type);
        if (!widget) return null;
        const lifted = drag?.kind === 'move' && drag.id === item.id;
        const style = { ...placement(item), ...liftOffset(item) };
        return (
          <Tile
            key={item.id}
            item={item}
            widget={widget}
            index={index}
            style={style}
            arranging={arranging}
            lifted={lifted}
            onConfigure={onConfigure}
            onRemove={onRemove}
            controls={
              arranging ? (
                <>
                  <span data-tessera-veil="" aria-hidden="true" />
                  <button
                    type="button"
                    data-tessera-handle=""
                    aria-label={`Move ${widget.title}, ${item.w} by ${item.h}`}
                    aria-describedby={HELP_ID}
                    onPointerDown={(event) => begin(event, item.id, 'move')}
                    onPointerMove={track}
                    onPointerUp={finish}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(event) => key(event, item.id)}
                  >
                    <GripIcon />
                    <span>
                      {item.w} × {item.h}
                    </span>
                  </button>
                  <span
                    data-tessera-resize=""
                    aria-hidden="true"
                    title="Drag to resize"
                    onPointerDown={(event) => begin(event, item.id, 'resize')}
                    onPointerMove={track}
                    onPointerUp={finish}
                    onPointerCancel={() => setDrag(null)}
                  >
                    <ResizeIcon />
                  </span>
                </>
              ) : undefined
            }
          />
        );
      })}
    </main>
  );
}
