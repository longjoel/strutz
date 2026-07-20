type StrutzMenuCommand =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "export-json"
  | "export-obj"
  | "export-gltf"
  | "export-stl"
  | "export-godot"
  | "undo"
  | "redo"
  | "copy"
  | "paste";

interface OpenSceneResult {
  canceled: boolean;
  filePath?: string;
  fileName?: string;
  text?: string;
}

interface SaveSceneResult {
  canceled: boolean;
  filePath?: string;
  fileName?: string;
}

interface ExportSceneResult {
  canceled: boolean;
  filePath?: string;
}

interface StrutzElectronApi {
  onMenuCommand(callback: (command: StrutzMenuCommand) => void): () => void;
  openScene(): Promise<OpenSceneResult>;
  saveScene(payload: {
    filePath: string | null;
    fileName: string;
    text: string;
  }): Promise<SaveSceneResult>;
  exportScene(payload: {
    fileName: string;
    text: string;
    type: "json" | "obj" | "gltf" | "stl";
  }): Promise<ExportSceneResult>;
  exportBundle(payload: {
    fileName: string;
    bytes: Uint8Array;
  }): Promise<ExportSceneResult>;
  writeClipboardText(text: string): Promise<void>;
  readClipboardText(): Promise<string>;
}

interface Window {
  strutzElectron?: StrutzElectronApi;
}
