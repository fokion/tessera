# C4 model

The C4 views describe Tessera from the outside in. They are written with the
[C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) standard library,
which ships with PlantUML.

| Level | Diagram | Question it answers |
| --- | --- | --- |
| 1 | [`01-context.puml`](./01-context.puml) | Who uses Tessera, and which external systems surround it? |
| 2 | [`02-container.puml`](./02-container.puml) | What are the deployable/runtime pieces inside the browser and the host? |
| 3 | [`03-component.puml`](./03-component.puml) | How is the Tessera package split into modules, and how do they depend on each other? |
| 4 | [`04-dynamic-save-conflict.puml`](./04-dynamic-save-conflict.puml) | What happens, in order, when a save conflicts and the user keeps their changes? |

## Reading the diagrams

- **Person** — a human role.
- **System** — a system that delivers value. Tessera is the system of interest;
  the host application and its layout API are external.
- **Container** — a separately runnable or deployable unit. In this package the
  browser containers are the host UI, the Tessera library and the host adapter.
- **Component** — a module inside a container.
- **Rel** — a directed dependency or data flow. The second label is technology.

Tessera never talks to a database or HTTP API directly. The host application
implements `LayoutAdapter`; that adapter owns transport, authentication and
compare-and-set semantics. The C4 context and container views make this
boundary explicit.

## Conventions

- Solid arrows are runtime calls. Dashed relationships are implementation or
  build-time dependencies.
- The package boundary is always drawn; do not add host-specific widget
  implementations to the component view.
- Keep aliases stable (`tessera`, `hostApp`, `layoutApi`, `adapter`) so the
  diagrams can be read side by side.

## Rendering

From the repository root:

```bash
pnpm docs:diagrams
```

or, with a local PlantUML install:

```bash
plantuml -tsvg -o docs/diagrams docs/c4/*.puml
```

See [Development](../development.md#adding-a-diagram) for the contribution
checklist.
