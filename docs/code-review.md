# Maintainability review

This pass focused on developer ergonomics, extension boundaries, and construction invariants. It intentionally did not redesign interaction behavior.

## Completed in this pass

- Moved draw-target math, connection-face inference, strut-run decomposition, and placement checks out of the Three.js scene component.
- Added reasoned validators for nodes, struts, panels, and widgets so callers can distinguish invalid geometry from occupied attachment slots.
- Centralized catalog values in `CONSTRUCTION_RULES`.
- Added a scene format version while retaining support for pre-versioned files.
- Removed the orphaned snapping module and an unused OBJ builder method.
- Documented module boundaries, extension workflow, and placement rules.

## Recommended next engineering work

1. **Versioned document validation and migrations.** `App.tsx` currently performs only a shallow shape assertion. Malformed entity records, broken references, invalid faces, and attachment conflicts can still reach normalization. Add a core parser that validates unknown JSON, migrates by `schemaVersion`, and reports actionable file errors.
2. **Break up `Scene.tsx`.** It still combines selection state, draw sessions, face dragging, keyboard commands, mesh generation, and rendering in a file over 2,000 lines. Extract one behavior at a time behind core commands or hooks; selection, dragging, and mesh components are natural seams.
3. **Make batch edits transactional in the core.** Several UI operations build a scene through a sequence of low-level immutable mutations and roll back by returning the previous scene. A command layer returning `{ scene, error }` would make atomicity reusable and easier to test.
4. **Separate canonical data from derived indexes.** Node `attachments` are serialized but rebuilt from struts and widgets. A future schema should either omit them from persistence or validate them explicitly, preventing two sources of truth.
5. **Extract document history and file commands.** `App.tsx` owns history, Electron/browser branching, file naming, alerts, and keyboard shortcuts. A history reducer plus document-service adapter would reduce callback coupling and make behavior testable.
6. **Avoid full-scene serialization for no-op detection.** History currently calls `JSON.stringify` on every proposed update. Prefer command results or structural reference equality once all mutations reliably preserve identity on no-op.
7. **Code-split if startup size matters.** The production bundle is roughly 1.18 MB minified and triggers Vite's chunk warning. Exporters are good lazy-load candidates.

## Notes for the usability pass

The usability pass should specifically test how users learn the three tool modes, discover face occupancy, understand why a preview is invalid, distinguish panel sides, recover from failed multi-node operations, and discover keyboard-only actions such as panel placement/flip. These are review targets, not conclusions from this engineering pass.
