export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type FaceName = "top" | "bottom" | "front" | "back" | "left" | "right";
/** `corner45` is retained for loading pre-planar-corner scene data. */
export type StrutKind = "straight" | "corner" | "corner45";

export interface AttachmentState {
  occupied: boolean;
  occupantId?: string;
  occupantType?: "strut" | "widget";
}

export type Attachments = Record<FaceName, AttachmentState>;

export interface NodeData {
  id: string;
  /** Missing only on legacy, pre-layer documents. */
  layerId?: string;
  position: Vec3;
  /** Optional concentrated connector/component mass used by physics export. */
  massKg?: number;
  attachments: Attachments;
}

export interface StrutData {
  id: string;
  layerId?: string;
  kind?: StrutKind;
  nodeA: string;
  faceA: FaceName;
  nodeB: string;
  faceB: FaceName;
  length: number;
}

export interface PanelData {
  id: string;
  layerId?: string;
  strutIds: string[];
  side?: "top" | "bottom";
}

export interface AccessoryData {
  id: string;
  nodeId: string;
  face: FaceName;
  rotation: number;
  definitionId: string;
}

export interface AccessoryDefinition {
  id: string;
  name: string;
  geometryType: "box" | "cylinder" | "wheel";
  params: Record<string, number>;
  color: string;
}

export type WidgetKind =
  | "antenna"
  | "rocket-engine"
  | "thruster"
  | "repulsor-pad"
  | "cockpit"
  | "wheel";

export interface WidgetData {
  id: string;
  layerId?: string;
  kind: WidgetKind;
  nodeId: string;
  face: FaceName;
  rotation: number;
  /** Overrides density-derived widget mass when supplied. */
  massKg?: number;
}

export interface PhysicsSettings {
  /** Effective density for structural geometry and widgets. */
  materialDensityKgPerM3: number;
  /** Used for nodes without an explicit massKg. */
  defaultNodeMassKg: number;
  /** Panels are surfaces, so their physical thickness must be supplied. */
  panelThicknessUnits: number;
}

export interface SceneData {
  /** Missing means the pre-versioned legacy format. */
  schemaVersion?: number;
  /** Missing only on version 1 and pre-versioned documents. */
  layers?: LayerData[];
  nodes: Record<string, NodeData>;
  struts: Record<string, StrutData>;
  panels: Record<string, PanelData>;
  widgets: Record<string, WidgetData>;
  /** Optional physical properties; defaults are used when absent. */
  physics?: Partial<PhysicsSettings>;
  /** Legacy input only. normalizeSceneAttachments migrates these to widgets. */
  accessories?: Record<string, AccessoryData>;
}

export interface LayerData {
  id: string;
  name: string;
  visible: boolean;
}

export interface SceneSelection {
  nodeIds: Set<string>;
  strutIds: Set<string>;
  panelIds: Set<string>;
  widgetIds: Set<string>;
}
