'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { icons } = require('lucide');

const allowedIcons = new Set([
  'FilePlus2', 'FolderPlus', 'Trash2', 'Play', 'Square', 'Download',
  'Search', 'X', 'FileText', 'Files', 'Settings2', 'ShieldCheck',
  'ListFilter', 'TableProperties', 'Copy', 'Check', 'AlertCircle'
]);

function renderIcon(name) {
  const nodes = icons[name];
  if (!allowedIcons.has(name) || !Array.isArray(nodes)) return '';
  const content = nodes.map(([tag, attributes]) => {
    const serialized = Object.entries(attributes)
      .map(([key, value]) => `${key}="${String(value).replaceAll('"', '&quot;')}"`)
      .join(' ');
    return `<${tag} ${serialized}></${tag}>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
}

contextBridge.exposeInMainWorld('bidAudit', {
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  resolvePaths: (paths) => ipcRenderer.invoke('files:resolve', paths),
  runAnalysis: (payload) => ipcRenderer.invoke('analysis:run', payload),
  cancelAnalysis: (analysisId) => ipcRenderer.invoke('analysis:cancel', analysisId),
  saveExport: (payload) => ipcRenderer.invoke('export:save', payload),
  showItem: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('analysis:progress', listener);
    return () => ipcRenderer.removeListener('analysis:progress', listener);
  },
  icon: renderIcon
});
