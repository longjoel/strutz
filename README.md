# Strutz

Strutz is an experimental 3D construction editor for building node-and-strut assemblies on a grid. It is built with React, Three.js, and Vite.

![Strutz — Coming Soon](docs/images/strutz-coming-soon.png)

## Editor Preview

![The Strutz editor displaying a completed node, strut, and panel assembly](docs/images/strutz-editor.png)

## Features

- Nodes are created automatically as strut endpoints; there is one node type.
- Start Structural struts by clicking a node, then use mouse direction and distance to choose the axis and catalog length.
- Extend a multi-node selection with matching straight struts in one operation.
- Use valid strut lengths of `1`, `3`, and `7`.
- Use Structural struts for straight axis-aligned connections and External struts for routed connections between perpendicular faces.
- Subdivide straight struts by inserting nodes.
- Select any part with right-click and extend the selection with `Shift`+left-click.
- Delete selected parts with `Delete` or `Backspace`; placed nodes are not repositionable.
- Undo/redo scene edits.
- Save/open scenes as JSON.
- Export scenes as JSON, OBJ, or glTF.
- Orbit the camera with left-drag, middle-drag, or the viewport gizmo.
- Re-center the camera on selected parts while preserving the current view offset.
- Toggle automatic camera follow independently of selection.
- Toggle between perspective and orthographic cameras.
- Hover nodes, struts, panels, and widgets to see a contrasting geometry outline.

## Getting Started

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Run TypeScript checks:

```sh
npm run typecheck
```

## Controls

- `S`: Structural strut mode
- `E`: External strut mode
- `A`: Widget mode
- Right-click a part: select only that part
- `Shift`+left-click parts: toggle multi-selection
- `Esc`: Clear selection or cancel drawing
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z`/`Ctrl+Y`: Redo
- `Ctrl+S`: Save JSON
- `P`: Snap a panel into the next available face of a selected closed strut loop
- `F`: Flip selected panels between their top and bottom faces
- `R`: Rotate selected widgets by 90 degrees around their attachment face
- `O`: Toggle perspective/orthographic camera
- `Delete`/`Backspace`: Delete selected nodes, struts, panels, or widgets

## Construction Rules

The formal domain contract, including terminology, validation APIs, and edge cases, is in [docs/construction-rules.md](docs/construction-rules.md). See [docs/architecture.md](docs/architecture.md) before extending the editor.

- Nodes are unit cubes centered on the grid.
- Each node face can hold one attachment: a strut or a widget.
- Straight struts connect opposite faces along one axis only.
- Starting a straight strut from one of several selected nodes previews and places the same length from every selected node as one undoable operation.
- Straight strut clear spans must be `1`, `3`, or `7` grid units.
- Planar corner struts connect perpendicular faces across exactly two axes.
- Each planar-corner axis run independently resolves to a valid strut length; unequal combinations such as 1×3 and 3×7 are allowed.
- Strut geometry routes from face center to face center; planar corners use short face stubs and one flat, aligned middle segment.
- Panels are constrained by one closed loop of selected struts. Flat loops create inset planar panels; non-planar loops create faceted hull skins.
- Panels render inside the loop, meeting the inner edges of flat constraining struts or spanning non-planar tube routes as a hull skin.
- Each closed strut loop accepts one panel on each side, allowing an enclosed box to be built from four struts and four nodes.
- Widgets snap to a free node face. Antennas, rocket engines, and cockpits point outward and can rotate in quarter turns.

## Notes

This is an early prototype. The data model and interaction rules are still evolving.

## License

MIT
