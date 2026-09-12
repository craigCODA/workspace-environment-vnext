const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = Object.freeze({
  minimize: 'workspace-desktop:minimize',
  exit: 'workspace-desktop:exit',
});

contextBridge.exposeInMainWorld('workspaceDesktop', Object.freeze({
  minimize: () => ipcRenderer.invoke(CHANNELS.minimize),
  exit: () => ipcRenderer.invoke(CHANNELS.exit),
}));
