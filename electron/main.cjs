const { app, BrowserWindow, Menu, dialog, ipcMain, clipboard } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: "Strutz",
    backgroundColor: "#1a1a2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function sendMenuCommand(command) {
  const window = BrowserWindow.getFocusedWindow() || mainWindow;
  window?.webContents.send("menu-command", command);
}

function buildMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuCommand("new"),
        },
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuCommand("open"),
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuCommand("save"),
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendMenuCommand("save-as"),
        },
        { type: "separator" },
        {
          label: "Export JSON...",
          click: () => sendMenuCommand("export-json"),
        },
        {
          label: "Export OBJ...",
          click: () => sendMenuCommand("export-obj"),
        },
        {
          label: "Export glTF...",
          click: () => sendMenuCommand("export-gltf"),
        },
        {
          label: "Export Printable STL...",
          click: () => sendMenuCommand("export-stl"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          click: () => sendMenuCommand("undo"),
        },
        {
          label: "Redo",
          accelerator: isMac ? "CmdOrCtrl+Shift+Z" : "Ctrl+Y",
          click: () => sendMenuCommand("redo"),
        },
        { type: "separator" },
        { role: "cut" },
        {
          label: "Copy",
          accelerator: "CmdOrCtrl+C",
          click: () => sendMenuCommand("copy"),
        },
        {
          label: "Paste",
          accelerator: "CmdOrCtrl+V",
          click: () => sendMenuCommand("paste"),
        },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev
          ? [
              { type: "separator" },
              { role: "reload" },
              { role: "toggleDevTools" },
            ]
          : []),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("clipboard:write-text", (_event, text) => {
  clipboard.writeText(typeof text === "string" ? text : "");
});

ipcMain.handle("clipboard:read-text", () => clipboard.readText());

ipcMain.handle("dialog:open-scene", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Strutz Scene",
    properties: ["openFile"],
    filters: [{ name: "Strutz Scene", extensions: ["json"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const text = await fs.readFile(filePath, "utf8");
  return {
    canceled: false,
    filePath,
    fileName: path.basename(filePath),
    text,
  };
});

ipcMain.handle("file:save-scene", async (_event, payload) => {
  let filePath = payload.filePath;

  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save Strutz Scene",
      defaultPath: payload.fileName || "strutz.json",
      filters: [{ name: "Strutz Scene", extensions: ["json"] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    filePath = result.filePath;
  }

  await fs.writeFile(filePath, payload.text, "utf8");
  return {
    canceled: false,
    filePath,
    fileName: path.basename(filePath),
  };
});

ipcMain.handle("file:export-scene", async (_event, payload) => {
  const filters = payload.type === "obj"
    ? [{ name: "Wavefront OBJ", extensions: ["obj"] }]
    : payload.type === "gltf"
      ? [{ name: "glTF", extensions: ["gltf"] }]
      : payload.type === "stl"
        ? [{ name: "Printable STL", extensions: ["stl"] }]
      : [{ name: "JSON", extensions: ["json"] }];

  const result = await dialog.showSaveDialog(mainWindow, {
    title: payload.type === "obj"
      ? "Export OBJ"
      : payload.type === "gltf"
        ? "Export glTF"
        : payload.type === "stl"
          ? "Export Printable STL"
          : "Export JSON",
    defaultPath: payload.fileName,
    filters,
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fs.writeFile(result.filePath, payload.text, "utf8");
  return { canceled: false, filePath: result.filePath };
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
