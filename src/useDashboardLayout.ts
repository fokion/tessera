import { useCallback, useEffect, useState } from 'react';
import type {
  DashboardConfig,
  DashboardLayout,
  LayoutAdapter,
  LayoutConflict,
  LayoutItem,
  LayoutSaveResult,
  LayoutState,
  WidgetLayoutSpec,
} from './types';
import {
  breakpointByName,
  defaultLayout,
  firstFreeSlot,
  layoutFor,
  primaryBreakpoint,
  widgetBounds,
} from './layout';
import { withBreakpoint } from './arrange';

export function isLayoutConflict(
  value: LayoutSaveResult,
): value is LayoutConflict {
  return Boolean(value && 'conflict' in value && value.conflict);
}

function currentViewport(config: DashboardConfig): string {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return primaryBreakpoint(config).name;
  }
  const ordered = [...config.breakpoints].sort(
    (a, b) => b.minWidth - a.minWidth,
  );
  return (
    ordered.find((breakpoint) =>
      window.matchMedia(`(min-width: ${breakpoint.minWidth}px)`).matches,
    )?.name ?? config.breakpoints[config.breakpoints.length - 1].name
  );
}

/** The breakpoint name matching the current viewport. */
export function useViewport(config: DashboardConfig): string {
  const [viewport, setViewport] = useState(() => currentViewport(config));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const lists = config.breakpoints.map((breakpoint) =>
      window.matchMedia(`(min-width: ${breakpoint.minWidth}px)`),
    );
    const update = () => setViewport(currentViewport(config));
    for (const list of lists) list.addEventListener('change', update);
    return () => {
      for (const list of lists) list.removeEventListener('change', update);
    };
  }, [config]);

  return viewport;
}

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

function newItemId(): string {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (cryptoObject?.randomUUID) return `item-${cryptoObject.randomUUID()}`;
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseDashboardLayoutOptions {
  specs: readonly WidgetLayoutSpec[];
  config: DashboardConfig;
  adapter: LayoutAdapter;
  /** Instances shown before anyone arranges the dashboard. */
  defaultItems?: readonly LayoutItem[];
  /** Server-rendered state. `undefined` asks the hook to load it. */
  initial?: LayoutState | null;
  viewport?: string;
}

/**
 * Shared dashboard layout state and arrange mode.
 *
 * All mutations happen on a draft; the saved layout is only replaced after
 * the adapter accepts a save. Add/remove/config helpers start a draft
 * automatically, so a host app can wire them straight to a picker and a
 * per-tile settings dialog.
 */
export function useDashboardLayout({
  specs,
  config,
  adapter,
  defaultItems = [],
  initial,
  viewport: viewportOverride,
}: UseDashboardLayoutOptions) {
  const detectedViewport = useViewport(config);
  const viewport = viewportOverride ?? detectedViewport;
  const breakpoint = breakpointByName(config, viewport) ?? primaryBreakpoint(config);

  const [saved, setSaved] = useState<LayoutState | null | undefined>(initial);
  const [draft, setDraft] = useState<LayoutItem[] | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [conflict, setConflict] = useState<LayoutState | null>(null);

  useEffect(() => setSaved(initial), [initial]);

  useEffect(() => {
    if (initial !== undefined) return;
    let active = true;
    adapter.load().then(
      (state) => active && setSaved(state),
      () => active && setSaved(null),
    );
    return () => {
      active = false;
    };
  }, [adapter, initial]);

  const arranging = draft !== null;
  const savedItems = layoutFor(
    saved?.layout ?? null,
    specs,
    config,
    breakpoint.name,
    defaultItems,
  );
  const items = draft ?? savedItems;

  // Pick up changes saved elsewhere when this tab comes back into view.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || arranging || !saved) return;
      adapter.load().then(setSaved, () => undefined);
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [adapter, arranging, saved]);

  const start = useCallback(() => {
    setStatus({ kind: 'idle' });
    setDraft(savedItems);
  }, [savedItems]);

  const cancel = useCallback(() => {
    setDraft(null);
    setStatus({ kind: 'idle' });
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(defaultLayout(defaultItems, specs, breakpoint.columns, config));
  }, [defaultItems, specs, breakpoint.columns, config]);

  const save = useCallback(
    async (version = saved?.version ?? 0) => {
      if (!draft || !saved) return;
      setStatus({ kind: 'saving' });
      try {
        const result = await adapter.save(
          withBreakpoint(
            saved.layout,
            specs,
            config,
            breakpoint.name,
            draft,
            defaultItems,
          ),
          version,
        );
        if (isLayoutConflict(result)) {
          setConflict(result.current);
          setStatus({ kind: 'idle' });
          return;
        }
        setSaved(result);
        setDraft(null);
        setConflict(null);
        setStatus({ kind: 'idle' });
      } catch (error) {
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Saving failed',
        });
      }
    },
    [adapter, breakpoint.name, config, defaultItems, draft, saved, specs],
  );

  /**
   * Save the current draft over a conflict. `theirs` gives up this draft and
   * adopts the other client's layout; `mine` retries with their version.
   */
  const resolveConflict = useCallback(
    (choice: 'theirs' | 'mine') => {
      if (!conflict) return;
      if (choice === 'theirs') {
        setSaved(conflict);
        setDraft(null);
        setConflict(null);
        return;
      }
      void save(conflict.version);
    },
    [conflict, save],
  );

  const replaceSaved = useCallback((next: LayoutState) => {
    setSaved(next);
    setDraft(null);
  }, []);

  const reset = useCallback(
    async (version = saved?.version ?? 0) => {
      setStatus({ kind: 'saving' });
      try {
        const result = await adapter.reset(version);
        if (isLayoutConflict(result)) {
          setConflict(result.current);
          setStatus({ kind: 'idle' });
          return;
        }
        setSaved(result);
        setDraft(null);
        setConflict(null);
        setStatus({ kind: 'idle' });
      } catch (error) {
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Reset failed',
        });
      }
    },
    [adapter, saved],
  );

  const withDraft = useCallback(
    (updater: (current: LayoutItem[]) => LayoutItem[]) => {
      setDraft((current) => updater(current ?? savedItems));
    },
    [savedItems],
  );

  const addItem = useCallback(
    (type: string, configOverride?: Record<string, unknown>): LayoutItem | null => {
      const spec = specs.find((candidate) => candidate.type === type);
      if (!spec) return null;
      const maxItems = config.maxItems ?? Number.POSITIVE_INFINITY;
      const base = draft ?? savedItems;
      if (base.length >= maxItems) return null;
      const size = widgetBounds(spec, config).default;
      const width = Math.min(size.w, breakpoint.columns);
      const height = size.h;
      const item = firstFreeSlot(
        base,
        {
          id: newItemId(),
          type,
          config: { ...(configOverride ?? {}) },
        },
        width,
        height,
        breakpoint.columns,
      );
      setDraft([...base, item]);
      return item;
    },
    [breakpoint.columns, config, draft, savedItems, specs],
  );

  const removeItem = useCallback(
    (id: string) => {
      withDraft((current) => current.filter((item) => item.id !== id));
    },
    [withDraft],
  );

  const updateItemConfig = useCallback(
    (id: string, next: Record<string, unknown>) => {
      withDraft((current) =>
        current.map((item) =>
          item.id === id ? { ...item, config: next } : item,
        ),
      );
    },
    [withDraft],
  );

  return {
    /** Current instances: the draft while arranging, otherwise the saved layout. */
    items,
    savedItems,
    draft,
    arranging,
    breakpoint,
    viewport,
    available: saved !== null && saved !== undefined,
    loaded: saved !== undefined,
    saved,
    status,
    conflict,
    start,
    cancel,
    resetDraft,
    save,
    reset,
    setDraft,
    addItem,
    removeItem,
    updateItemConfig,
    resolveConflict,
    replaceSaved,
  };
}
