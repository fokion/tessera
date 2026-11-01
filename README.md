# @fokion/tessera

A configurable, unstyled dashboard grid for React 19. Tessera owns the layout
maths, arrange mode, per-widget configuration and conflict handling; the host
app supplies widgets and persistence.

## Documentation

- [Getting started](docs/getting-started.md) — install, config, first dashboard
- [Concepts](docs/concepts.md) — instances, breakpoints, drafts, conflicts
- [API reference](docs/api-reference.md) — every export, prop and type
- [Architecture](docs/architecture.md) — modules, flows and design decisions
- [C4 model](docs/c4/README.md) — context, container, component and dynamic views
- [PlantUML diagrams](docs/plantuml/README.md) — sequence, class, state and activity views
- [Development](docs/development.md) — tests, build, CI and diagram rendering

## Install

```bash
pnpm add @fokion/tessera react react-dom zod
```

Peer dependencies: `react@^19`, `react-dom@^19` and `zod@^4`.

## Basic usage

```tsx
import {
  Grid,
  useDashboardLayout,
  useViewport,
  type DashboardConfig,
  type LayoutAdapter,
  type WidgetDef,
} from '@fokion/tessera';
import '@fokion/tessera/tessera.css';

const config: DashboardConfig = {
  breakpoints: [
    { name: 'lg', columns: 4, minWidth: 1024 },
    { name: 'md', columns: 2, minWidth: 640 },
    { name: 'sm', columns: 1, minWidth: 0 },
  ],
  rowHeight: 180,
  gap: 12,
  defaultMaxSize: { w: 4, h: 4 },
};

const adapter: LayoutAdapter = {
  load: () => fetch('/api/dashboard/layout').then((r) => r.json()),
  save: async (layout, version) => {
    const response = await fetch('/api/dashboard/layout', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': `"${version}"` },
      body: JSON.stringify(layout),
    });
    if (response.status === 412) {
      return { conflict: true, current: await response.json() };
    }
    return response.json();
  },
  reset: async (version) => {
    const response = await fetch('/api/dashboard/layout', {
      method: 'DELETE',
      headers: { 'if-match': `"${version}"` },
    });
    return response.json();
  },
};

const widgets: WidgetDef[] = [/* ... */];

function Dashboard() {
  const viewport = useViewport(config);
  const dashboard = useDashboardLayout({
    specs: widgets,
    config,
    adapter,
    defaultItems: [{ id: 'portfolio', type: 'portfolio', config: {}, x: 0, y: 0, w: 2, h: 2 }],
  });

  return (
    <Grid
      items={dashboard.items}
      widgets={widgets}
      config={config}
      viewport={dashboard.viewport}
      arranging={dashboard.arranging}
      onChange={dashboard.setDraft}
      announce={(message) => console.log(message)}
      onConfigure={(item) => console.log('configure', item)}
      onRemove={dashboard.removeItem}
    />
  );
}
```

## Widget definitions

```tsx
import { z } from 'zod';
import type { WidgetDef } from '@fokion/tessera';

const allocationSchema = z.object({ topN: z.number().int().min(1).max(20) });

export const allocationWidget: WidgetDef<z.infer<typeof allocationSchema>> = {
  type: 'allocation',
  title: 'Allocation',
  sizes: [{ w: 2, h: 2 }, { w: 3, h: 2 }],
  minSize: { w: 1, h: 1 },
  maxSize: { w: 4, h: 4 },
  configSchema: allocationSchema,
  defaultConfig: { topN: 10 },
  component: ({ config }) => <AllocationChart topN={config.topN} />,
  ConfigForm: ({ config, onChange }) => (
    <input
      type="number"
      value={config.topN}
      onChange={(event) => onChange({ topN: Number(event.target.value) })}
    />
  ),
};
```

Instances are `{ id, type, config, x, y, w, h }`. Adding an instance uses
`dashboard.addItem(type, defaultConfig)`, removing uses
`dashboard.removeItem(id)`, and saving a new config uses
`dashboard.updateItemConfig(id, config)`.

## Layout and arrange mode

- `useDashboardLayout` loads the adapter state, derives layouts for each
  breakpoint, and keeps changes in a draft until `save()` succeeds.
- `Grid` supports pointer drag/resize and keyboard arranging: arrows move,
  Shift+arrows resize, Escape cancels.
- `start()`, `cancel()`, `save()`, `resetDraft()`, `reset()` and
  `resolveConflict('theirs' | 'mine')` are exposed.
- A `412`/conflict adapter result is surfaced as `dashboard.conflict`.
  `resolveConflict('mine')` replays local changes on top of the other tab's
  layout, so unrelated remote changes survive; `'theirs'` adopts their layout.
- `resetDraft()` resets only the active breakpoint, keeping widgets added on
  other breakpoints.

## Styling

Tessera is unstyled. Every element carries a `data-tessera-*` attribute and
the grid uses inline layout properties. Import `tessera.css` for a neutral
default, or style the hooks yourself:

- `[data-tessera-grid]`, `[data-tessera-tile]`, `[data-tessera-tile-header]`
- `[data-tessera-handle]`, `[data-tessera-resize]`, `[data-tessera-drop]`
- `[data-tessera-error]`, `[data-tessera-skeleton]`

CSS variables: `--tessera-radius`, `--tessera-surface`, `--tessera-border`,
`--tessera-text`, `--tessera-muted`, `--tessera-accent`, `--tessera-shadow`.

## Layout maths

`normaliseLayout`, `layoutFor`, `defaultLayout`, `validateLayoutBounds`,
`createLayoutSchema`, `moveTo`, `resizeTo`, `nudge`, `withBreakpoint` and the
`WidgetLayoutSpec` types are exported for hosts that need to validate on the
server or render a read-only preview.
