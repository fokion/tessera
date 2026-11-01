import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { z } from 'zod';
import type {
  DashboardConfig,
  DashboardLayout,
  LayoutAdapter,
  LayoutItem,
  LayoutState,
  WidgetSpecWithConfig,
} from '../src';
import { applyWidgetConfig, useDashboardLayout } from '../src';

const config: DashboardConfig = {
  breakpoints: [{ name: 'lg', columns: 4, minWidth: 0 }],
  defaultMaxSize: { w: 4, h: 4 },
};

const newsSpec: WidgetSpecWithConfig = {
  type: 'news',
  sizes: [{ w: 2, h: 2 }],
  defaultConfig: { limit: 5, ticker: '' },
  configSchema: z.object({
    limit: z.number().int().min(1).max(10),
    ticker: z.string(),
  }),
};

const specs = [newsSpec];

function state(layout: LayoutState['layout'], version = 0): LayoutState {
  return { layout, version, updatedBy: null, updatedAt: null };
}

function adapter(): LayoutAdapter & { save: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn(async () => state(null)),
    save: vi.fn(async (layout, version) => state(layout, version + 1)),
    reset: vi.fn(async (_version) => state(null, 1)),
  };
}

const item = (id: string, config: Record<string, unknown> = {}): LayoutItem => ({
  id,
  type: 'news',
  config,
  x: 0,
  y: 0,
  w: 2,
  h: 2,
});

describe('applyWidgetConfig', () => {
  it('merges defaults and parses the stored config', () => {
    expect(applyWidgetConfig([item('a', { limit: 7 })], specs)[0].config)
      .toEqual({ limit: 7, ticker: '' });
  });

  it('falls back to defaults when stored config is invalid', () => {
    expect(applyWidgetConfig([item('a', { limit: 99 })], specs)[0].config)
      .toEqual({ limit: 5, ticker: '' });
  });
});

describe('useDashboardLayout config handling', () => {
  it('applies defaultConfig when adding a widget', async () => {
    const layoutAdapter = adapter();
    const initial = state(null);
    const { result } = renderHook(() => useDashboardLayout({
      specs,
      config,
      adapter: layoutAdapter,
      defaultItems: [],
      initial,
    }));

    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => {
      result.current.addItem('news');
    });

    expect(result.current.items[0].config).toEqual({ limit: 5, ticker: '' });
  });

  it('falls back to defaults for an invalid config override', async () => {
    const layoutAdapter = adapter();
    const initial = state(null);
    const { result } = renderHook(() => useDashboardLayout({
      specs,
      config,
      adapter: layoutAdapter,
      defaultItems: [],
      initial,
    }));

    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => {
      result.current.addItem('news', { limit: 99 });
    });

    expect(result.current.items[0].config).toEqual({ limit: 5, ticker: '' });
  });

  it('preserves the other tab changes when resolving with mine', async () => {
    const layoutAdapter = adapter();
    const initial = state({
      schema: 2,
      breakpoints: { lg: [item('a', { limit: 5 })] },
    });
    const otherTab = state({
      schema: 2,
      breakpoints: {
        lg: [
          item('a', { limit: 5 }),
          { ...item('b', { limit: 5 }), x: 2 },
        ],
      },
    }, 2);
    const mergedState = state(otherTab.layout, 3);
    layoutAdapter.save = vi.fn()
      .mockResolvedValueOnce({ conflict: true, current: otherTab })
      .mockResolvedValueOnce(mergedState);

    const { result } = renderHook(() => useDashboardLayout({
      specs,
      config,
      adapter: layoutAdapter,
      defaultItems: [],
      initial,
      viewport: 'lg',
    }));

    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.updateItemConfig('a', { limit: 9 });
    });
    await act(async () => {
      await result.current.save(0);
    });
    expect(result.current.conflict).not.toBeNull();

    act(() => {
      result.current.resolveConflict('mine');
    });
    await waitFor(() => expect(result.current.conflict).toBeNull());

    const saved = layoutAdapter.save.mock.calls[1][0] as DashboardLayout;
    const items = saved.breakpoints.lg;
    expect(items.some((entry) => entry.id === 'b')).toBe(true);
    expect(items.find((entry) => entry.id === 'a')?.config).toEqual({
      limit: 9,
      ticker: '',
    });
  });

  it('resets only the current breakpoint', async () => {
    const multiConfig: DashboardConfig = {
      breakpoints: [
        { name: 'lg', columns: 4, minWidth: 1024 },
        { name: 'md', columns: 2, minWidth: 0 },
      ],
      defaultMaxSize: { w: 4, h: 4 },
    };
    const a = item('a', { limit: 5 });
    const b = { ...item('b', { limit: 5 }), x: 2 };
    const initial = state({
      schema: 2,
      breakpoints: {
        lg: [a, b],
        md: [
          { ...a, w: 2, h: 2 },
          { ...b, x: 0, y: 2, w: 2, h: 2 },
        ],
      },
    });
    const layoutAdapter = adapter();
    const { result } = renderHook(() => useDashboardLayout({
      specs,
      config: multiConfig,
      adapter: layoutAdapter,
      defaultItems: [a],
      initial,
      viewport: 'md',
    }));

    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.resetDraft();
    });
    await act(async () => {
      await result.current.save(0);
    });

    const saved = layoutAdapter.save.mock.calls[0][0] as DashboardLayout;
    expect(saved.breakpoints.lg.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(saved.breakpoints.md?.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('propagates adds to every saved breakpoint on save', async () => {
    const multiConfig: DashboardConfig = {
      breakpoints: [
        { name: 'lg', columns: 4, minWidth: 1024 },
        { name: 'md', columns: 2, minWidth: 0 },
      ],
      defaultMaxSize: { w: 4, h: 4 },
    };
    const layoutAdapter = adapter();
    const initial = state({
      schema: 2,
      breakpoints: { lg: [], md: [] },
    });
    const { result } = renderHook(() => useDashboardLayout({
      specs,
      config: multiConfig,
      adapter: layoutAdapter,
      defaultItems: [],
      initial,
      viewport: 'lg',
    }));

    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => {
      result.current.addItem('news');
    });
    await act(async () => {
      await result.current.save(0);
    });

    expect(layoutAdapter.save).toHaveBeenCalledTimes(1);
    const saved = layoutAdapter.save.mock.calls[0][0];
    expect(saved.breakpoints.lg).toHaveLength(1);
    expect(saved.breakpoints.md).toHaveLength(1);
    expect(saved.breakpoints.md[0].config).toEqual({
      limit: 5,
      ticker: '',
    });
  });

  it('keeps saved state stable when initial and adapter objects are recreated', async () => {
    const layoutAdapter = adapter();
    const { result, rerender } = renderHook(() =>
      useDashboardLayout({
        specs: [...specs],
        config: { ...config },
        adapter: { ...layoutAdapter },
        initial: { ...state(null) },
        defaultItems: [],
      }));

    await waitFor(() => expect(result.current.available).toBe(true));
    const saved = result.current.saved;

    for (let index = 0; index < 5; index += 1) rerender();

    // A reset effect keyed on object identity would replace `saved` forever.
    expect(result.current.saved).toBe(saved);
  });
});
