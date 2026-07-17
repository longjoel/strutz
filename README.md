# Strutz

Strutz is an experimental 3D construction editor for building node-and-strut assemblies on a grid. It is built with React, Three.js, and Vite.

## Features

- Place cubic nodes connected by straight struts.
- Use valid strut lengths of `1`, `3`, and `7`.
- Connect perpendicular faces with 45-degree corner struts when a valid target node exists.
- Subdivide straight struts by inserting nodes.
- Select and drag nodes along face directions.
- Right-click nodes or struts to delete them.
- Undo/redo scene edits.
- Save/open scenes as JSON.
- Export scenes as JSON or OBJ.
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
- `A`: Accessory mode
- `Esc`: Clear selection or cancel drawing
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z`/`Ctrl+Y`: Redo
- `Ctrl+S`: Save JSON
- `Delete`/`Backspace`: Delete selected nodes
- Right-click a node: delete that node and attached struts/accessories
- Right-click a strut: delete only that strut

## Notes

This is an early prototype. The data model and interaction rules are still evolving.

## License

MIT
