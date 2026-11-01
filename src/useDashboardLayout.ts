import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DashboardConfig,
  DashboardLayout,
  LayoutAdapter,
  LayoutConflict,
  LayoutItem,
  LayoutSaveResult,
  LayoutState,
  WidgetSpecWithConfig,
} from './types';
import {
  LAYOUT_SCHEMA,
  breakpointByName,
  defaultLayout,
  firstFreeSlot,
  layoutFor,
  primaryBreakpoint,
  widgetBounds,
} from './layout';
import { mergeInstanceChanges, withBreakpoint } from './arrange';

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
  specs: readonly WidgetSpecWithConfig[];
  config: DashboardConfig;
  adapter: LayoutAdapter;
  /** Instances shown before anyone arranges the dashboard. */
  defaultItems?: readonly LayoutItem[];
  /**
   * Server-rendered state, read once when the hook mounts. `undefined` asks
   * the hook to load from the adapter. Use `replaceSaved` for later updates;
   * passing a fresh object on every render must not reset the dashboard.
   */
  initial?: LayoutState | null;
  viewport?: string;
}

const NO_DEFAULT_ITEMS: readonly LayoutItem[] = [];

/**
 * Merge each widget's default config into stored items and validate them.
 * Invalid configs fall back to the widget defaults rather than crashing the
 * tile.
 */
export function applyWidgetConfig(
  items: readonly LayoutItem[],
  specs: readonly WidgetSpecWithConfig[],
): LayoutItem[] {
  return items.map((item) => {
    const spec = specs.find((candidate) => candidate.type === item.type);
    if (!spec) return item;
    const merged = { ...(spec.defaultConfig ?? {}), ...item.config };
    if (!spec.configSchema) return { ...item, config: merged };
    const parsed = spec.configSchema.safeParse(merged);
    return {
      ...item,
      config: parsed.success
        ? (parsed.data as Record<string, unknown>)
        : { ...(spec.defaultConfig ?? {}) },
    };
  });
}

function configFor(
  spec: WidgetSpecWithConfig,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const merged = { ...(spec.defaultConfig ?? {}), ...(override ?? {}) };
  if (!spec.configSchema) return merged;
  const parsed = spec.configSchema.safeParse(merged);
  return parsed.success
    ? (parsed.data as Record<string, unknown>)
    : { ...(spec.defaultConfig ?? {}) };
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
  defaultItems = NO_DEFAULT_ITEMS,
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

  // Load once on mount. Depending on `adapter` here would re-run the effect
  // for every render when a host passes an inline object, which turns
  // `load -> setSaved -> render` into an infinite loop and an OOM. Later
  // refreshes go through the tab-visibility effect below or `replaceSaved`.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const arranging = draft !== null;
  const rawSavedItems = useMemo(
    () => layoutFor(
      saved?.layout ?? null,
      specs,
      config,
      breakpoint.name,
      defaultItems,
    ),
    [saved?.layout, specs, config, breakpoint.name, defaultItems],
  );
  const savedItems = useMemo(
    () => applyWidgetConfig(rawSavedItems, specs),
    [rawSavedItems, specs],
  );
  const items = useMemo(
    () => (draft ? applyWidgetConfig(draft, specs) : savedItems),
    [draft, savedItems, specs],
  );

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
    const primary = primaryBreakpoint(config);
    if (breakpoint.name === primary.name) {
      setDraft(defaultLayout(defaultItems, specs, breakpoint.columns, config));
      return;
    }

    // Reset only this breakpoint to the flow of the current primary layout.
    // Generating the default instances here would remove widgets the user
    // added on another breakpoint when the draft is saved.
    const primaryItems = layoutFor(
      saved?.layout ?? null,
      specs,
      config,
      primary.name,
      defaultItems,
    );
    const primaryOnly: DashboardLayout = {
      schema: LAYOUT_SCHEMA,
      breakpoints: { [primary.name]: primaryItems },
    };
    setDraft(
      layoutFor(
        primaryOnly,
        specs,
        config,
        breakpoint.name,
        defaultItems,
      ),
    );
  }, [
    breakpoint.columns,
    breakpoint.name,
    config,
    defaultItems,
    saved?.layout,
    specs,
  ]);

  const persistDraft = useCallback(
    async (
      layoutBase: DashboardLayout | null,
      version: number,
      baseItems: readonly LayoutItem[] | undefined,
      nextItems: LayoutItem[] = draft ?? [],
    ) => {
      if (!draft) return;
      setStatus({ kind: 'saving' });
      try {
        const result = await adapter.save(
          withBreakpoint(
            layoutBase,
            specs,
            config,
            breakpoint.name,
            nextItems,
            defaultItems,
            baseItems,
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
    [adapter, breakpoint.name, config, defaultItems, draft, specs],
  );

  const save = useCallback(
    async (version = saved?.version ?? 0) => {
      if (!draft || !saved) return;
      await persistDraft(saved.layout, version, savedItems);
    },
    [draft, persistDraft, saved, savedItems],
  );

  /**
   * Save the current draft over a conflict. `theirs` gives up this draft and
   * adopts the other client's layout; `mine` replays the local changes on top
   * of their layout so their unrelated changes are not discarded.
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
      if (!draft) {
        void save(conflict.version);
        return;
      }
      const theirsItems = layoutFor(
        conflict.layout,
        specs,
        config,
        breakpoint.name,
        defaultItems,
      );
      const merged = mergeInstanceChanges(
        savedItems,
        draft,
        theirsItems,
        specs,
        config,
        breakpoint.columns,
      );
      void persistDraft(
        conflict.layout,
        conflict.version,
        theirsItems,
        merged,
      );
    },
    [
      breakpoint.columns,
      breakpoint.name,
      config,
      conflict,
      defaultItems,
      draft,
      persistDraft,
      save,
      savedItems,
      specs,
    ],
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
      const configValue = configFor(spec, configOverride);
      const size = widgetBounds(spec, config).default;
      const width = Math.min(size.w, breakpoint.columns);
      const height = size.h;
      try {
        const item = firstFreeSlot(
          base,
          {
            id: newItemId(),
            type,
            config: configValue,
          },
          width,
          height,
          breakpoint.columns,
        );
        setDraft([...base, item]);
        return item;
      } catch (error) {
        if (error instanceof RangeError) return null;
        throw error;
      }
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
        current.map((item) => {
          if (item.id !== id) return item;
          const spec = specs.find((candidate) => candidate.type === item.type);
          if (!spec) return { ...item, config: next };
          const configValue = configFor(spec, next);
          return { ...item, config: configValue };
        }),
      );
    },
    [specs, withDraft],
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
