const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("strutzElectron", {
  onMenuCommand(callback) {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("menu-command", listener);
    return () => ipcRenderer.removeListener("menu-command", listener);
  },
  openScene() {
    return ipcRenderer.invoke("dialog:open-scene");
  },
  saveScene(payload) {
    return ipcRenderer.invoke("file:save-scene", payload);
  },
  exportScene(payload) {
    return ipcRenderer.invoke("file:export-scene", payload);
  },
  writeClipboardText(text) {
    return ipcRenderer.invoke("clipboard:write-text", text);
  },
  readClipboardText() {
    return ipcRenderer.invoke("clipboard:read-text");
  },
});
