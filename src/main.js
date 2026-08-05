'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const SUPPORTED_EXTENSIONS = new Set(['.doc', '.docx', '.txt', '.md']);
const activeWorkers = new Map();

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#f4f6f5',
    show: false,
    title: '文本重复片段检索',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.removeMenu();
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.once('ready-to-show', () => window.show());
  if (process.env.BID_AUDIT_SMOKE_SCREENSHOT) {
    window.webContents.once('did-finish-load', async () => {
      const image = await window.webContents.capturePage();
      await fs.writeFile(process.env.BID_AUDIT_SMOKE_SCREENSHOT, image.toPNG());
      app.quit();
    });
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  return window;
}

async function collectSupportedFiles(targetPath) {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) {
    return SUPPORTED_EXTENSIONS.has(path.extname(targetPath).toLowerCase()) ? [targetPath] : [];
  }

  const files = [];
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSupportedFiles(fullPath));
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

async function describeFiles(paths) {
  const uniquePaths = [...new Set(paths.map((filePath) => path.resolve(filePath)))];
  const files = [];
  for (const filePath of uniquePaths) {
    const stat = await fs.stat(filePath);
    files.push({
      path: filePath,
      name: path.basename(filePath),
      directory: path.dirname(filePath),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  }
  return files.sort((first, second) => first.name.localeCompare(second.name, 'zh-CN'));
}

function runAnalysis(window, payload) {
  const analysisId = crypto.randomUUID();
  const worker = new Worker(path.join(__dirname, 'analysis', 'worker.js'), {
    workerData: payload
  });
  activeWorkers.set(analysisId, worker);

  return new Promise((resolve, reject) => {
    worker.on('message', (message) => {
      if (message.type === 'progress') {
        window.webContents.send('analysis:progress', { analysisId, ...message });
      }
      if (message.type === 'result') {
        activeWorkers.delete(analysisId);
        resolve({ analysisId, result: message.result });
        worker.terminate();
      }
      if (message.type === 'error') {
        activeWorkers.delete(analysisId);
        reject(new Error(message.error));
        worker.terminate();
      }
    });
    worker.on('error', (error) => {
      activeWorkers.delete(analysisId);
      reject(error);
    });
    worker.on('exit', (code) => {
      activeWorkers.delete(analysisId);
      if (code !== 0) reject(new Error(`Analysis worker exited with code ${code}.`));
    });
  });
}

function registerIpc(window) {
  ipcMain.handle('files:pick', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: '选择文本文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '支持的文档', extensions: ['doc', 'docx', 'txt', 'md'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    return result.canceled ? [] : describeFiles(result.filePaths);
  });

  ipcMain.handle('folder:pick', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: '选择章节文件夹',
      properties: ['openDirectory']
    });
    if (result.canceled) return [];
    const paths = await collectSupportedFiles(result.filePaths[0]);
    return describeFiles(paths);
  });

  ipcMain.handle('files:resolve', async (_event, paths) => {
    const files = [];
    for (const targetPath of paths) files.push(...await collectSupportedFiles(targetPath));
    return describeFiles(files);
  });

  ipcMain.handle('analysis:run', async (_event, payload) => runAnalysis(window, payload));

  ipcMain.handle('analysis:cancel', async (_event, analysisId) => {
    const worker = activeWorkers.get(analysisId);
    if (!worker) return false;
    activeWorkers.delete(analysisId);
    await worker.terminate();
    return true;
  });

  ipcMain.handle('export:save', async (_event, { format, content }) => {
    const extensions = { csv: 'csv', json: 'json', html: 'html' };
    const extension = extensions[format];
    if (!extension) throw new Error('Unsupported export format.');
    const result = await dialog.showSaveDialog(window, {
      title: '导出核验报告',
      defaultPath: `文本重复片段检索报告.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, content, 'utf8');
    return result.filePath;
  });

  ipcMain.handle('shell:show-item', async (_event, filePath) => {
    shell.showItemInFolder(filePath);
  });
}

app.whenReady().then(() => {
  const window = createWindow();
  registerIpc(window);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const worker of activeWorkers.values()) worker.terminate();
  if (process.platform !== 'darwin') app.quit();
});
