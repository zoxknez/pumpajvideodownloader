// Minimal Electron main to preview the app as a desktop .exe (ESM)
import { app, BrowserWindow, ipcMain, shell, Notification, Tray, Menu, clipboard, nativeImage, dialog, powerSaveBlocker } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork, spawn } from 'node:child_process';
import fs from 'node:fs';
import chokidar from 'chokidar';

let serverChild = null;
const SERVER_PORT = process.env.PORT || '5176';

// __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let distWatcher = null;
const JOBS = new Map();
const JOB_META = new Map(); // id -> { filepath?: string, totalBytes?: number }
let MAX_CONCURRENT_JOBS = 3;
let CLIPBOARD_TIMER = null;
let LAST_CLIPBOARD_URL = '';
let TRAY = null;
let TRAY_REFRESH = null;
let TRAY_HIDE_NOTICE_SHOWN = false;
let POWER_SAVE_ID = null;
const QUEUE = [];

// Simple desktop settings persisted in userData
const SETTINGS_DEFAULT = {
  maxConcurrent: 3,
  limitRateKib: 0, // KiB/s, 0 = unlimited
  proxyUrl: '',
  proxyEnabled: true,
  connections: 3, // -N
  openOnComplete: false,
  downloadsRootDir: '',
  skipExisting: true,
  useDownloadArchive: true,
  filenameTemplate: '%(title)s.%(ext)s',
  subtitles: { enabled: false, embed: false, languages: '' },
  playlistItems: '', // e.g. "1-25,30,40-"
  clipboardWatcher: false,
  pauseNewJobs: false,
  autoAnalyzeClipboard: false,
  closeToTray: false,
  startMinimized: false,
  launchOnStartup: false,
  preventSleepWhileDownloading: true,
  confirmOnQuitIfJobs: true,
  resumeQueuedOnStartup: true,
  windowBounds: null,
};
let SETTINGS = { ...SETTINGS_DEFAULT };
let SETTINGS_PATH = '';
let HISTORY_PATH = '';
let HISTORY = [];
let LOG_WRITE_INFLIGHT = false;
let QUEUE_PATH = '';

function loadQueue() {
  try {
    if (!QUEUE_PATH) return;
    if (fs.existsSync(QUEUE_PATH)) {
      const raw = fs.readFileSync(QUEUE_PATH, 'utf-8');
      const arr = JSON.parse(raw || '[]');
      const list = Array.isArray(arr) ? arr : [];
      // Only keep minimally valid entries
      const valid = list.filter((x) => x && x.id && x.url);
      // Reset current QUEUE and fill
      QUEUE.length = 0;
      for (const it of valid) QUEUE.push(it);
    }
  } catch {}
}
function saveQueue() {
  try {
    if (!QUEUE_PATH) return;
    const data = JSON.stringify(QUEUE, null, 2);
    fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
    fs.writeFileSync(QUEUE_PATH, data);
  } catch {}
}

function getAggregateProgress() {
  try {
    let total = 0;
    let done = 0;
    let counted = 0;
    for (const id of JOBS.keys()) {
      const meta = JOB_META.get(id) || {};
      const t = Number(meta.totalBytes || 0);
      if (t > 0) {
        const d = Math.max(0, Math.min(t, Number(meta.downloadedBytes || 0)));
        total += t; done += d; counted++;
      }
    }
    if (counted > 0 && total > 0) {
      const frac = done / total;
      if (isFinite(frac) && frac >= 0 && frac <= 1) return frac;
    }
    return null;
  } catch { return null; }
}

function updateTaskbarProgress() {
  try {
    const wins = BrowserWindow.getAllWindows();
    if (JOBS.size <= 0) {
      for (const w of wins) { try { w.setProgressBar(-1); } catch {} }
      return;
    }
    const frac = getAggregateProgress();
    for (const w of wins) {
      try {
        if (frac === null) w.setProgressBar(2, { mode: 'indeterminate' }); else w.setProgressBar(frac);
      } catch {}
    }
  } catch {}
}

function getLogPaths() {
  try {
    const base = app.getPath('userData');
    const dir = path.join(base, 'logs');
    const file = path.join(dir, 'app.log');
    return { dir, file };
  } catch { return { dir: '', file: '' }; }
}

function logLine(...args) {
  try {
    const { dir, file } = getLogPaths();
    if (!dir || !file) return;
    if (!LOG_WRITE_INFLIGHT) {
      LOG_WRITE_INFLIGHT = true;
      fs.promises.mkdir(dir, { recursive: true }).catch(() => {}).finally(() => { LOG_WRITE_INFLIGHT = false; });
    }
    const line = `[${new Date().toISOString()}] ` + args.map(a => {
      try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
    }).join(' ') + '\n';
    fs.promises.appendFile(file, line).catch(() => {});
  } catch {}
}

function loadSettings() {
  try {
    if (!SETTINGS_PATH) return;
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      const j = JSON.parse(raw || '{}');
      SETTINGS = { ...SETTINGS_DEFAULT, ...(j && typeof j === 'object' ? j : {}) };
      MAX_CONCURRENT_JOBS = Math.max(1, Number(SETTINGS.maxConcurrent || 1));
    }
  } catch {}
}
function saveSettings() {
  try {
    if (!SETTINGS_PATH) return;
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(SETTINGS, null, 2));
  } catch {}
}

function applyLoginItemSettings() {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!SETTINGS.launchOnStartup,
      openAsHidden: !!SETTINGS.startMinimized,
    });
  } catch {}
}

function updateTrayTooltip() {
  try {
    if (!TRAY) return;
    const running = JOBS.size;
    const paused = !!SETTINGS.pauseNewJobs;
  const parts = ['Pumpaj Media Downloader'];
  if (running > 0) parts.push(`${running}/${MAX_CONCURRENT_JOBS} running`);
  if (QUEUE.length > 0) parts.push(`${QUEUE.length} queued`);
    if (paused) parts.push('paused');
    TRAY.setToolTip(parts.join(' • '));
  } catch {}
}

function broadcastSettings() {
  try {
    const payload = { ...SETTINGS };
    BrowserWindow.getAllWindows().forEach((w) => {
      try { w.webContents.send('settings-changed', payload); } catch {}
    });
  try { TRAY_REFRESH?.(); } catch {}
  } catch {}
}

function updatePowerSaveBlocker() {
  try {
    const shouldBlock = !!SETTINGS.preventSleepWhileDownloading && JOBS.size > 0;
    const active = typeof POWER_SAVE_ID === 'number' && powerSaveBlocker.isStarted?.(POWER_SAVE_ID);
    if (shouldBlock && !active) {
  try { POWER_SAVE_ID = powerSaveBlocker.start('prevent-app-suspension'); } catch {}
  try { logLine('powerSaveBlocker:start', { jobs: JOBS.size }); } catch {}
    } else if (!shouldBlock && active) {
      try { powerSaveBlocker.stop(POWER_SAVE_ID); } catch {}
      POWER_SAVE_ID = null;
  try { logLine('powerSaveBlocker:stop', { jobs: JOBS.size }); } catch {}
    }
  } catch {}
}

function applyClipboardWatcher(win) {
  try { if (CLIPBOARD_TIMER) { clearInterval(CLIPBOARD_TIMER); CLIPBOARD_TIMER = null; } } catch {}
  if (!SETTINGS.clipboardWatcher) return;
  CLIPBOARD_TIMER = setInterval(() => {
    try {
      const text = clipboard.readText() || '';
      if (text && text !== LAST_CLIPBOARD_URL) {
        try { const u = new URL(text); if (u.protocol === 'http:' || u.protocol === 'https:') {
          LAST_CLIPBOARD_URL = text;
          BrowserWindow.getAllWindows().forEach(w => {
            try { w.webContents.send('clipboard-url', { url: text }); } catch {}
            try { if (SETTINGS.autoAnalyzeClipboard) w.webContents.send('analyze:trigger', { url: text }); } catch {}
          });
        } } catch {}
      }
    } catch {}
  }, 1500);
}

function createTray(win) {
  try { if (TRAY) return; } catch {}
  try {
    const iconPath = app.isPackaged ? path.join(process.resourcesPath || process.cwd(), 'public', 'icon.ico') : path.resolve(process.cwd(), 'public', 'icon.ico');
    let img = undefined;
    try { img = nativeImage.createFromPath(iconPath); } catch {}
    TRAY = new Tray(img || undefined);
    const refreshMenu = () => {
      const paused = !!SETTINGS.pauseNewJobs;
      const clipOn = !!SETTINGS.clipboardWatcher;
  const limitKib = Number(SETTINGS.limitRateKib || 0);
      const conn = Math.max(1, Number(SETTINGS.connections || 3));
      const maxConc = Math.max(1, Number(SETTINGS.maxConcurrent || 3));
  const proxyOn = (SETTINGS.proxyEnabled ?? true) && !!SETTINGS.proxyUrl;
  const skipExist = !!SETTINGS.skipExisting;
  const useArchive = !!SETTINGS.useDownloadArchive;
      // Build dynamic per-job submenus
      const shorten = (s, n = 48) => {
        try { const str = String(s || ''); if (str.length <= n) return str; return str.slice(0, Math.max(0, n - 1)) + '…'; } catch { return String(s || ''); }
      };
      let activeJobsMenu = [];
      let queuedJobsMenu = [];
      try {
        loadHistory();
        const hist = Array.isArray(HISTORY) ? HISTORY : [];
        // Active jobs
        for (const [id, child] of JOBS.entries()) {
          try {
            const meta = JOB_META.get(id) || {};
            const h = hist.find(x => x && x.id === id) || {};
            const title = h?.title || h?.url || id;
            const pct = (meta.totalBytes > 0 && meta.downloadedBytes >= 0)
              ? Math.floor((Number(meta.downloadedBytes) / Number(meta.totalBytes)) * 100)
              : null;
            const baseLabel = shorten(title);
            const label = pct !== null ? `${baseLabel} — ${pct}%` : baseLabel;
            activeJobsMenu.push({
              label,
              submenu: [
                { label: 'Cancel', click: () => { try { const m = JOB_META.get(id) || {}; m.canceled = true; JOB_META.set(id, m); } catch {} try { if (child && !child.killed) child.kill('SIGTERM'); } catch {} try { TRAY_REFRESH?.(); } catch {} } },
                ...(meta?.filepath ? [
                  { label: 'Reveal in Folder', click: () => { try { shell.showItemInFolder(String(meta.filepath)); } catch {} } },
                  { label: 'Open File', click: async () => { try { await shell.openPath(String(meta.filepath)); } catch {} } },
                ] : []),
              ]
            });
          } catch {}
        }
        if (activeJobsMenu.length === 0) activeJobsMenu = [{ label: 'No active jobs', enabled: false }];
        // Queued jobs
        for (const q of QUEUE) {
          try {
            const title = q?.title || q?.url || q?.id || 'Queued item';
            const label = shorten(title);
            queuedJobsMenu.push({
              label,
              submenu: [
                { label: 'Remove from queue', click: () => {
                  try {
                    const idx = QUEUE.findIndex(x => x && x.id === q.id);
                    if (idx >= 0) QUEUE.splice(idx, 1);
                  } catch {}
                  try { updateTrayTooltip(); } catch {}
                  try { updateTaskbarProgress(); } catch {}
                  try { TRAY_REFRESH?.(); } catch {}
                } },
                { label: 'Start now', click: async () => {
                  try {
                    const idx = QUEUE.findIndex(x => x && x.id === q.id);
                    if (idx >= 0) {
                      const [item] = QUEUE.splice(idx, 1);
                      // Try to start immediately or requeue at the front then drain
                      if (JOBS.size < MAX_CONCURRENT_JOBS && !SETTINGS.pauseNewJobs) {
                        try { await startDownloadInternal(item); } catch {}
                      } else {
                        QUEUE.unshift(item);
                      }
                    }
                  } catch {}
                  try { updateTrayTooltip(); } catch {}
                  try { drainQueue(); } catch {}
                  try { TRAY_REFRESH?.(); } catch {}
                } },
              ]
            });
          } catch {}
        }
        if (queuedJobsMenu.length === 0) queuedJobsMenu = [{ label: 'No queued jobs', enabled: false }];
      } catch {}
      const template = [
        { label: 'Open App', click: () => { try { if (win?.isMinimized()) win.restore(); win?.show(); win?.focus(); } catch {} } },
        { label: 'Open Settings', click: () => { try { BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('navigate:tab', { tab: 'settings' })); if (win?.isMinimized()) win.restore(); win?.show(); win?.focus(); } catch {} } },
        { label: 'Open History', click: () => { try { BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('navigate:tab', { tab: 'history' })); if (win?.isMinimized()) win.restore(); win?.show(); win?.focus(); } catch {} } },
        { label: 'Open Queue', click: () => { try { BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('navigate:tab', { tab: 'queue' })); if (win?.isMinimized()) win.restore(); win?.show(); win?.focus(); } catch {} } },
        { label: 'Open Batch', click: () => { try { BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('navigate:tab', { tab: 'batch' })); if (win?.isMinimized()) win.restore(); win?.show(); win?.focus(); } catch {} } },
  { label: 'Open Downloads', click: async () => { try { const rootOverride = String(SETTINGS?.downloadsRootDir || '').trim(); const downloadsRoot = rootOverride || path.join(app.getPath('downloads'), 'MediaDownloader'); await fs.promises.mkdir(downloadsRoot, { recursive: true }); await shell.openPath(downloadsRoot); } catch {} } },
        { type: 'separator' },
        { label: 'Active Jobs', submenu: activeJobsMenu },
        { label: 'Queued Jobs', submenu: queuedJobsMenu },
        { type: 'separator' },
        { label: 'Clear Queue', enabled: QUEUE.length > 0, click: () => {
          try {
            const ids = QUEUE.map(q => q && q.id).filter(Boolean);
            QUEUE.length = 0;
            try { saveQueue(); } catch {}
            for (const id of ids) { try { updateHistory(id, { status: 'canceled', completedAt: new Date().toISOString() }); } catch {} }
            try { updateTrayTooltip(); } catch {}
            try { updateTaskbarProgress(); } catch {}
            try { TRAY_REFRESH?.(); } catch {}
          } catch {}
        } },
  { label: 'Start All Queued', enabled: QUEUE.length > 0 && !SETTINGS.pauseNewJobs, click: () => { try { drainQueue(); } catch {} } },
        { label: 'Pause New Jobs', type: 'checkbox', checked: paused, click: () => { SETTINGS.pauseNewJobs = !paused; saveSettings(); broadcastSettings(); refreshMenu(); } },
  { label: 'Proxy Enabled', type: 'checkbox', checked: proxyOn, click: () => { const next = !(SETTINGS.proxyEnabled ?? true) || !SETTINGS.proxyUrl ? true : false; SETTINGS.proxyEnabled = next; saveSettings(); broadcastSettings(); refreshMenu(); } },
  { label: 'Skip existing files (no overwrite)', type: 'checkbox', checked: skipExist, click: () => { SETTINGS.skipExisting = !skipExist; saveSettings(); broadcastSettings(); refreshMenu(); } },
  { label: 'Use download archive (avoid duplicates)', type: 'checkbox', checked: useArchive, click: () => { SETTINGS.useDownloadArchive = !useArchive; saveSettings(); broadcastSettings(); refreshMenu(); } },
        { label: 'Speed Limit', submenu: [
          { label: 'Off (unlimited)', type: 'radio', checked: limitKib <= 0, click: () => { SETTINGS.limitRateKib = 0; saveSettings(); broadcastSettings(); refreshMenu(); } },
          { label: '256 KiB/s', type: 'radio', checked: limitKib === 256, click: () => { SETTINGS.limitRateKib = 256; saveSettings(); broadcastSettings(); refreshMenu(); } },
          { label: '512 KiB/s', type: 'radio', checked: limitKib === 512, click: () => { SETTINGS.limitRateKib = 512; saveSettings(); broadcastSettings(); refreshMenu(); } },
          { label: '1024 KiB/s (1 MiB/s)', type: 'radio', checked: limitKib === 1024, click: () => { SETTINGS.limitRateKib = 1024; saveSettings(); broadcastSettings(); refreshMenu(); } },
          { label: '2048 KiB/s (2 MiB/s)', type: 'radio', checked: limitKib === 2048, click: () => { SETTINGS.limitRateKib = 2048; saveSettings(); broadcastSettings(); refreshMenu(); } },
          { label: '4096 KiB/s (4 MiB/s)', type: 'radio', checked: limitKib === 4096, click: () => { SETTINGS.limitRateKib = 4096; saveSettings(); broadcastSettings(); refreshMenu(); } },
        ] },
        { label: 'Connections per download', submenu: [1,2,3,4,6,8].map(n => ({ label: String(n), type: 'radio', checked: conn === n, click: () => { SETTINGS.connections = n; saveSettings(); broadcastSettings(); refreshMenu(); } })) },
        { label: 'Max concurrent jobs', submenu: [1,2,3,4,5,6].map(n => ({ label: String(n), type: 'radio', checked: maxConc === n, click: () => { SETTINGS.maxConcurrent = n; MAX_CONCURRENT_JOBS = n; saveSettings(); broadcastSettings(); try { drainQueue(); } catch {}; refreshMenu(); } })) },
        { label: 'Watch Clipboard', type: 'checkbox', checked: clipOn, click: () => { SETTINGS.clipboardWatcher = !clipOn; saveSettings(); try { applyClipboardWatcher(win); } catch {}; broadcastSettings(); refreshMenu(); } },
        { label: 'Auto Analyze URLs', type: 'checkbox', checked: !!SETTINGS.autoAnalyzeClipboard, click: () => { SETTINGS.autoAnalyzeClipboard = !SETTINGS.autoAnalyzeClipboard; saveSettings(); broadcastSettings(); refreshMenu(); } },
  { label: 'Close to tray', type: 'checkbox', checked: !!SETTINGS.closeToTray, click: () => { SETTINGS.closeToTray = !SETTINGS.closeToTray; saveSettings(); broadcastSettings(); refreshMenu(); } },
  { label: 'Start minimized', type: 'checkbox', checked: !!SETTINGS.startMinimized, click: () => { SETTINGS.startMinimized = !SETTINGS.startMinimized; saveSettings(); broadcastSettings(); refreshMenu(); } },
  { label: 'Launch at login', type: 'checkbox', checked: !!SETTINGS.launchOnStartup, click: () => { SETTINGS.launchOnStartup = !SETTINGS.launchOnStartup; saveSettings(); try { applyLoginItemSettings(); } catch {}; broadcastSettings(); refreshMenu(); } },
  { label: 'Keep PC awake during downloads', type: 'checkbox', checked: !!SETTINGS.preventSleepWhileDownloading, click: () => { SETTINGS.preventSleepWhileDownloading = !SETTINGS.preventSleepWhileDownloading; saveSettings(); try { updatePowerSaveBlocker(); } catch {}; broadcastSettings(); refreshMenu(); } },
  { label: 'Confirm on quit if jobs running', type: 'checkbox', checked: !!SETTINGS.confirmOnQuitIfJobs, click: () => { SETTINGS.confirmOnQuitIfJobs = !SETTINGS.confirmOnQuitIfJobs; saveSettings(); broadcastSettings(); refreshMenu(); } },
        { type: 'separator' },
  { label: 'Cancel All Running', enabled: JOBS.size > 0, click: () => {
            try {
              for (const [id, child] of JOBS.entries()) {
                try { const meta = JOB_META.get(id) || {}; meta.canceled = true; JOB_META.set(id, meta); } catch {}
                try { if (child && !child.killed) child.kill('SIGTERM'); } catch {}
              }
              try { TRAY_REFRESH?.(); } catch {}
            } catch {}
          } },
        { label: 'Retry Last Failed', click: async () => { try {
            loadHistory();
            const items = Array.isArray(HISTORY) ? [...HISTORY] : [];
            const lastF = items.slice().reverse().find((x) => x && x.status === 'failed');
            if (!lastF) return;
            const p = retryPayloadFromHistoryItem(lastF);
            if (!p) return;
            await startDownloadEnqueue(p);
          } catch {} } },
        { label: 'Retry All Failed', click: async () => { try {
            loadHistory();
            const items = Array.isArray(HISTORY) ? [...HISTORY] : [];
            const failed = items.filter((x) => x && x.status === 'failed');
            for (const it of failed) {
              const p = retryPayloadFromHistoryItem(it);
              if (p) await startDownloadEnqueue(p);
            }
          } catch {} } },
  { label: 'Export History (JSON)', click: async () => { try { const winRef = BrowserWindow.getAllWindows()[0]; await exportHistoryAsJSONDefault(winRef); } catch {} } },
  { label: 'Export History (CSV)', click: async () => { try { const winRef = BrowserWindow.getAllWindows()[0]; await exportHistoryAsCSVDefault(winRef); } catch {} } },
        { label: 'Clear History', click: () => { try { HISTORY = []; saveHistory(); } catch {} } },
  { label: 'Open Binaries Folder', click: async () => { try { const baseRes = app.isPackaged ? (process.resourcesPath || process.cwd()) : process.cwd(); const binDir = path.join(baseRes, 'binaries'); await fs.promises.mkdir(binDir, { recursive: true }); await shell.openPath(binDir); } catch {} } },
  { label: 'Backup Settings & History', click: async () => { try { const res = await createBackupAtTimestamp(); if (res?.ok && res?.path) await shell.openPath(res.path); } catch {} } },
        { label: 'Restore Settings & History', click: async () => { try {
            const res = await dialog.showOpenDialog(win, { title: 'Select a backup folder', properties: ['openDirectory'] });
            if (res.canceled || !res.filePaths?.[0]) return;
            const dir = res.filePaths[0];
            const confirm = await dialog.showMessageBox(win, { type: 'question', buttons: ['Restore', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Confirm restore', message: 'Restore settings and history from the selected folder? This will overwrite current files.' });
            if (confirm.response !== 0) return;
            const out = await restoreBackupFromDirectory(dir);
            if (!out?.ok) {
              new Notification({ title: 'Restore failed', body: String(out?.error || 'Unknown error') }).show();
            }
          } catch {} } },
  { label: 'Open User Data Folder', click: async () => { try { const p = app.getPath('userData'); await fs.promises.mkdir(p, { recursive: true }); await shell.openPath(p); } catch {} } },
  { label: 'Open Logs Folder', click: async () => { try { const { dir } = getLogPaths(); if (dir) { await fs.promises.mkdir(dir, { recursive: true }); await shell.openPath(dir); } } catch {} } },
  { label: 'Open Log File', click: async () => { try { const { file } = getLogPaths(); if (file) { await fs.promises.mkdir(path.dirname(file), { recursive: true }); await fs.promises.appendFile(file, ''); await shell.openPath(file); } } catch {} } },
  { label: 'Clear Log', click: async () => { try { const { file } = getLogPaths(); if (file && fs.existsSync(file)) { await fs.promises.writeFile(file, ''); new Notification({ title: 'Log cleared', body: 'app.log has been cleared.' }).show(); } } catch {} } },
  { label: 'Open Backups Folder', click: async () => { try { const dir = path.join(app.getPath('downloads'), 'MediaDownloader', 'Backups'); await fs.promises.mkdir(dir, { recursive: true }); await shell.openPath(dir); } catch {} } },
  { label: 'Open Settings File', click: async () => { try { if (SETTINGS_PATH && fs.existsSync(SETTINGS_PATH)) await shell.openPath(SETTINGS_PATH); else { const p = app.getPath('userData'); await shell.openPath(p); } } catch {} } },
  { label: 'Open History File', click: async () => { try { if (HISTORY_PATH && fs.existsSync(HISTORY_PATH)) await shell.openPath(HISTORY_PATH); else { const p = app.getPath('userData'); await shell.openPath(p); } } catch {} } },
        { label: 'Reveal Last Completed', click: async () => { try {
            loadHistory();
            const items = Array.isArray(HISTORY) ? [...HISTORY] : [];
            const last = items.slice().reverse().find((x) => x && x.status === 'completed');
            if (last?.filepath && fs.existsSync(String(last.filepath))) shell.showItemInFolder(String(last.filepath));
            else { const downloadsRoot = path.join(app.getPath('downloads'), 'MediaDownloader'); await fs.promises.mkdir(downloadsRoot, { recursive: true }); await shell.openPath(downloadsRoot); }
          } catch {} } },
        { label: 'Open Last Completed File', click: async () => { try {
            loadHistory();
            const items = Array.isArray(HISTORY) ? [...HISTORY] : [];
            const last = items.slice().reverse().find((x) => x && x.status === 'completed' && x.filepath);
            if (last?.filepath && fs.existsSync(String(last.filepath))) await shell.openPath(String(last.filepath));
          } catch {} } },
        { label: 'Open Last Failed URL', click: () => { try {
            loadHistory();
            const items = Array.isArray(HISTORY) ? [...HISTORY] : [];
            const lastF = items.slice().reverse().find((x) => x && x.status === 'failed' && x.url);
            if (lastF?.url) {
              broadcastUrlToRenderers(String(lastF.url));
              BrowserWindow.getAllWindows().forEach((w) => { try { w.webContents.send('navigate:tab', { tab: 'download' }); } catch {} });
            }
          } catch {} } },
        { label: 'Update yt-dlp', click: async () => { try {
            const baseRes = app.isPackaged ? (process.resourcesPath || process.cwd()) : process.cwd();
            const binDir = path.join(baseRes, 'binaries');
            const YTDLP = process.platform === 'win32' ? path.join(binDir, 'yt-dlp.exe') : path.join(binDir, 'yt-dlp');
            if (!fs.existsSync(YTDLP)) { new Notification({ title: 'yt-dlp not found', body: 'Install binaries first.' }).show(); return; }
            const child = spawn(YTDLP, ['-U'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
            let out = ''; let err = '';
            child.stdout.on('data', (b) => { out += b.toString(); });
            child.stderr.on('data', (b) => { err += b.toString(); });
            child.on('close', (code) => {
              const ok = code === 0;
              new Notification({ title: ok ? 'yt-dlp updated' : 'yt-dlp update failed', body: ok ? (out.trim() || 'Done') : (err.trim() || 'Error') }).show();
            });
          } catch {} } },
  { type: 'separator' },
  { label: 'Restart App', click: () => { try { (app).forceQuit = true; app.relaunch(); app.exit(0); } catch {} } },
  { label: 'Quit', role: 'quit' },
      ];
  const menu = Menu.buildFromTemplate(template);
  TRAY.setContextMenu(menu);
  updateTrayTooltip();
    };
    refreshMenu();
  TRAY_REFRESH = refreshMenu;
  try { TRAY.on('click', () => { try { if (win?.isMinimized()) win.restore(); if (!win?.isVisible()) win?.show(); win?.focus(); } catch {} }); } catch {}
  } catch {}
}

function loadHistory() {
  try {
    if (!HISTORY_PATH) return;
    if (fs.existsSync(HISTORY_PATH)) {
      const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
      const j = JSON.parse(raw || '[]');
      HISTORY = Array.isArray(j) ? j : [];
    } else {
      HISTORY = [];
    }
  } catch { HISTORY = []; }
}
function saveHistory() {
  try {
    if (!HISTORY_PATH) return;
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(HISTORY, null, 2));
  } catch {}
}
function exportHistoryAsJSONDefault(win) {
  try {
    loadHistory();
    const items = Array.isArray(HISTORY) ? HISTORY : [];
    const ts = new Date();
    const yyyy = ts.getFullYear();
    const mm = String(ts.getMonth() + 1).padStart(2, '0');
    const dd = String(ts.getDate()).padStart(2, '0');
    const fileName = `history-${yyyy}${mm}${dd}.json`;
    return dialog.showSaveDialog(win, { title: 'Export History (JSON)', defaultPath: path.join(app.getPath('downloads'), fileName), filters: [{ name: 'JSON', extensions: ['json'] }] }).then(async (res) => {
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      await fs.promises.writeFile(res.filePath, JSON.stringify(items, null, 2));
      try { new Notification({ title: 'History exported', body: res.filePath }).show(); } catch {}
      return { ok: true, path: res.filePath };
    });
  } catch (e) { return Promise.resolve({ ok: false, error: String(e?.message || e) }); }
}
function csvEscape(v) { try { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; } catch { return '""'; } }
function exportHistoryAsCSVDefault(win) {
  try {
    loadHistory();
    const items = Array.isArray(HISTORY) ? HISTORY : [];
    const header = ['id','title','url','type','format','status','downloadDate','filepath'];
    const lines = [header.join(',')].concat(items.map((i) => header.map((h) => csvEscape(i?.[h])).join(',')));
    const data = lines.join('\n');
    const ts = new Date();
    const yyyy = ts.getFullYear();
    const mm = String(ts.getMonth() + 1).padStart(2, '0');
    const dd = String(ts.getDate()).padStart(2, '0');
    const fileName = `history-${yyyy}${mm}${dd}.csv`;
    return dialog.showSaveDialog(win, { title: 'Export History (CSV)', defaultPath: path.join(app.getPath('downloads'), fileName), filters: [{ name: 'CSV', extensions: ['csv'] }] }).then(async (res) => {
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      await fs.promises.writeFile(res.filePath, data, 'utf-8');
      try { new Notification({ title: 'History exported', body: res.filePath }).show(); } catch {}
      return { ok: true, path: res.filePath };
    });
  } catch (e) { return Promise.resolve({ ok: false, error: String(e?.message || e) }); }
}
function addHistory(entry) {
  try {
    loadHistory();
    HISTORY.push(entry);
    if (HISTORY.length > 500) HISTORY = HISTORY.slice(-500);
    saveHistory();
  } catch {}
}
function updateHistory(id, patch) {
  try {
    loadHistory();
    const idx = HISTORY.findIndex((x) => x && x.id === id);
    if (idx >= 0) { HISTORY[idx] = { ...HISTORY[idx], ...patch }; saveHistory(); }
  } catch {}
}

function isHttpUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; }
}

function broadcastUrlToRenderers(url) {
  try {
    if (!isHttpUrl(url)) return;
    LAST_CLIPBOARD_URL = String(url);
    BrowserWindow.getAllWindows().forEach((w) => {
      try { w.webContents.send('clipboard-url', { url: String(url) }); } catch {}
      try { if (SETTINGS.autoAnalyzeClipboard) w.webContents.send('analyze:trigger', { url: String(url) }); } catch {}
    });
  } catch {}
}

async function handleArgv(argv = []) {
  try {
    const items = Array.from(argv || []);
    // Commands
    if (items.includes('--open-downloads')) {
      try {
        const downloadsRoot = path.join(app.getPath('downloads'), 'MediaDownloader');
        await fs.promises.mkdir(downloadsRoot, { recursive: true });
        await shell.openPath(downloadsRoot);
      } catch {}
    }
    // URLs
    const urls = items.filter((a) => isHttpUrl(a));
    if (urls.length > 0) broadcastUrlToRenderers(urls[urls.length - 1]);
  } catch {}
}

function sanitizePart(name) {
  return String(name || '').replace(/[^\w.-]+/g, '_').slice(0, 80);
}

function waitDistIndex(maxMs = 15000) {
  const file = path.join(process.cwd(), 'dist', 'index.html');
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (fs.existsSync(file)) { clearInterval(t); resolve(file); }
      if (Date.now() - start > maxMs) { clearInterval(t); reject(new Error('dist/index.html not found')); }
    }, 200);
  });
}

function genJobId() {
  return 'job-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function drainQueue() {
  try {
    while (JOBS.size < MAX_CONCURRENT_JOBS && !SETTINGS.pauseNewJobs && QUEUE.length > 0) {
  const payload = QUEUE.shift();
  try { saveQueue(); } catch {}
      try { await startDownloadInternal(payload); } catch {}
    }
  } catch {} finally { try { updateTrayTooltip(); } catch {} try { TRAY_REFRESH?.(); } catch {} }
}

async function startDownloadEnqueue(payload) {
  const p = { ...payload };
  if (!p.id) p.id = genJobId();
  if (JOBS.size >= MAX_CONCURRENT_JOBS || SETTINGS.pauseNewJobs) {
    try { logLine('queue:add', { id: p.id, url: p.url }); } catch {}
    QUEUE.push(p);
  try { saveQueue(); } catch {}
    try {
      const rec = { id: p.id, url: String(p.url || ''), title: String(p.title || ''), type: p.mode === 'audio' ? 'audio' : 'video', format: (p.mode === 'audio' ? String(p.audioFormat || 'm4a') : String(p.format || 'best')).toUpperCase(), status: 'queued', downloadDate: new Date().toISOString() };
      addHistory(rec);
    } catch {}
    try { updateTrayTooltip(); } catch {}
  try { TRAY_REFRESH?.(); } catch {}
    try { updateTaskbarProgress(); } catch {}
    return { ok: true, queued: true, id: p.id };
  }
  const res = await startDownloadInternal(p);
  try { updateTaskbarProgress(); } catch {}
  return { ...(res || {}), id: p.id };
}

// Reusable download starter used by IPC handler (keeps behavior identical)
async function startDownloadInternal({ id, url, outDir, format = 'best', mode = 'video', audioFormat = 'm4a', title }) {
  if (!id || !url) return { ok: false, error: 'missing_params' };
  if (!isHttpUrl(url)) return { ok: false, error: 'invalid_url' };
  if (JOBS.size >= MAX_CONCURRENT_JOBS) return { ok: false, error: 'too_many_jobs' };
  if (SETTINGS.pauseNewJobs) return { ok: false, error: 'paused' };

  // Resolve binaries path (packaged vs dev)
  const baseRes = app.isPackaged ? (process.resourcesPath || process.cwd()) : process.cwd();
  const binDir = path.join(baseRes, 'binaries');
  const YTDLP = process.platform === 'win32' ? path.join(binDir, 'yt-dlp.exe') : path.join(binDir, 'yt-dlp');
  const FFMPEG_DIR = binDir;
  // Guard: binaries must exist
  if (!fs.existsSync(YTDLP)) return { ok: false, error: 'ytdlp_missing' };

  // Constrain output directory: inside user Downloads/MediaDownloader
  const downloadsRootDefault = path.join(app.getPath('downloads'), 'MediaDownloader');
  const rootOverride = String(SETTINGS?.downloadsRootDir || '').trim();
  const downloadsRoot = rootOverride || downloadsRootDefault;
  try { fs.mkdirSync(downloadsRoot, { recursive: true }); } catch {}
  const safeOut = path.join(downloadsRoot, sanitizePart(outDir || ''));
  try { fs.mkdirSync(safeOut, { recursive: true }); } catch {}

  // Build yt-dlp args
  const args = ['--ffmpeg-location', FFMPEG_DIR, '--progress-template', 'json', '--newline'];
  // Avoid overwriting existing files
  if (SETTINGS?.skipExisting) args.push('--no-overwrites');
  // Use a persistent archive file to avoid duplicate downloads across sessions
  if (SETTINGS?.useDownloadArchive) {
    try {
      const archivePath = path.join(app.getPath('userData'), 'archive.txt');
      fs.mkdirSync(path.dirname(archivePath), { recursive: true });
      args.push('--download-archive', archivePath);
    } catch {}
  }
  if (SETTINGS?.limitRateKib && Number(SETTINGS.limitRateKib) > 0) {
    args.push('--limit-rate', `${Number(SETTINGS.limitRateKib)}K`);
  }
  if (SETTINGS?.proxyUrl && (SETTINGS.proxyEnabled ?? true)) {
    args.push('--proxy', String(SETTINGS.proxyUrl));
  }
  if (SETTINGS?.connections && Number(SETTINGS.connections) > 0) {
    args.push('-N', String(Math.max(1, Number(SETTINGS.connections))));
  }
  if (mode === 'audio') {
    // ffmpeg is required for audio extraction
    const FFMPEG_EXE = process.platform === 'win32' ? path.join(FFMPEG_DIR, 'ffmpeg.exe') : path.join(FFMPEG_DIR, 'ffmpeg');
    if (!fs.existsSync(FFMPEG_EXE)) return { ok: false, error: 'ffmpeg_missing' };
    args.push('-f', 'bestaudio');
    args.push('--extract-audio');
    args.push('--audio-format', String(audioFormat || 'm4a'));
  } else {
    args.push('-f', String(format || 'best'));
  }
  // Filename template
  const rawTpl = String(SETTINGS?.filenameTemplate || '%(title)s.%(ext)s');
  // Disallow path separators and normalize placeholders
  const safeTpl0 = rawTpl.replace(/[\\/:*?"<>|]+/g, '_');
  const userTpl = safeTpl0.trim().length ? safeTpl0 : '%(title)s.%(ext)s';
  const tpl = userTpl.includes('%(')
    ? userTpl
    : userTpl
        .replaceAll('{title}', '%(title)s')
        .replaceAll('{id}', '%(id)s')
        .replaceAll('{ext}', '%(ext)s')
        .replaceAll('{uploader}', '%(uploader)s')
        .replaceAll('{resolution}', '%(height)sp');
  args.push('-o', path.join(safeOut, tpl));

  // Subtitles
  try {
    if (SETTINGS?.subtitles?.enabled) {
      args.push('--write-subs');
      const langs = String(SETTINGS?.subtitles?.languages || '').trim();
      if (langs) args.push('--sub-langs', langs);
      if (SETTINGS?.subtitles?.embed) {
        const FFMPEG_EXE = process.platform === 'win32' ? path.join(FFMPEG_DIR, 'ffmpeg.exe') : path.join(FFMPEG_DIR, 'ffmpeg');
        if (!fs.existsSync(FFMPEG_EXE)) return { ok: false, error: 'ffmpeg_missing' };
        args.push('--embed-subs');
      }
    }
  } catch {}

  // Playlist range
  try {
    const items = String(SETTINGS?.playlistItems || '').trim();
    if (items) { args.push('--yes-playlist'); args.push('--playlist-items', items); }
  } catch {}
  args.push(String(url));

  // append/update history as in-progress
  try {
    const rec = { id, url: String(url), title: String(title || ''), type: mode === 'audio' ? 'audio' : 'video', format: mode === 'audio' ? String(audioFormat || 'm4a').toUpperCase() : String(format || 'best').toUpperCase(), status: 'in-progress', downloadDate: new Date().toISOString() };
    loadHistory();
    const idx = HISTORY.findIndex((x) => x && x.id === id);
    if (idx >= 0) updateHistory(id, rec);
    else addHistory(rec);
  } catch {}

  try { logLine('download:start', { id, url, mode, format, outDir: safeOut }); } catch {}
  const child = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  JOBS.set(id, child);
  JOB_META.set(id, {});
  try { updateTrayTooltip(); } catch {}
  try { TRAY_REFRESH?.(); } catch {}
  try { updatePowerSaveBlocker(); } catch {}
  try { updateTaskbarProgress(); } catch {}
  child.stdout.on('data', (buf) => {
    buf.toString().split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      try { const j = JSON.parse(line); BrowserWindow.getAllWindows().forEach(w => w.webContents.send('dl-progress', { id, progress: j })); }
      catch { BrowserWindow.getAllWindows().forEach(w => w.webContents.send('dl-progress', { id, line })); }
      try {
        const meta = JOB_META.get(id) || {};
        try {
          const j = JSON.parse(line);
          if (j?.filename) meta.filepath = String(j.filename);
          if (j?.info_dict?.__real_download && j.info_dict?.filepath) meta.filepath = String(j.info_dict.filepath);
          if (j?.total_bytes || j?.total_bytes_estimate) meta.totalBytes = Number(j.total_bytes || j.total_bytes_estimate || 0);
          if (j?.downloaded_bytes) meta.downloadedBytes = Number(j.downloaded_bytes || 0);
          if (!meta.downloadedBytes && j?.eta && j?.speed && meta.totalBytes && j?.elapsed) {
            // Fallback heuristic if needed; prefer downloaded_bytes
          }
        }
        catch {}
        JOB_META.set(id, meta);
        try { updateTaskbarProgress(); } catch {}
      } catch {}
    });
  });
  child.stderr.on('data', (buf) => {
    const msg = buf.toString();
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('dl-progress', { id, err: msg }));
    try {
      const meta = JOB_META.get(id) || {};
      const prev = String(meta.lastErr || '');
      const next = (prev + '\n' + msg).slice(-4000);
      meta.lastErr = next;
      JOB_META.set(id, meta);
    } catch {}
  });
  child.on('close', (code) => {
    JOBS.delete(id);
    try { updateTrayTooltip(); } catch {}
  try { TRAY_REFRESH?.(); } catch {}
  try { updatePowerSaveBlocker(); } catch {}
  try { drainQueue(); } catch {}
  try { updateTaskbarProgress(); } catch {}
  try { logLine('download:end', { id, code }); } catch {}
  const meta = JOB_META.get(id) || {};
  try { updateHistory(id, { status: code === 0 ? 'completed' : (meta?.canceled ? 'canceled' : 'failed'), completedAt: new Date().toISOString(), filepath: meta.filepath, totalBytes: meta.totalBytes, error: (code === 0 || meta?.canceled) ? undefined : (meta.lastErr ? String(meta.lastErr).slice(-500) : undefined) }); } catch {}
    try {
      const notif = new Notification({ title: 'Download ' + (code === 0 ? 'completed' : (meta?.canceled ? 'canceled' : 'failed')), body: (title ? String(title) + '\n' : '') + String(url) });
      try {
        notif.on('click', () => {
          try {
            if (meta?.filepath) shell.showItemInFolder(String(meta.filepath));
            else shell.openPath(safeOut).catch(() => {});
          } catch {}
        });
      } catch {}
      notif.show();
    } catch {}
    // Recent Documents integration (Windows/mas)
    try {
      if (code === 0) {
        if (meta?.filepath && fs.existsSync(String(meta.filepath))) app.addRecentDocument(String(meta.filepath));
        else app.addRecentDocument(safeOut);
      }
    } catch {}
    // Optionally open the downloads folder when done
    try {
      if (SETTINGS?.openOnComplete) {
        if (meta?.filepath) shell.showItemInFolder(String(meta.filepath));
        else shell.openPath(safeOut).catch(() => {});
      }
    } catch {}
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('dl-done', { id, code, filepath: meta?.filepath }));
  });
  return { ok: true };
}

// Restore backup from a chosen directory containing settings.json/history.json
async function restoreBackupFromDirectory(dir) {
  try {
    const stats = await fs.promises.stat(dir).catch(() => null);
    if (!stats || !stats.isDirectory()) return { ok: false, error: 'invalid_directory' };
    const settingsFile = path.join(dir, 'settings.json');
    const historyFile = path.join(dir, 'history.json');
    let changed = false;
    // Restore settings
    try {
      if (fs.existsSync(settingsFile)) {
        const raw = await fs.promises.readFile(settingsFile, 'utf-8');
        const j = JSON.parse(raw || '{}');
        SETTINGS = { ...SETTINGS_DEFAULT, ...(j && typeof j === 'object' ? j : {}) };
        MAX_CONCURRENT_JOBS = Math.max(1, Number(SETTINGS.maxConcurrent || 1));
        saveSettings();
        try { applyLoginItemSettings(); } catch {}
        try { applyClipboardWatcher(BrowserWindow.getAllWindows()[0]); } catch {}
        try { broadcastSettings(); } catch {}
        changed = true;
      }
    } catch {}
    // Restore history
    try {
      if (fs.existsSync(historyFile)) {
        const raw = await fs.promises.readFile(historyFile, 'utf-8');
        const arr = JSON.parse(raw || '[]');
        HISTORY = Array.isArray(arr) ? arr : [];
        saveHistory();
        changed = true;
      }
    } catch {}
    if (!changed) return { ok: false, error: 'no_backup_files' };
    try { new Notification({ title: 'Restore complete', body: 'Settings and history were restored.' }).show(); } catch {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Create a timestamped backup folder and copy settings/history
async function createBackupAtTimestamp() {
  try {
    const ts = new Date();
    const yyyy = ts.getFullYear();
    const mm = String(ts.getMonth() + 1).padStart(2, '0');
    const dd = String(ts.getDate()).padStart(2, '0');
    const hh = String(ts.getHours()).padStart(2, '0');
    const mi = String(ts.getMinutes()).padStart(2, '0');
    const ss = String(ts.getSeconds()).padStart(2, '0');
    const stamp = `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
    const base = path.join(app.getPath('downloads'), 'MediaDownloader', 'Backups', stamp);
    await fs.promises.mkdir(base, { recursive: true });
    try { if (SETTINGS_PATH && fs.existsSync(SETTINGS_PATH)) await fs.promises.copyFile(SETTINGS_PATH, path.join(base, 'settings.json')); } catch {}
    try { if (HISTORY_PATH && fs.existsSync(HISTORY_PATH)) await fs.promises.copyFile(HISTORY_PATH, path.join(base, 'history.json')); } catch {}
    return { ok: true, path: base };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function resolveServerEntry() {
  // In dev (running from workspace): use local path
  const devPath = path.resolve(__dirname, '..', 'server', 'dist', 'index.js');
  // In production (packaged): files copied under resourcesPath/server/dist/index.js
  const prodPath = path.join(process.resourcesPath || process.cwd(), 'server', 'dist', 'index.js');
  return { devPath, prodPath };
}

function startBackend() {
  try {
    const { devPath, prodPath } = resolveServerEntry();
    const entry = app.isPackaged ? prodPath : devPath;
  if (!app.isPackaged) return; // dev: IPC-only, no HTTP backend
  serverChild = fork(entry, [], {
      env: {
        ...process.env,
        PORT: SERVER_PORT,
        CORS_ORIGIN: '*',
      },
      stdio: 'ignore',
      cwd: app.isPackaged ? path.dirname(prodPath) : path.resolve(__dirname, '..', 'server'),
    });
  } catch (e) {
    console.error('Failed to start backend:', e);
  }
}

function stopBackend() {
  try { if (serverChild && !serverChild.killed) serverChild.kill('SIGTERM'); } catch {}
  serverChild = null;
}

async function createWindow() {
  const wb = (SETTINGS && SETTINGS.windowBounds) || null;
  const win = new BrowserWindow({
    width: (wb && Number(wb.width)) || 1280,
    height: (wb && Number(wb.height)) || 800,
    x: (wb && typeof wb.x === 'number') ? wb.x : undefined,
    y: (wb && typeof wb.y === 'number') ? wb.y : undefined,
    backgroundColor: '#0b1220',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
  sandbox: true,
  preload: path.resolve(__dirname, 'preload.cjs'),
      webviewTag: false,
      devTools: !app.isPackaged,
    },
    autoHideMenuBar: true,
    show: !SETTINGS.startMinimized,
  });

  win.on('ready-to-show', () => { try { if (!SETTINGS.startMinimized) win.show(); } catch {} });

  // Load built frontend from dist/index.html (file://)
  await waitDistIndex().catch(() => {});
  const indexFile = path.resolve(process.cwd(), 'dist', 'index.html');
  await win.loadFile(indexFile);

  // Dev auto-reload of dist changes
  try {
    if (!app.isPackaged) {
      distWatcher = chokidar.watch(path.resolve(process.cwd(), 'dist'));
      distWatcher.on('change', () => { try { if (!win.isDestroyed()) win.reload(); } catch {} });
    }
  } catch {}

  // Start helpers bound to window
  try { applyClipboardWatcher(win); } catch {}
  try { createTray(win); } catch {}

  // Persist window bounds on move/resize (debounced)
  try {
    let t = null;
    const queueSave = () => {
      try { if (t) clearTimeout(t); } catch {}
      t = setTimeout(() => {
        try {
          const b = win.getBounds();
          SETTINGS.windowBounds = { width: b.width, height: b.height, x: b.x, y: b.y };
          saveSettings();
        } catch {}
      }, 300);
    };
    win.on('resize', queueSave);
    win.on('move', queueSave);
  } catch {}

  // Block navigation and new windows
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Open external links in default browser safely
  win.webContents.on('new-window', (event, url) => { event.preventDefault(); shell.openExternal(url).catch(() => {}); });

  // Close to tray behavior
  try {
    win.on('close', (e) => {
      try {
        if (SETTINGS.closeToTray && !app.isQuiting) {
          e.preventDefault();
          win.hide();
          try {
            if (!TRAY_HIDE_NOTICE_SHOWN) {
              new Notification({ title: 'Still running in tray', body: 'Click the tray icon to restore the app.' }).show();
              TRAY_HIDE_NOTICE_SHOWN = true;
            }
          } catch {}
          return false;
        }
      } catch {}
    });
  } catch {}
}

app.on('ready', async () => {
  try { app.setAppUserModelId?.('com.downloader.app'); } catch {}
  try { Menu.setApplicationMenu(null); } catch {}
  try {
    SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
    loadSettings();
  try { applyLoginItemSettings(); } catch {}
  } catch {}
  try {
    HISTORY_PATH = path.join(app.getPath('userData'), 'history.json');
    loadHistory();
  } catch {}
  try {
    QUEUE_PATH = path.join(app.getPath('userData'), 'queue.json');
    loadQueue();
  } catch {}
  // Notify if binaries are missing to guide the user
  try {
    const baseRes = app.isPackaged ? (process.resourcesPath || process.cwd()) : process.cwd();
    const binDir = path.join(baseRes, 'binaries');
    const ytdlp = process.platform === 'win32' ? path.join(binDir, 'yt-dlp.exe') : path.join(binDir, 'yt-dlp');
    const ffmpegExe = process.platform === 'win32' ? path.join(binDir, 'ffmpeg.exe') : path.join(binDir, 'ffmpeg');
    if (!fs.existsSync(ytdlp) || !fs.existsSync(ffmpegExe)) {
      const notif = new Notification({ title: 'Binaries missing', body: 'yt-dlp and/or ffmpeg not found. Click to open binaries folder.' });
      try { notif.on('click', async () => { try { await fs.promises.mkdir(binDir, { recursive: true }); await shell.openPath(binDir); } catch {} }); } catch {}
      notif.show();
    }
  } catch {}
  // IPC-only: do not start backend in dev or packaged
  createWindow();
  // Handle command-line args on first launch (URLs and commands)
  try { handleArgv(process.argv || []); } catch {}
  // Optionally resume queued/in-progress jobs from history
  try {
    if (SETTINGS.resumeQueuedOnStartup) {
      loadHistory();
      const items = Array.isArray(HISTORY) ? [...HISTORY] : [];
      const toResume = items.filter((x) => x && (x.status === 'queued' || x.status === 'in-progress'));
      // Avoid duplicating items already in QUEUE.json; prefer preserving existing queued entries
      const existingIds = new Set(QUEUE.map((q) => q && q.id));
      for (const it of toResume) {
        if (existingIds.has(it.id)) continue;
        const p = resumePayloadFromHistoryItem(it);
        if (!p) continue;
        try { await startDownloadEnqueueResume(p); } catch {}
      }
      try { drainQueue(); } catch {}
      try { saveQueue(); } catch {}
    }
  } catch {}
  // Windows Jump List task: Open Downloads
  try {
    if (process.platform === 'win32') {
      app.setUserTasks([
        {
          program: process.execPath,
          arguments: '--open-downloads',
          title: 'Open Downloads',
          description: 'Open the Pumpaj Media Downloader folder in Downloads',
        },
      ]);
    }
  } catch {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  try {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length === 0) createWindow();
    else { const w = wins[0]; if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
  } catch {}
});

app.on('before-quit', async (e) => {
  try {
    // Confirm quit if enabled and there are running jobs, unless we've already confirmed
    const forceQuit = !!(app).forceQuit;
    if (!forceQuit && SETTINGS?.confirmOnQuitIfJobs && JOBS.size > 0) {
      e.preventDefault();
      const win = BrowserWindow.getAllWindows()[0] || null;
      let resp = { response: 1 };
      try {
        resp = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Quit', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Quit the app?',
          message: `There are ${JOBS.size} download(s) running. Quit and cancel them?`,
          noLink: true,
        });
      } catch {}
      if (resp.response !== 0) {
        // User canceled quit
        try { logLine('quit:cancel', { jobs: JOBS.size }); } catch {}
        return;
      }
      // Proceed to quit: mark flags and cancel jobs
      try { (app).isQuiting = true; (app).forceQuit = true; } catch {}
      try { logLine('quit:confirm', { jobs: JOBS.size }); } catch {}
      try { for (const [id, child] of JOBS.entries()) { try { const meta = JOB_META.get(id) || {}; meta.canceled = true; JOB_META.set(id, meta); } catch {} try { if (child && !child.killed) child.kill('SIGTERM'); } catch {} } } catch {}
      // Call quit again now that forceQuit is set
      try { app.quit(); } catch {}
      return;
    }
  } catch {}
  try { (app).isQuiting = true; } catch {}
  stopBackend();
  try { distWatcher?.close(); } catch {}
  try { if (CLIPBOARD_TIMER) { clearInterval(CLIPBOARD_TIMER); CLIPBOARD_TIMER = null; } } catch {}
  try { for (const child of JOBS.values()) { try { child.kill('SIGTERM'); } catch {} } JOBS.clear(); } catch {}
});

// Ensure single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const all = BrowserWindow.getAllWindows();
    const win = all[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    // Handle URLs and commands from the new instance
    try { handleArgv(argv || []); } catch {}
  });
}

// IPC: settings get/set (desktop mode)
ipcMain.handle('settings:get', async () => {
  try { loadSettings(); } catch {}
  return { ok: true, data: SETTINGS };
});
ipcMain.handle('settings:set', async (_evt, partial) => {
  try {
    SETTINGS = { ...SETTINGS, ...(partial && typeof partial === 'object' ? partial : {}) };
    MAX_CONCURRENT_JOBS = Math.max(1, Number(SETTINGS.maxConcurrent || 1));
    saveSettings();
  try { logLine('settings:set', { keys: Object.keys(partial || {}) }); } catch {}
  try { applyLoginItemSettings(); } catch {}
  try { applyClipboardWatcher(BrowserWindow.getAllWindows()[0]); } catch {}
  try { updatePowerSaveBlocker(); } catch {}
  try { broadcastSettings(); } catch {}
  try { drainQueue(); } catch {}
    return { ok: true, data: SETTINGS };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// IPC: open downloads folder
ipcMain.handle('open-downloads', async () => {
  try {
  const rootOverride = String(SETTINGS?.downloadsRootDir || '').trim();
  const downloadsRoot = rootOverride || path.join(app.getPath('downloads'), 'MediaDownloader');
    await fs.promises.mkdir(downloadsRoot, { recursive: true });
    await shell.openPath(downloadsRoot);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// IPC: open settings/history files
ipcMain.handle('open:settings-file', async () => {
  try { if (SETTINGS_PATH && fs.existsSync(SETTINGS_PATH)) { const r = await shell.openPath(SETTINGS_PATH); return { ok: !r, error: r || undefined }; } return { ok: false, error: 'not_found' }; } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('open:history-file', async () => {
  try { if (HISTORY_PATH && fs.existsSync(HISTORY_PATH)) { const r = await shell.openPath(HISTORY_PATH); return { ok: !r, error: r || undefined }; } return { ok: false, error: 'not_found' }; } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: binaries check
ipcMain.handle('binaries:check', async () => {
  try {
    const baseRes = app.isPackaged ? (process.resourcesPath || process.cwd()) : process.cwd();
    const binDir = path.join(baseRes, 'binaries');
    const ytdlp = process.platform === 'win32' ? path.join(binDir, 'yt-dlp.exe') : path.join(binDir, 'yt-dlp');
    const ffmpegExe = process.platform === 'win32' ? path.join(binDir, 'ffmpeg.exe') : path.join(binDir, 'ffmpeg');
    const ffprobeExe = process.platform === 'win32' ? path.join(binDir, 'ffprobe.exe') : path.join(binDir, 'ffprobe');
    return {
      ok: true,
      data: {
        binDir,
        ytdlp: fs.existsSync(ytdlp),
        ffmpeg: fs.existsSync(ffmpegExe),
        ffprobe: fs.existsSync(ffprobeExe),
      }
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// IPC: get common paths for renderer convenience
ipcMain.handle('paths:get', async () => {
  try {
    const baseRes = app.isPackaged ? (process.resourcesPath || process.cwd()) : process.cwd();
    const binDir = path.join(baseRes, 'binaries');
    const downloads = app.getPath('downloads');
    const downloadsMediaRoot = path.join(downloads, 'MediaDownloader');
    const backups = path.join(downloadsMediaRoot, 'Backups');
    const userData = app.getPath('userData');
    return { ok: true, data: { binDir, downloads, downloadsMediaRoot, backups, userData } };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: yt-dlp self update
ipcMain.handle('binaries:update', async () => {
  try {
    const baseRes = app.isPackaged ? (process.resourcesPath || process.cwd()) : process.cwd();
    const binDir = path.join(baseRes, 'binaries');
    const YTDLP = process.platform === 'win32' ? path.join(binDir, 'yt-dlp.exe') : path.join(binDir, 'yt-dlp');
    if (!fs.existsSync(YTDLP)) return { ok: false, error: 'ytdlp_missing' };
    return await new Promise((resolve) => {
      try {
        const child = spawn(YTDLP, ['-U'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let out = ''; let err = '';
        child.stdout.on('data', (b) => { out += b.toString(); });
        child.stderr.on('data', (b) => { err += b.toString(); });
        child.on('close', (code) => {
          resolve({ ok: code === 0, output: out.trim(), error: code === 0 ? undefined : (err || 'update_failed') });
        });
      } catch (e) { resolve({ ok: false, error: String(e?.message || e) }); }
    });
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: open/reveal arbitrary path (desktop mode)
ipcMain.handle('path:open', async (_evt, p) => {
  if (!p) return { ok: false, error: 'no_path' };
  try { const r = await shell.openPath(String(p)); return { ok: !r, error: r || undefined }; } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('path:reveal', async (_evt, p) => {
  if (!p) return { ok: false, error: 'no_path' };
  try { shell.showItemInFolder(String(p)); return { ok: true }; } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: history (desktop mode)
ipcMain.handle('history:list', async () => {
  try { loadHistory(); return { ok: true, items: [...HISTORY].reverse() }; } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('history:clear', async () => {
  try { HISTORY = []; saveHistory(); return { ok: true }; } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('history:remove', async (_evt, id) => {
  try { loadHistory(); HISTORY = HISTORY.filter((x) => x?.id !== id); saveHistory(); return { ok: true }; } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: jobs metrics for renderer (running count, queued (na), maxConcurrent)
ipcMain.handle('jobs:metrics', async () => {
  try {
  let aggregatePercent = null;
  try { const frac = getAggregateProgress(); if (typeof frac === 'number') aggregatePercent = Math.round(frac * 100); } catch {}
  return { ok: true, running: JOBS.size, queued: QUEUE.length, maxConcurrent: MAX_CONCURRENT_JOBS, aggregatePercent };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// IPC: queued jobs introspection and control
ipcMain.handle('queue:list', async () => {
  try {
    const list = QUEUE.map((q, idx) => ({ position: idx, id: q.id, url: q.url, title: q.title || '', mode: q.mode || 'video', format: q.format || q.audioFormat || '' }));
    return { ok: true, items: list };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('queue:remove', async (_evt, id) => {
  try {
    const idx = QUEUE.findIndex((q) => q && q.id === id);
    if (idx < 0) return { ok: false, error: 'not_found' };
    QUEUE.splice(idx, 1);
    try { saveQueue(); } catch {}
    try { updateTrayTooltip(); } catch {}
    try { TRAY_REFRESH?.(); } catch {}
    try { updateTaskbarProgress(); } catch {}
    try { updateHistory(id, { status: 'canceled', completedAt: new Date().toISOString() }); } catch {}
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('queue:move', async (_evt, { id, to }) => {
  try {
    const idx = QUEUE.findIndex((q) => q && q.id === id);
    if (idx < 0) return { ok: false, error: 'not_found' };
    const t = Math.max(0, Math.min(QUEUE.length - 1, Number(to)));
    const [item] = QUEUE.splice(idx, 1);
    QUEUE.splice(t, 0, item);
    try { saveQueue(); } catch {}
    try { TRAY_REFRESH?.(); } catch {}
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
// IPC: start a queued item immediately if capacity allows; else move to front and trigger drain
ipcMain.handle('queue:startNow', async (_evt, id) => {
  try {
    const idx = QUEUE.findIndex((q) => q && q.id === id);
    if (idx < 0) return { ok: false, error: 'not_found' };
    const [item] = QUEUE.splice(idx, 1);
    try { saveQueue(); } catch {}
    if (JOBS.size < MAX_CONCURRENT_JOBS && !SETTINGS.pauseNewJobs) {
      try { await startDownloadInternal(item); } catch {}
    } else {
      QUEUE.unshift(item);
      try { saveQueue(); } catch {}
    }
    try { updateTrayTooltip(); } catch {}
    try { TRAY_REFRESH?.(); } catch {}
    try { drainQueue(); } catch {}
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: clear entire queue and mark items canceled in history
ipcMain.handle('queue:clear', async () => {
  try {
    const ids = QUEUE.map(q => q && q.id).filter(Boolean);
    QUEUE.length = 0;
    try { saveQueue(); } catch {}
    try { updateTrayTooltip(); } catch {}
    try { TRAY_REFRESH?.(); } catch {}
    try { updateTaskbarProgress(); } catch {}
    for (const id of ids) { try { updateHistory(id, { status: 'canceled', completedAt: new Date().toISOString() }); } catch {} }
    return { ok: true, count: ids.length };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: attempt to start all queued items (drain respectfully)
ipcMain.handle('queue:startAll', async () => {
  try {
    if (SETTINGS.pauseNewJobs) return { ok: false, error: 'paused' };
    try { drainQueue(); } catch {}
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: cancel all running jobs
ipcMain.handle('jobs:cancelAll', async () => {
  try {
    for (const [id, child] of JOBS.entries()) {
      try { const meta = JOB_META.get(id) || {}; meta.canceled = true; JOB_META.set(id, meta); } catch {}
      try { if (child && !child.killed) child.kill('SIGTERM'); } catch {}
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: app info for diagnostics
ipcMain.handle('app:info', async () => {
  try {
    const baseRes = app.isPackaged ? (process.resourcesPath || process.cwd()) : process.cwd();
    const binDir = path.join(baseRes, 'binaries');
    return {
      ok: true,
      data: {
        version: app.getVersion?.() || '0.0.0',
        platform: process.platform,
        arch: process.arch,
        isPackaged: !!app.isPackaged,
        binDir,
        jobsRunning: JOBS.size,
        maxConcurrent: MAX_CONCURRENT_JOBS,
      }
    };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: download start/cancel using yt-dlp with JSON progress
ipcMain.handle('dl-start', async (_evt, payload) => {
  const res = await startDownloadEnqueue(payload);
  try { updatePowerSaveBlocker(); } catch {}
  return res;
});

ipcMain.handle('dl-cancel', async (_evt, id) => {
  try { logLine('download:cancel', { id }); } catch {}
  const child = JOBS.get(id);
  if (child) {
    try { const meta = JOB_META.get(id) || {}; meta.canceled = true; JOB_META.set(id, meta); } catch {}
    if (!child.killed) { try { child.kill('SIGTERM'); } catch {} }
    try { updateHistory(id, { status: 'canceled', completedAt: new Date().toISOString() }); } catch {}
  try { TRAY_REFRESH?.(); } catch {}
    return { ok: true, canceled: 'running' };
  }
  // Not running: try to remove from queue
  try {
    const idx = QUEUE.findIndex((q) => q && q.id === id);
    if (idx >= 0) {
      QUEUE.splice(idx, 1);
  try { saveQueue(); } catch {}
      try { updateTrayTooltip(); } catch {}
  try { TRAY_REFRESH?.(); } catch {}
      try { updateTaskbarProgress(); } catch {}
      try { updateHistory(id, { status: 'canceled', completedAt: new Date().toISOString() }); } catch {}
      return { ok: true, canceled: 'queued' };
    }
  } catch {}
  // Unknown id; still return ok
  try { updateHistory(id, { status: 'canceled', completedAt: new Date().toISOString() }); } catch {}
  return { ok: true, canceled: 'unknown' };
});

// IPC: Retry helpers
function retryPayloadFromHistoryItem(item) {
  try {
    const url = String(item?.url || '');
    if (!url) return null;
    const id = genJobId();
    const recType = String(item?.type || '').toLowerCase();
    if (recType === 'audio') {
      const fmt = String(item?.format || 'm4a').toLowerCase();
      const audioFormat = ['m4a','mp3','opus','aac'].includes(fmt) ? fmt : 'm4a';
      return { id, url, mode: 'audio', audioFormat };
    }
    // default video
    return { id, url, mode: 'video', format: 'best' };
  } catch { return null; }
}

// Build a payload for resuming an existing history item, preserving the id
function resumePayloadFromHistoryItem(item) {
  try {
    const url = String(item?.url || '');
    if (!url) return null;
    const id = String(item?.id || '');
    if (!id) return null;
    const recType = String(item?.type || '').toLowerCase();
    if (recType === 'audio') {
      const fmt = String(item?.format || 'm4a').toLowerCase();
      const audioFormat = ['m4a','mp3','opus','aac'].includes(fmt) ? fmt : 'm4a';
      return { id, url, mode: 'audio', audioFormat };
    }
    return { id, url, mode: 'video', format: 'best' };
  } catch { return null; }
}

// Enqueue/start for resume without duplicating history records
async function startDownloadEnqueueResume(payload) {
  const p = { ...payload };
  if (!p.id) p.id = genJobId();
  if (JOBS.size >= MAX_CONCURRENT_JOBS || SETTINGS.pauseNewJobs) {
    try { logLine('resume:queue', { id: p.id, url: p.url }); } catch {}
    QUEUE.push(p);
  try { saveQueue(); } catch {}
    try { updateTrayTooltip(); } catch {}
  try { TRAY_REFRESH?.(); } catch {}
    try { updateTaskbarProgress(); } catch {}
    try { updateHistory(p.id, { status: 'queued' }); } catch {}
    return { ok: true, queued: true, id: p.id };
  }
  const res = await startDownloadInternal(p);
  try { updateTaskbarProgress(); } catch {}
  return { ...(res || {}), id: p.id };
}

ipcMain.handle('jobs:retryLastFailed', async () => {
  try {
    loadHistory();
    const items = Array.isArray(HISTORY) ? [...HISTORY] : [];
    const lastF = items.slice().reverse().find((x) => x && x.status === 'failed');
    if (!lastF) return { ok: false, error: 'no_failed' };
    const p = retryPayloadFromHistoryItem(lastF);
    if (!p) return { ok: false, error: 'bad_item' };
    const r = await startDownloadEnqueue(p);
    return { ok: true, id: r.id, queued: r.queued };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

ipcMain.handle('jobs:retryAllFailed', async () => {
  try {
    loadHistory();
    const items = Array.isArray(HISTORY) ? [...HISTORY] : [];
    const failed = items.filter((x) => x && x.status === 'failed');
    if (failed.length === 0) return { ok: false, error: 'no_failed' };
    const ids = [];
    for (const it of failed) {
      const p = retryPayloadFromHistoryItem(it);
      if (!p) continue;
      const r = await startDownloadEnqueue(p);
      ids.push(r.id);
    }
    return { ok: true, ids, count: ids.length };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: retry a specific history item by id
ipcMain.handle('jobs:retryById', async (_evt, id) => {
  try {
    if (!id) return { ok: false, error: 'no_id' };
    loadHistory();
    const it = (Array.isArray(HISTORY) ? HISTORY : []).find((x) => x && x.id === id);
    if (!it) return { ok: false, error: 'not_found' };
    const p = retryPayloadFromHistoryItem(it);
    if (!p) return { ok: false, error: 'bad_item' };
    const r = await startDownloadEnqueue(p);
    return { ok: true, id: r.id, queued: !!r.queued };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// IPC: open backups folder
ipcMain.handle('open:backups', async () => {
  try {
    const dir = path.join(app.getPath('downloads'), 'MediaDownloader', 'Backups');
    await fs.promises.mkdir(dir, { recursive: true });
    const r = await shell.openPath(dir);
    return { ok: !r, error: r || undefined };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: open logs (folder/file)
ipcMain.handle('open:logs-folder', async () => {
  try {
    const { dir } = getLogPaths();
    if (!dir) return { ok: false, error: 'no_logs_dir' };
    await fs.promises.mkdir(dir, { recursive: true });
    const r = await shell.openPath(dir);
    return { ok: !r, error: r || undefined };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('open:log-file', async () => {
  try {
    const { file } = getLogPaths();
    if (!file) return { ok: false, error: 'no_log_file' };
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.appendFile(file, '');
    const r = await shell.openPath(file);
    return { ok: !r, error: r || undefined };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: show directory picker (native)
ipcMain.handle('dialog:pickDirectory', async (_evt, options) => {
  try {
    const res = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0], { title: 'Select a folder', properties: ['openDirectory'], ...(options || {}) });
    if (res.canceled || !res.filePaths?.[0]) return { ok: false, canceled: true };
    return { ok: true, path: res.filePaths[0] };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: backups
ipcMain.handle('backup:create', async () => {
  try {
    const r = await createBackupAtTimestamp();
    return r;
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('backup:restore', async (_evt, dir) => {
  try {
    if (!dir) return { ok: false, error: 'no_directory' };
    if (JOBS.size > 0) {
      try {
        const win = BrowserWindow.getAllWindows()[0];
        const confirm = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancel All and Restore', 'Abort'], defaultId: 0, cancelId: 1, title: 'Jobs running', message: `There are ${JOBS.size} running jobs. Cancel them and restore?` });
        if (confirm.response !== 0) return { ok: false, error: 'busy' };
        // cancel all
        for (const [id, child] of JOBS.entries()) {
          try { const meta = JOB_META.get(id) || {}; meta.canceled = true; JOB_META.set(id, meta); } catch {}
          try { if (child && !child.killed) child.kill('SIGTERM'); } catch {}
        }
      } catch {}
    }
    return await restoreBackupFromDirectory(dir);
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});

// IPC: analyze url via yt-dlp JSON (no HTTP)
ipcMain.handle('analyze', async (_evt, { url }) => {
  if (!url || !isHttpUrl(url)) return { ok: false, error: 'invalid_url' };
  const baseRes = app.isPackaged ? (process.resourcesPath || process.cwd()) : process.cwd();
  const binDir = path.join(baseRes, 'binaries');
  const YTDLP = process.platform === 'win32' ? path.join(binDir, 'yt-dlp.exe') : path.join(binDir, 'yt-dlp');
  if (!fs.existsSync(YTDLP)) return { ok: false, error: 'ytdlp_missing' };
  const args = ['-J', '--no-warnings', String(url)];
  return await new Promise((resolve) => {
    try {
      const child = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let out = '';
      let err = '';
      const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, 25000);
      child.stdout.on('data', (b) => { out += b.toString(); });
      child.stderr.on('data', (b) => { err += b.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(out.trim());
          resolve({ ok: true, data: json });
        } catch {
          resolve({ ok: false, error: err || 'analyze_failed' });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e?.message || e) });
    }
  });
});
