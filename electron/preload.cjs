// Secure preload exposing minimal IPC API to renderer (no Node primitives)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  analyze: (url) => ipcRenderer.invoke('analyze', { url }),
  start: (params) => ipcRenderer.invoke('dl-start', params),
  cancel: (id) => ipcRenderer.invoke('dl-cancel', id),
  onProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('dl-progress', h);
    return () => ipcRenderer.removeListener('dl-progress', h);
  },
  onDone: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('dl-done', h);
    return () => ipcRenderer.removeListener('dl-done', h);
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  onSettingsChanged: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('settings-changed', h);
    return () => ipcRenderer.removeListener('settings-changed', h);
  },
  openDownloads: () => ipcRenderer.invoke('open-downloads'),
  checkBinaries: () => ipcRenderer.invoke('binaries:check'),
  updateBinaries: () => ipcRenderer.invoke('binaries:update'),
  historyList: () => ipcRenderer.invoke('history:list'),
  historyClear: () => ipcRenderer.invoke('history:clear'),
  historyRemove: (id) => ipcRenderer.invoke('history:remove', id),
  openPath: (p) => ipcRenderer.invoke('path:open', p),
  revealPath: (p) => ipcRenderer.invoke('path:reveal', p),
  onClipboardUrl: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('clipboard-url', h);
    return () => ipcRenderer.removeListener('clipboard-url', h);
  },
  onAnalyzeTrigger: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('analyze:trigger', h);
    return () => ipcRenderer.removeListener('analyze:trigger', h);
  },
  jobsMetrics: () => ipcRenderer.invoke('jobs:metrics'),
  jobsCancelAll: () => ipcRenderer.invoke('jobs:cancelAll'),
  jobsRetryLastFailed: () => ipcRenderer.invoke('jobs:retryLastFailed'),
  jobsRetryAllFailed: () => ipcRenderer.invoke('jobs:retryAllFailed'),
  jobsRetryById: (id) => ipcRenderer.invoke('jobs:retryById', id),
  queueList: () => ipcRenderer.invoke('queue:list'),
  queueRemove: (id) => ipcRenderer.invoke('queue:remove', id),
  queueMove: (id, to) => ipcRenderer.invoke('queue:move', { id, to }),
  queueStartNow: (id) => ipcRenderer.invoke('queue:startNow', id),
  queueClear: () => ipcRenderer.invoke('queue:clear'),
  queueStartAll: () => ipcRenderer.invoke('queue:startAll'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  backupCreate: () => ipcRenderer.invoke('backup:create'),
  backupRestore: (dir) => ipcRenderer.invoke('backup:restore', dir),
  openBackups: () => ipcRenderer.invoke('open:backups'),
  openLogsFolder: () => ipcRenderer.invoke('open:logs-folder'),
  openLogFile: () => ipcRenderer.invoke('open:log-file'),
  pickDirectory: (options) => ipcRenderer.invoke('dialog:pickDirectory', options),
  getPaths: () => ipcRenderer.invoke('paths:get'),
  openSettingsFile: () => ipcRenderer.invoke('open:settings-file'),
  openHistoryFile: () => ipcRenderer.invoke('open:history-file'),
  // internal navigation push from main (tray shortcuts)
  _onNavigateTab: () => {
    const h = (_e, p) => {
      try {
        const tab = p?.tab;
        const ev = new CustomEvent('navigate-main-tab', { detail: tab });
        window.dispatchEvent(ev);
      } catch {}
    };
    ipcRenderer.on('navigate:tab', h);
    return () => ipcRenderer.removeListener('navigate:tab', h);
  },
});
