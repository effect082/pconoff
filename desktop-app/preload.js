const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    getConfig: () => ipcRenderer.invoke('get-config'),
    checkStatus: () => ipcRenderer.invoke('check-status')
});
