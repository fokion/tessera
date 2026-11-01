import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { z } from 'zod';
import type {
  DashboardConfig,
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
    const { result } = renderHook(() => useDashboardLayout({
      specs,
      config,
      adapter: layoutAdapter,
      defaultItems: [],
      initial: state(null),
    }));

    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => {
      result.current.addItem('news');
    });

    expect(result.current.items[0].config).toEqual({ limit: 5, ticker: '' });
  });

  it('falls back to defaults for an invalid config override', async () => {
    const layoutAdapter = adapter();
    const { result } = renderHook(() => useDashboardLayout({
      specs,
      config,
      adapter: layoutAdapter,
      defaultItems: [],
      initial: state(null),
    }));

    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => {
      result.current.addItem('news', { limit: 99 });
    });

    expect(result.current.items[0].config).toEqual({ limit: 5, ticker: '' });
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
});
