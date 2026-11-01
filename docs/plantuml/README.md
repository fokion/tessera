# PlantUML diagrams

The C4 views answer *what the system is*. These diagrams answer *how it
behaves*: message order, data shape, state transitions and the normalisation
algorithm.

| Diagram | Type | What it shows |
| --- | --- | --- |
| [`sequence-load.puml`](./sequence-load.puml) | Sequence | Mount, adapter load, `layoutFor`, config merge and first render. |
| [`sequence-arrange-save.puml`](./sequence-arrange-save.puml) | Sequence | Pointer and keyboard arranging, draft updates, save and conflict. |
| [`sequence-conflict-merge.puml`](./sequence-conflict-merge.puml) | Sequence | "Keep mine" three-way merge and retry. |
| [`class-model.puml`](./class-model.puml) | Class | Public contracts and their relationships. |
| [`state-draft.puml`](./state-draft.puml) | State | Loading, ready, arranging, saving, conflict and error states. |
| [`activity-normalise.puml`](./activity-normalise.puml) | Activity | The `normaliseLayout` invariant pipeline. |

## Conventions

- Participants use the same names as the source modules (`Hook`, `Grid`,
  `Arrange`, `Layout`, `Adapter`).
- `layout.ts` and `arrange.ts` are pure; the diagrams do not show them reading
  React or the DOM.
- The adapter is always the only path to persistence. Tessera never calls an
  HTTP API or database directly.
- Diagrams use plain PlantUML (not the C4 standard library) unless they are in
  [`../c4/`](../c4/).

## Rendering

```bash
pnpm docs:diagrams
plantuml -tsvg -o docs/diagrams docs/plantuml/*.puml
```

`pnpm docs:check` runs PlantUML in `-checkonly` mode.
