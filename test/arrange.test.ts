import { describe, expect, it } from 'vitest';
import type { LayoutItem } from '../src/types';
import {
  cellsFromPointer,
  describeItem,
  moveTo,
  nudge,
  resizeTo,
  withBreakpoint,
} from '../src/arrange';
import { defaultLayout, firstFreeSlot, normaliseLayout } from '../src/layout';
import {
  CONFIG,
  DEFAULT_ITEMS,
  SPECS,
  item,
  spec,
} from './fixtures';

const at = (items: LayoutItem[], id: string) =>
  items.find((entry) => entry.id === id)!;
const stable = (items: LayoutItem[], columns = 4) =>
  expect(normaliseLayout(items, SPECS, columns, {}, CONFIG)).toEqual(items);

const START = DEFAULT_ITEMS;

describe('keyboard arranging', () => {
  it('moves right and left by one column', () => {
    const right = nudge(START, SPECS, CONFIG, 4, 'weather', 'ArrowRight', false)!;
    expect(at(right, 'weather')).toMatchObject({ x: 1, y: 0 });
    stable(right);
    const back = nudge(right, SPECS, CONFIG, 4, 'weather', 'ArrowLeft', false)!;
    expect(at(back, 'weather')).toMatchObject({ x: 0, y: 0 });
  });

  it('moves down past the tile below, swapping with it', () => {
    const down = nudge(START, SPECS, CONFIG, 4, 'weather', 'ArrowDown', false)!;
    expect(at(down, 'weather')).toMatchObject({ x: 0, y: 2 });
    expect(at(down, 'notes')).toMatchObject({ x: 0, y: 0 });
    stable(down);
  });

  it('moves up past the tile above, swapping with it', () => {
    const up = nudge(START, SPECS, CONFIG, 4, 'notes', 'ArrowUp', false)!;
    expect(at(up, 'notes')).toMatchObject({ x: 0, y: 0 });
    expect(at(up, 'weather').y).toBeGreaterThan(0);
    stable(up);
  });

  it('returns null at the edge of the grid', () => {
    expect(nudge(START, SPECS, CONFIG, 4, 'weather', 'ArrowLeft', false)).toBeNull();
    expect(nudge(START, SPECS, CONFIG, 4, 'weather', 'ArrowUp', false)).toBeNull();
    expect(nudge(START, SPECS, CONFIG, 4, 'manuals', 'ArrowDown', false)).toBeNull();
    expect(nudge(START, SPECS, CONFIG, 4, 'calendar', 'ArrowRight', false)).toBeNull();
  });

  it('resizes with Shift+arrows inside the widget bounds', () => {
    const taller = nudge(START, SPECS, CONFIG, 4, 'notes', 'ArrowDown', true)!;
    expect(at(taller, 'notes')).toMatchObject({ w: 2, h: 3 });
    stable(taller);
    const shorter = nudge(START, SPECS, CONFIG, 4, 'notes', 'ArrowUp', true)!;
    expect(at(shorter, 'notes')).toMatchObject({ w: 2, h: 1 });
    expect(nudge(shorter, SPECS, CONFIG, 4, 'notes', 'ArrowUp', true)).toBeNull();
    expect(nudge(START, SPECS, CONFIG, 4, 'notes', 'ArrowLeft', true)).toBeNull();
  });

  it('ignores keys that are not arrows', () => {
    expect(nudge(START, SPECS, CONFIG, 4, 'weather', 'Enter', false)).toBeNull();
  });
});

describe('pointer arranging', () => {
  it('rounds a pointer delta to whole grid cells', () => {
    expect(cellsFromPointer(170, -40, 300, 200)).toEqual({ columns: 1, rows: 0 });
    expect(cellsFromPointer(-460, 310, 300, 200)).toEqual({ columns: -2, rows: 2 });
    expect(cellsFromPointer(10, 10, 0, 0)).toEqual({ columns: 0, rows: 0 });
  });

  it('drops a tile onto another and moves the other out of the way', () => {
    const dropped = moveTo(START, SPECS, CONFIG, 4, 'food', 0, 0);
    expect(at(dropped, 'food')).toMatchObject({ x: 0, y: 0 });
    expect(at(dropped, 'weather').y).toBeGreaterThan(0);
    stable(dropped);
  });

  it('keeps a dragged tile inside the grid', () => {
    expect(
      at(moveTo(START, SPECS, CONFIG, 4, 'weather', 9, -3), 'weather'),
    ).toMatchObject({ x: 2, y: 0 });
  });

  it('clamps a corner resize to the bounds and the grid edge', () => {
    expect(
      at(resizeTo(START, SPECS, CONFIG, 4, 'notes', 9, 9), 'notes'),
    ).toMatchObject({ w: 3, h: 3 });
    expect(
      at(resizeTo(START, SPECS, CONFIG, 4, 'calendar', 4, 2), 'calendar'),
    ).toMatchObject({ x: 2, w: 2 });
    expect(
      at(resizeTo(START, SPECS, CONFIG, 4, 'weather', 0, 0), 'weather'),
    ).toMatchObject({ w: 1, h: 1 });
  });
});

describe('describeItem', () => {
  it('reads position and size as people count', () => {
    expect(
      describeItem(item('calendar', 'calendar', 2, 0, 2, 3), 'Calendar'),
    ).toBe('Calendar, column 3, row 1, 2 by 3.');
  });
});

describe('withBreakpoint', () => {
  const arranged = moveTo(START, SPECS, CONFIG, 4, 'food', 0, 0);

  it('stores desktop changes in the primary breakpoint', () => {
    expect(
      withBreakpoint(null, SPECS, CONFIG, 'lg', arranged, START),
    ).toEqual({ schema: 2, breakpoints: { lg: arranged } });
  });

  it('keeps the primary breakpoint when only md is arranged', () => {
    const md = defaultLayout(DEFAULT_ITEMS, SPECS, 2, CONFIG);
    const fromNothing = withBreakpoint(null, SPECS, CONFIG, 'md', md, START);
    expect(fromNothing.breakpoints.md).toEqual(md);
    expect(fromNothing.breakpoints.lg).toEqual(START);

    const saved = { schema: 2 as const, breakpoints: { lg: arranged } };
    expect(
      withBreakpoint(saved, SPECS, CONFIG, 'md', md, START),
    ).toEqual({ schema: 2, breakpoints: { lg: arranged, md } });
  });

  it('uses per-widget bounds from the widget registry', () => {
    const boundedSpecs = [
      ...SPECS,
      spec('wide', [{ w: 3, h: 1 }], { minSize: { w: 2, h: 1 }, maxSize: { w: 5, h: 2 } }),
    ];
    const items = [item('wide', 'wide', 0, 0, 3, 1)];
    const resized = resizeTo(items, boundedSpecs, CONFIG, 4, 'wide', 9, 9);
    expect(at(resized, 'wide')).toMatchObject({ w: 4, h: 2 });
  });
});

describe('breakpoint instance reconciliation', () => {
  const md = defaultLayout(DEFAULT_ITEMS, SPECS, 2, CONFIG);
  const savedBoth = {
    schema: 2 as const,
    breakpoints: { lg: START, md },
  };

  it('propagates a widget added on the primary breakpoint to saved md', () => {
    const specs = [...SPECS, spec('kpi', [{ w: 1, h: 1 }])];
    const added = firstFreeSlot(
      START,
      { id: 'kpi', type: 'kpi', config: { metric: 'cash' } },
      1,
      1,
      4,
    );
    const layout = withBreakpoint(
      savedBoth,
      specs,
      CONFIG,
      'lg',
      [...START, added],
      START,
    );
    expect(layout.breakpoints.md?.some((entry) => entry.id === 'kpi')).toBe(true);
  });

  it('propagates a removal made on md back to the primary breakpoint', () => {
    const withoutWeather = md.filter((entry) => entry.id !== 'weather');
    const layout = withBreakpoint(
      savedBoth,
      SPECS,
      CONFIG,
      'md',
      withoutWeather,
      START,
      md,
    );
    expect(layout.breakpoints.lg.some((entry) => entry.id === 'weather')).toBe(false);
    expect(layout.breakpoints.md?.some((entry) => entry.id === 'weather')).toBe(false);
  });

  it('propagates a config change made on md to the primary breakpoint', () => {
    const configured = md.map((entry) =>
      entry.id === 'weather' ? { ...entry, config: { units: 'F' } } : entry
    );
    const layout = withBreakpoint(
      savedBoth,
      SPECS,
      CONFIG,
      'md',
      configured,
      START,
      md,
    );
    expect(
      layout.breakpoints.lg.find((entry) => entry.id === 'weather')?.config,
    ).toEqual({ units: 'F' });
  });
});
