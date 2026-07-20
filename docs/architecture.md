# Architecture

Strutz uses a small functional core surrounded by UI and platform adapters.

The findings and recommended follow-up order from the first cleanup pass are in [code-review.md](code-review.md).

## Module boundaries

- `src/core/types.ts`: serialized scene schema and domain names.
- `src/core/constants.ts`: the construction catalog. New grid, node, or strut size families start here.
- `src/core/rules.ts`: vector math and geometry calculations with no scene mutation.
- `src/core/brush.ts`: renderer-independent half-space clipping and panel brush geometry.
- `src/core/placement.ts`: renderer-independent placement decisions and reasoned validation results.
- `src/core/scene.ts`: immutable scene mutations, attachment normalization, panel topology, and cascade deletion.
- `src/core/layers.ts`: flat layer membership, visibility, selection assignment, and deletion reassignment.
- `src/core/composition.ts`: dependency-closed assembly clipboard payloads, grid-safe rotations, placement validation, and merging.
- `src/core/widgetGeometry.ts`: shared widget orientation frames and renderer-independent oriented collision volumes.
- `src/core/document.ts`: scene creation and text/OBJ serialization.
- `src/core/exportStl.ts`: weldable, millimeter-scaled STL serialization for slicers.
- `src/ui`: React interaction state and Three.js rendering.
- `electron`: native file/menu adapter. The browser build remains usable without it.

Dependencies should point inward: platform and UI code may import core modules; core modules must not import React, Three.js, browser APIs, or Electron.

## Extension workflow

For a new construction feature:

1. Add serialized types only if the document schema needs new state.
2. Add configurable catalog values to `CONSTRUCTION_RULES`.
3. Express geometry and placement constraints as pure core functions returning either data or a reasoned invalid result.
4. Cover accepted boundaries and rejection reasons with core tests.
5. Add immutable scene mutations and define cascade behavior.
6. Add UI gestures and rendering last, consuming the core API instead of repeating its math.
7. Update `docs/construction-rules.md` when an invariant changes.

`Scene.tsx` still owns many interaction and mesh concerns and is the primary remaining maintainability hotspot. Strut and panel selection are now lifted to the application boundary for contextual commands; future work should continue extracting node/widget selection, mesh rendering, and draw-session state.

Contextual panel command availability lives in `src/ui/panelActions.ts`. Loop discovery and validation remain in the core so selection gestures and alternate clients can share identical topology rules.

## Known follow-up work

- Split `Scene.tsx` into interaction hooks and presentational mesh components.
- Replace the shallow file-shape assertion with versioned runtime document validation and migrations.
- Extract undo/redo history and file commands from `App.tsx`.
- Lazy-load exporter and renderer-heavy dependencies if web startup size becomes a concern; the current production bundle triggers Vite's 500 kB chunk warning.
