export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type FaceName = "top" | "bottom" | "front" | "back" | "left" | "right";
export type StrutKind = "straight" | "corner45";

export interface AttachmentState {
  occupied: boolean;
  occupantId?: string;
  occupantType?: "strut" | "widget";
}

export type Attachments = Record<FaceName, AttachmentState>;

export interface NodeData {
  id: string;
  position: Vec3;
  attachments: Attachments;
}

export interface StrutData {
  id: string;
  kind?: StrutKind;
  nodeA: string;
  faceA: FaceName;
  nodeB: string;
  faceB: FaceName;
  length: number;
}

export interface PanelData {
  id: string;
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

export type WidgetKind = "antenna" | "rocket-engine" | "cockpit";

export interface WidgetData {
  id: string;
  kind: WidgetKind;
  nodeId: string;
  face: FaceName;
  rotation: number;
}

export interface SceneData {
  nodes: Record<string, NodeData>;
  struts: Record<string, StrutData>;
  panels: Record<string, PanelData>;
  widgets: Record<string, WidgetData>;
  /** Legacy input only. normalizeSceneAttachments migrates these to widgets. */
  accessories?: Record<string, AccessoryData>;
}
