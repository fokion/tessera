# Getting started

## Requirements

- React 19 and React DOM 19
- Zod 4 (used for widget config schemas and the layout payload schema)
- A bundler that understands ESM and CSS imports

## Install

```bash
pnpm add @fokion/tessera react react-dom zod
```

`react`, `react-dom` and `zod` are peer dependencies, so the host application
controls their versions. Import the optional default styles once:

```ts
import '@fokion/tessera/tessera.css';
```

Tessera is unstyled by design. The CSS import is a neutral starting point; see
[Styling](#styling) for the data attributes and CSS variables.

## Define the dashboard configuration

Breakpoints are ordered widest first. The first entry is the **primary**
breakpoint and owns the instance set and each instance's configuration. Every
other breakpoint owns only positions and sizes.

```ts
import type { DashboardConfig } from '@fokion/tessera';

export const dashboardConfig: DashboardConfig = {
  breakpoints: [
    { name: 'lg', columns: 4, minWidth: 1024 },
    { name: 'md', columns: 2, minWidth: 640 },
    { name: 'sm', columns: 1, minWidth: 0 },
  ],
  rowHeight: 180,
  gap: 12,
  defaultMaxSize: { w: 4, h: 4 },
  maxItems: 20,
  maxRows: 100,
};
```

## Define a widget

A `WidgetDef` is a reusable definition: title, preset sizes, bounds, a Zod
config schema and the React component that renders one instance.

```tsx
import { z } from 'zod';
import type { WidgetDef } from '@fokion/tessera';
import { AllocationChart } from './AllocationChart';

const allocationConfig = z.object({
  topN: z.number().int().min(1).max(20),
});

export const allocationWidget: WidgetDef<z.infer<typeof allocationConfig>> = {
  type: 'allocation',
  title: 'Allocation',
  description: 'Portfolio weights by holding',
  sizes: [{ w: 2, h: 2 }, { w: 3, h: 2 }],
  minSize: { w: 1, h: 1 },
  maxSize: { w: 4, h: 4 },
  configSchema: allocationConfig,
  defaultConfig: { topN: 10 },
  component: ({ config }) => <AllocationChart topN={config.topN} />,
  ConfigForm: ({ config, onChange }) => (
    <input
      type="number"
      min={1}
      max={20}
      value={config.topN}
      onChange={(event) => onChange({ topN: Number(event.target.value) })}
    />
  ),
};
```

The `sizes` list holds the preset sizes; the first is the default for new
instances. `minSize` and `maxSize` clamp drag and keyboard resizing.

## Define the persistence adapter

The package never talks to a database or HTTP API directly. Implement
`LayoutAdapter` with the host's own client (fetch, TanStack Query, tRPC, …).
`version` is an opaque compare-and-set token; the server should reject a stale
write with a conflict result.

```ts
import type { LayoutAdapter, LayoutSaveResult } from '@fokion/tessera';

export const adapter: LayoutAdapter = {
  async load() {
    const response = await fetch('/api/dashboard/layout');
    return response.json();
  },

  async save(layout, version) {
    const response = await fetch('/api/dashboard/layout', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'if-match': `"${version}"`,
      },
      body: JSON.stringify(layout),
    });

    if (response.status === 412) {
      return (await response.json()) as LayoutSaveResult;
    }
    return response.json();
  },

  async reset(version) {
    const response = await fetch('/api/dashboard/layout', {
      method: 'DELETE',
      headers: { 'if-match': `"${version}"` },
    });
    return response.json();
  },
};
```

## Render the dashboard

```tsx
import {
  Grid,
  useDashboardLayout,
  useViewport,
  type LayoutItem,
  type WidgetDef,
} from '@fokion/tessera';
import { dashboardConfig } from './dashboardConfig';
import { allocationWidget } from './allocationWidget';
import { adapter } from './adapter';

const widgets: WidgetDef[] = [allocationWidget];

const defaultItems: LayoutItem[] = [
  { id: 'allocation', type: 'allocation', config: {}, x: 0, y: 0, w: 2, h: 2 },
];

export function Dashboard() {
  const viewport = useViewport(dashboardConfig);
  const dashboard = useDashboardLayout({
    specs: widgets,
    config: dashboardConfig,
    adapter,
    defaultItems,
  });

  return (
    <Grid
      items={dashboard.items}
      widgets={widgets}
      config={dashboardConfig}
      viewport={viewport}
      arranging={dashboard.arranging}
      onChange={dashboard.setDraft}
      announce={(message) => console.log(message)}
      onConfigure={(item) => console.log('configure', item)}
      onRemove={dashboard.removeItem}
    />
  );
}
```

`useViewport` is optional if the host already knows the active breakpoint; pass
`viewport` to `useDashboardLayout` and `Grid` directly.

## Arrange, save and cancel

`start()` copies the saved items into a draft. While a draft exists,
`arranging` is true and `Grid` shows the drag handles and resize corner.

```tsx
<button type="button" onClick={dashboard.start} disabled={dashboard.arranging}>
  Arrange
</button>
<button type="button" onClick={dashboard.cancel} disabled={!dashboard.arranging}>
  Cancel
</button>
<button
  type="button"
  onClick={() => void dashboard.save()}
  disabled={!dashboard.arranging || dashboard.status.kind === 'saving'}
>
  Save
</button>
```

Adding, removing or reconfiguring a widget starts a draft automatically, so a
picker or settings dialog does not need to call `start()` first.

## Handle a conflict

A `412` / conflict adapter result becomes `dashboard.conflict`. The draft is
kept. Offer the user two choices:

```tsx
{dashboard.conflict ? (
  <div role="alert">
    <p>Someone else saved this dashboard first.</p>
    <button onClick={() => dashboard.resolveConflict('theirs')}>
      Use their layout
    </button>
    <button onClick={() => dashboard.resolveConflict('mine')}>
      Keep my changes
    </button>
  </div>
) : null}
```

`theirs` adopts the other layout and discards the draft. `mine` replays the
local changes on top of the other layout, so unrelated changes from the other
tab are preserved. See [Concepts](./concepts.md#conflicts-and-three-way-merge).

## Styling

Tessera renders semantic elements with `data-tessera-*` hooks and inline grid
placement. Import `tessera.css` for a neutral default or target the hooks:

- `[data-tessera-grid]`, `[data-tessera-tile]`, `[data-tessera-tile-header]`
- `[data-tessera-handle]`, `[data-tessera-resize]`, `[data-tessera-drop]`
- `[data-tessera-error]`, `[data-tessera-skeleton]`

CSS variables: `--tessera-radius`, `--tessera-surface`, `--tessera-border`,
`--tessera-text`, `--tessera-muted`, `--tessera-accent`,
`--tessera-accent-soft`, `--tessera-danger`, `--tessera-shadow`.

The grid itself uses inline `display: grid`, `grid-template-columns`,
`grid-auto-rows` and `gap`, so a host stylesheet can override the visual
treatment without fighting the layout engine.

## Next steps

- [Concepts](./concepts.md) — the data model and the rules behind it
- [API reference](./api-reference.md) — every export and prop
- [Architecture](./architecture.md) — module boundaries and flows
- [C4 model](./c4/README.md) and [PlantUML diagrams](./plantuml/README.md)
