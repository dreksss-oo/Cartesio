const { contextBridge, ipcRenderer, webFrame } = require('electron');
contextBridge.exposeInMainWorld('cartesio', { scanPlugins: dirs => ipcRenderer.invoke('scan-plugins', dirs), pickFolders: () => ipcRenderer.invoke('pick-folders'),
  saveFile: o => ipcRenderer.invoke('save-file', o), openFile: o => ipcRenderer.invoke('open-file', o), setZoom: f => webFrame.setZoomFactor(+f || 1),
  readSrc: n => ipcRenderer.sendSync('read-src', n),
  onBeforeClose: fn => ipcRenderer.on('before-close', fn), canClose: () => ipcRenderer.send('can-close') });
ipcRenderer.on('host-ports', e => window.postMessage({cartesioHost:true}, '*', e.ports));
