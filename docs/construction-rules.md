# Construction rules

This document is the domain contract for placement. UI previews and gestures may help a user satisfy these rules, but they must not define a second set of rules. Renderer-independent checks live in `src/core/placement.ts`; panel topology checks live in `src/core/scene.ts`.

## Shared terms

- A **node position** is the center of its cube.
- An **attachment point** is the center of one node face.
- A **strut length** is its clear face-to-face span, not the distance between node centers.
- A **side** is `top` or `bottom` relative to the canonical normal calculated for a panel boundary. It is stable and is not based on camera orientation.
- Length and coordinate comparisons use `RULE_EPSILON` to absorb floating-point noise.

The current catalog is defined once by `CONSTRUCTION_RULES` in `src/core/constants.ts`. The grid size and node size are 1 unit, strut width is 1 unit, and clear strut lengths are 1, 3, and 7 units.

## Physical export scale

glTF defines one coordinate unit as one meter. Strutz exports at `2/3` meter per construction unit, so a clear length-3 strut is exactly 2 meters long. Consequently, a unit node is 0.667 meter wide and the node-center spacing across a length-3 strut is 2.667 meters. OBJ remains in unitless construction coordinates because the format has no standard unit declaration.

## Node placement

1. Node centers lie on the construction grid on all three axes.
2. Nodes are axis-aligned cubes of `nodeSize`.
3. Two node volumes may neither overlap nor touch. With the current catalog, their centers must differ by more than 1 unit on at least one axis.
4. A node face has one attachment slot. One strut or one widget can occupy it; panels do not consume face slots.
5. Moving a selection is atomic. If any resulting node violates these constraints, none of the selected nodes move.

Use `validateNodePlacement` for a candidate and `validateSceneNodePlacement` after a batch edit or import.

## Straight-strut placement

1. Endpoints are different, existing nodes.
2. Both endpoint faces are free.
3. The endpoint faces are opposite faces.
4. The vector between attachment points lies on exactly one axis, which is also the source face axis.
5. The attachment-point distance is a catalog strut length.
6. Creating matching struts from a multi-node selection is atomic.

For a straight strut of clear length `L`, node centers are separated by `L + nodeSize`. Use `validateStrutPlacement` for validation and `getStraightStrutTarget` for endpoint construction.

## Planar corner-strut placement

1. The shared endpoint and face-slot rules above still apply.
2. Endpoint faces are perpendicular.
3. Node centers differ on exactly the two axes belonging to those faces.
4. Travel leaves the source face along its outward normal and arrives opposite the destination face normal.
5. Each absolute axis delta independently resolves to a catalog length. Runs may differ, allowing rectangular footprints such as 1×3, 1×7, and 3×7; equal runs remain valid 45-degree corners.
6. For compatibility with existing scenes, both axis deltas use either the catalog convention `L` or the center-spacing convention `L + nodeSize`. Mixing the two conventions within one corner is invalid.

The rendered route runs from the source face center, through a half-node outward stub, across a flat diagonal middle segment, through the destination stub, and into the destination face center.

## Panel placement

1. At least three unique, existing struts are required.
2. Every selected strut endpoint references an existing node, and a strut cannot connect a node to itself.
3. Within the selected boundary, every node has degree 2.
4. Traversal must return to its starting node and visit every selected strut exactly once. Disconnected loops, branches, and open chains are invalid.
5. A valid loop can hold at most one `top` panel and one `bottom` panel. Panel identity is based on the set of boundary strut IDs, independent of selection order.
6. Removing a boundary strut or endpoint node removes dependent panels.
7. Coplanar loops create inset planar faces. Supported non-planar loops create faceted hull skins; paired planar-corner ribs use the specialized strip geometry.

Use `validatePanelPlacement` before placement. Omitting its `side` argument asks whether either side remains available.

## Widget placement

1. The target node exists and its target face is free.
2. Rotation is stored as quarter turns around the attachment-face normal.
3. Removing the target node removes its widgets.

Use `validateWidgetPlacement` before placement.

## Mutation and persistence invariants

- New documents include `schemaVersion`. A missing version is the legacy pre-versioned format; newer unsupported versions are rejected rather than opened destructively.
- `attachments` is derived index data. `normalizeSceneAttachments` rebuilds it from struts and widgets after scene mutations and file loading.
- Removing nodes and struts cascades to structurally dependent entities.
- A user gesture that creates or moves several entities is committed as one scene update and therefore one undo step.
- Domain rules must remain independent of React, Three.js, Electron, and pointer events so alternate clients can reuse them.
