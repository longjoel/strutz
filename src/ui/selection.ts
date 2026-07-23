/** Immutable selection toggle shared by Shift+right-click handlers. */
export function toggleSelectionId(selection: Set<string>, id: string): Set<string> {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
