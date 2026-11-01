import { describe, expect, it } from 'vitest';
import type { LayoutItem } from '../src/types';
import {
  createLayoutSchema,
  defaultLayout,
  layoutFor,
  normaliseDashboardLayout,
  normaliseLayout,
  readingOrder,
  validateLayoutBounds,
  widgetBounds,
} from '../src/layout';
import {
  CONFIG,
  DEFAULT_ITEMS,
  SPECS,
  item,
  spec,
} from './fixtures';

function overlapping(items: LayoutItem[]): [string, string] | null {
  for (const [index, a] of items.entries()) {
    for (const b of items.slice(index + 1)) {
      if (
        a.x < b.x + b.w
        && b.x < a.x + a.w
        && a.y < b.y + b.h
        && b.y < a.y + a.h
      ) {
        return [a.id, b.id];
      }
    }
  }
  return null;
}

describe('defaultLayout', () => {
  it('keeps a valid default arrangement', () => {
    expect(defaultLayout(DEFAULT_ITEMS, SPECS, 4, CONFIG)).toEqual(DEFAULT_ITEMS);
  });

  it('drops unknown types and duplicate ids', () => {
    const result = defaultLayout(
      [
        item('ghost', 'ghost', 0, 0, 2, 2),
        item('weather', 'weather', 2, 0, 2, 3),
        item('weather', 'weather', 0, 0, 1, 1),
      ],
      SPECS,
      4,
      CONFIG,
    );
    expect(result).toEqual([item('weather', 'weather', 2, 0, 2, 3)]);
  });
});

describe('normaliseLayout', () => {
  it('does not add widgets that are absent from the instances', () => {
    const result = normaliseLayout(
      [item('weather', 'weather', 0, 0, 2, 2)],
      SPECS,
      4,
      {},
      CONFIG,
    );
    expect(result.map((entry) => entry.id)).toEqual(['weather']);
  });

  it('clamps sizes to each widget bounds and the grid width', () => {
    expect(
      normaliseLayout(
        [item('notes', 'notes', 0, 0, 4, 4)],
        SPECS,
        4,
        {},
        CONFIG,
      ),
    ).toEqual([item('notes', 'notes', 0, 0, 3, 3)]);

    expect(
      normaliseLayout(
        [item('notes', 'notes', 0, 0, 1, 1)],
        SPECS,
        4,
        {},
        CONFIG,
      ),
    ).toEqual([item('notes', 'notes', 0, 0, 2, 1)]);

    expect(
      normaliseLayout(
        [item('notes', 'notes', 3, 0, 2, 2)],
        SPECS,
        4,
        {},
        CONFIG,
      ),
    ).toEqual([item('notes', 'notes', 2, 0, 2, 2)]);

    expect(
      normaliseLayout(
        [item('notes', 'notes', 0, 0, 3, 2)],
        SPECS,
        2,
        {},
        CONFIG,
      ),
    ).toEqual([item('notes', 'notes', 0, 0, 2, 2)]);
  });

  it('resolves overlaps by pushing the later tile down', () => {
    const result = normaliseLayout(
      [
        item('weather', 'weather', 0, 0, 2, 2),
        item('calendar', 'calendar', 1, 1, 2, 2),
      ],
      SPECS,
      4,
      {},
      CONFIG,
    );
    expect(result).toEqual([
      item('weather', 'weather', 0, 0, 2, 2),
      item('calendar', 'calendar', 1, 2, 2, 2),
    ]);
  });

  it('keeps a pinned tile where it was dropped and moves the tiles it landed on', () => {
    const dropped = normaliseLayout(
      [
        item('weather', 'weather', 0, 0, 2, 2),
        item('calendar', 'calendar', 2, 0, 2, 2),
        item('notes', 'notes', 0, 0, 2, 2),
      ],
      SPECS,
      4,
      { pin: 'notes' },
      CONFIG,
    );
    expect(dropped).toEqual([
      item('notes', 'notes', 0, 0, 2, 2),
      item('calendar', 'calendar', 2, 0, 2, 2),
      item('weather', 'weather', 0, 2, 2, 2),
    ]);
    const stacked = [
      item('notes', 'notes', 0, 0, 2, 2),
      item('weather', 'weather', 0, 0, 2, 2),
    ];
    for (const pin of ['notes', 'weather']) {
      const result = normaliseLayout(stacked, SPECS, 4, { pin }, CONFIG);
      expect(result.find((entry) => entry.id === pin)).toMatchObject({ x: 0, y: 0 });
    }
  });

  it('swaps a pinned tile with the one it is moved onto', () => {
    const column = [
      item('weather', 'weather', 0, 0, 2, 2),
      item('calendar', 'calendar', 0, 2, 2, 2),
    ];
    const down = normaliseLayout(
      [{ ...column[0], y: 2 }, column[1]],
      SPECS,
      4,
      { pin: 'weather' },
      CONFIG,
    );
    expect(down).toEqual([
      item('calendar', 'calendar', 0, 0, 2, 2),
      item('weather', 'weather', 0, 2, 2, 2),
    ]);
    const up = normaliseLayout(
      [column[0], { ...column[1], y: 0 }],
      SPECS,
      4,
      { pin: 'calendar' },
      CONFIG,
    );
    expect(up.map((entry) => [entry.id, entry.y])).toEqual([
      ['calendar', 0],
      ['weather', 2],
    ]);
  });

  it('compacts tiles upwards into empty rows', () => {
    expect(
      normaliseLayout(
        [item('weather', 'weather', 1, 9, 2, 2)],
        SPECS,
        4,
        {},
        CONFIG,
      ),
    ).toEqual([item('weather', 'weather', 1, 0, 2, 2)]);
  });

  it('keeps a valid arranged layout exactly as it is', () => {
    const arranged = [
      item('calendar', 'calendar', 0, 0, 2, 3),
      item('weather', 'weather', 2, 0, 2, 2),
      item('food', 'food', 2, 2, 2, 2),
      item('notes', 'notes', 0, 3, 2, 1),
      item('manuals', 'manuals', 0, 4, 4, 1),
    ];
    expect(normaliseLayout(arranged, SPECS, 4, {}, CONFIG)).toEqual(arranged);
  });

  it('holds its invariants for random input (seeded, 500 runs)', () => {
    let seed = 42;
    const random = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    const specs = [
      ...SPECS,
      spec('tiny', [{ w: 1, h: 1 }], { maxSize: { w: 2, h: 2 } }),
      spec('big', [{ w: 3, h: 2 }], { minSize: { w: 2, h: 2 } }),
    ];
    const types = [...specs.map((entry) => entry.type), 'unknown'];

    for (let run = 0; run < 500; run += 1) {
      const columns = random(2) === 0 ? 4 : 2;
      const items = Array.from({ length: random(9) }, (_, index) => item(
        `item-${index}`,
        types[random(types.length)]!,
        random(4),
        random(8),
        1 + random(4),
        1 + random(4),
      ));
      const pin = random(3) === 0
        ? items[random(Math.max(1, items.length))]?.id
        : undefined;

      const once = normaliseLayout(items, specs, columns, { pin }, CONFIG);
      expect(normaliseLayout(once, specs, columns, {}, CONFIG), `idempotent, run ${run}`)
        .toEqual(once);
      expect(overlapping(once), `no overlap, run ${run}`).toBeNull();
      expect(new Set(once.map((entry) => entry.id)).size).toBe(once.length);
      for (const entry of once) {
        const specEntry = specs.find((candidate) => candidate.type === entry.type)!;
        const { min, max } = widgetBounds(specEntry, CONFIG);
        expect(entry.x + entry.w).toBeLessThanOrEqual(columns);
        expect(entry.w).toBeGreaterThanOrEqual(Math.min(min.w, columns));
        expect(entry.w).toBeLessThanOrEqual(max.w);
        expect(entry.h).toBeGreaterThanOrEqual(min.h);
        expect(entry.h).toBeLessThanOrEqual(max.h);
      }
    }
  });
});

describe('layoutFor', () => {
  const arranged = {
    schema: 1 as const,
    breakpoints: {
      lg: [
        item('calendar', 'calendar', 0, 0, 4, 2),
        item('weather', 'weather', 0, 2, 2, 2),
        item('notes', 'notes', 2, 2, 2, 2),
        item('food', 'food', 0, 4, 3, 2),
        item('manuals', 'manuals', 3, 4, 1, 1),
      ],
    },
  };

  it('falls back to the default instances when nothing is stored', () => {
    expect(layoutFor(null, SPECS, CONFIG, 'lg', DEFAULT_ITEMS)).toEqual(
      defaultLayout(DEFAULT_ITEMS, SPECS, 4, CONFIG),
    );
  });

  it('derives the 2-column layout from the desktop reading order', () => {
    const md = layoutFor(arranged, SPECS, CONFIG, 'md', DEFAULT_ITEMS);
    expect(md.every((entry) => entry.x + entry.w <= 2)).toBe(true);
    expect(overlapping(md)).toBeNull();
    expect(readingOrder(md)).toEqual([
      'calendar',
      'weather',
      'notes',
      'food',
      'manuals',
    ]);
  });

  it('uses an arranged md layout as is', () => {
    const md = [
      item('manuals', 'manuals', 0, 0, 2, 1),
      item('weather', 'weather', 0, 1, 1, 2),
    ];
    const result = layoutFor(
      { ...arranged, breakpoints: { ...arranged.breakpoints, md } },
      SPECS,
      CONFIG,
      'md',
      DEFAULT_ITEMS,
    );
    expect(result.slice(0, 2)).toEqual(md);
  });

  it('flows into the one-column breakpoint', () => {
    const sm = layoutFor(arranged, SPECS, CONFIG, 'sm', DEFAULT_ITEMS);
    expect(sm.every((entry) => entry.x === 0 && entry.w === 1)).toBe(true);
    expect(overlapping(sm)).toBeNull();
  });
});

describe('validateLayoutBounds', () => {
  const layout = (lg: LayoutItem[], md?: LayoutItem[]) => ({
    schema: 1 as const,
    breakpoints: { lg, ...(md ? { md } : {}) },
  });

  it('accepts a layout inside every bound', () => {
    expect(
      validateLayoutBounds(
        layout([item('manuals', 'manuals', 0, 0, 4, 1)]),
        SPECS,
        CONFIG,
      ),
    ).toBeNull();
  });

  it.each([
    [
      'an unknown type',
      layout([item('ghost', 'ghost', 0, 0, 1, 1)]),
      /unknown widget type "ghost"/,
    ],
    [
      'a duplicate id',
      layout([
        item('notes', 'notes', 0, 0, 2, 1),
        item('notes', 'notes', 2, 0, 2, 1),
      ]),
      /appears twice/,
    ],
    [
      'a size under minSize',
      layout([item('notes', 'notes', 0, 0, 1, 1)]),
      /between 2x1 and 3x3/,
    ],
    [
      'a tile past the md grid',
      layout([], [item('notes', 'notes', 1, 0, 2, 1)]),
      /md: "notes" does not fit in 2 columns/,
    ],
    [
      'an unknown breakpoint',
      {
        schema: 1 as const,
        breakpoints: { xl: [item('weather', 'weather', 0, 0, 2, 2)] },
      },
      /unknown breakpoint "xl"/,
    ],
  ])('reports %s', (_name, value, message) => {
    expect(validateLayoutBounds(value, SPECS, CONFIG)).toMatch(message);
  });
});

describe('normaliseDashboardLayout', () => {
  it('normalises known breakpoints and drops unknown ones', () => {
    const result = normaliseDashboardLayout(
      {
        schema: 1,
        breakpoints: {
          lg: [item('ghost', 'ghost', 0, 0, 1, 1)],
          xl: [item('weather', 'weather', 0, 0, 2, 2)],
        },
      },
      SPECS,
      CONFIG,
    );
    expect(result.breakpoints.lg).toEqual([]);
    expect(result.breakpoints.xl).toBeUndefined();
  });
});

describe('createLayoutSchema', () => {
  const schema = createLayoutSchema(CONFIG);

  it('accepts a valid layout with and without md', () => {
    expect(schema.safeParse({ schema: 1, breakpoints: { lg: [] } }).success).toBe(true);
    expect(
      schema.safeParse({
        schema: 1,
        breakpoints: {
          lg: [item('weather', 'weather', 0, 0, 2, 2)],
          md: [],
        },
      }).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown schema version', { schema: 2, breakpoints: { lg: [] } }],
    ['an extra top-level key', { schema: 1, breakpoints: { lg: [] }, extra: true }],
    ['an unknown breakpoint', { schema: 1, breakpoints: { xl: [] } }],
    [
      'a fractional coordinate',
      {
        schema: 1,
        breakpoints: { lg: [{ ...item('weather', 'weather', 0, 0, 2, 2), x: 0.5 }] },
      },
    ],
    [
      'a tile wider than the grid',
      {
        schema: 1,
        breakpoints: { lg: [item('weather', 'weather', 0, 0, 5, 2)] },
      },
    ],
  ])('rejects %s', (_name, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});

describe('widgetBounds', () => {
  it('uses the configured fallback maximum', () => {
    expect(widgetBounds({ sizes: [{ w: 2, h: 1 }] }, CONFIG)).toEqual({
      default: { w: 2, h: 1 },
      min: { w: 1, h: 1 },
      max: { w: 4, h: 4 },
    });
    expect(
      widgetBounds(
        { sizes: [{ w: 2, h: 1 }] },
        { ...CONFIG, defaultMaxSize: { w: 6, h: 3 } },
      ).max,
    ).toEqual({ w: 6, h: 3 });
  });
});
