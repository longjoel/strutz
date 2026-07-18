# Strutz

Strutz is an experimental 3D construction editor for building node-and-strut assemblies on a grid. It is built with React, Three.js, and Vite.

## Features

- Place cubic nodes connected by straight struts.
- Extend a multi-node selection with matching straight struts in one operation.
- Use valid strut lengths of `1`, `3`, and `7`.
- Connect perpendicular faces with 45-degree corner struts when a valid target node exists.
- Subdivide straight struts by inserting nodes.
- Select and drag nodes along face directions.
- Right-click nodes or struts to delete them.
- Undo/redo scene edits.
- Save/open scenes as JSON.
- Export scenes as JSON, OBJ, or glTF.
- Orbit the camera with left-drag, middle-drag, or the viewport gizmo.

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

- `V`: Select/move mode
- `S`: Draw strut mode
- `A`: Widget mode
- `Esc`: Clear selection or cancel drawing
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z`/`Ctrl+Y`: Redo
- `Ctrl+S`: Save JSON
- `P`: Snap a panel into the next available face of a selected closed strut loop
- `F`: Flip selected panels between their top and bottom faces
- `R`: Rotate selected widgets by 90 degrees around their attachment face
- `Delete`/`Backspace`: Delete selected nodes, struts, panels, or widgets
- Right-click a node: delete that node and attached struts/widgets
- Right-click a strut: delete only that strut

## Construction Rules

- Nodes are unit cubes centered on the grid.
- Each node face can hold one attachment: a strut or a widget.
- Straight struts connect opposite faces along one axis only.
- Starting a straight strut from one of several selected nodes previews and places the same length from every selected node as one undoable operation.
- Straight strut clear spans must be `1`, `3`, or `7` grid units.
- 45-degree corner struts connect perpendicular faces across exactly two axes.
- 45-degree corner footprints must be square, and each side must resolve to a valid strut length.
- Strut geometry routes from face center to face center; 45-degree struts use short face stubs and a flat, aligned middle segment.
- Panels are constrained by one closed loop of selected struts. Flat loops create inset planar panels; non-planar loops create faceted hull skins.
- Panels render inside the loop, meeting the inner edges of flat constraining struts or spanning non-planar tube routes as a hull skin.
- Each closed strut loop accepts one panel on each side, allowing an enclosed box to be built from four struts and four nodes.
- Widgets snap to a free node face. Antennas, rocket engines, and cockpits point outward and can rotate in quarter turns.

## Notes

This is an early prototype. The data model and interaction rules are still evolving.

## License

MIT
