import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Settings as SettingsIcon, Monitor, Download as DownloadIcon, Folder, Wifi, Cpu, Shield, Database, Zap, Activity } from 'lucide-react';
import { getJobsSettings, updateJobsSettings, API_BASE, authHeaders } from '../lib/api';
import { useClientSettings } from './SettingsContext';
import { useToast } from './ToastProvider';
import { getDefaultDirHandle, setDefaultDirHandle, clearDefaultDirHandle, ensureWritePermission } from '../lib/fsStore';
import { useAuth } from './AuthProvider';

interface SettingsSection {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
}

export const SettingsTab: React.FC = () => {
  const { settings: clientSettings, setSettings: setClientSettings } = useClientSettings();
  const { success, error } = useToast();
  const [activeSection, setActiveSection] = useState<'general'|'downloads'|'quality'|'network'|'privacy'|'system'|'diagnostics'|'advanced'>('general');
  const STORAGE_KEY = 'app:settings:v1';
  const [settings, setSettings] = useState({
    // General
    theme: 'dark',
    language: 'en',
    autoStart: true,
    minimizeToTray: true,
    showNotifications: clientSettings.showNotifications,
    openFolderAfterSave: clientSettings.openFolderAfterSave ?? false,
    // Downloads
    downloadPath: 'C:\\Users\\User\\Downloads',
    maxConcurrentDownloads: 3,
    maxRetries: 5,
    connectionTimeout: 30,
    autoResume: true,
    createSubfolders: true,
    // Quality
    defaultVideoQuality: '1080p',
    defaultAudioQuality: '320',
    preferredFormat: 'mp4',
    enableHDR: true,
    // Network
    useProxy: false,
    proxyAddress: '',
    proxyPort: '',
    limitBandwidth: false,
    maxSpeed: '0',
    // Privacy
    clearHistoryOnExit: false,
    incognitoMode: false,
    anonymousDownload: false,
    // Advanced
    enableLogging: true,
    debugMode: false,
    hardwareAcceleration: true,
    autoUpdate: true,
    // Server (System)
    serverMaxConcurrent: 2,
    serverProxyUrl: '',
    serverLimitRateKbps: 0,
  });
  const [serverStats, setServerStats] = useState<{ running: number; queued: number }>({ running: 0, queued: 0 });
  const apiBase = API_BASE; // use shared base (relative by default) to honor Vite proxy/backend dynamic port
  const { me, policy } = useAuth();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [defaultDirName, setDefaultDirName] = useState<string>('');
  const [serverInfo, setServerInfo] = useState<{ name?: string; version?: string; node?: string; platform?: string; ytDlp?: string; ffmpeg?: string; ffmpegVersion?: string; checks?: { ytdlpAvailable?: boolean; ffmpegAvailable?: boolean } } | null>(null);
  const [logLines, setLogLines] = useState<string[] | null>(null);
  const isIpc = typeof window !== 'undefined' && Boolean((window as any).api?.analyze || (window as any).api?.start);
  const [ipcSettings, setIpcSettings] = useState<{ maxConcurrent: number; proxyUrl: string; proxyEnabled?: boolean; limitRateKib: number; connections: number; openOnComplete?: boolean; filenameTemplate?: string; subtitles?: { enabled?: boolean; embed?: boolean; languages?: string }; playlistItems?: string; clipboardWatcher?: boolean; pauseNewJobs?: boolean; autoAnalyzeClipboard?: boolean; closeToTray?: boolean; startMinimized?: boolean; launchOnStartup?: boolean; preventSleepWhileDownloading?: boolean; confirmOnQuitIfJobs?: boolean; resumeQueuedOnStartup?: boolean; downloadsRootDir?: string; skipExisting?: boolean; useDownloadArchive?: boolean } | null>(null);
  const [binStatus, setBinStatus] = useState<{ ytdlp: boolean; ffmpeg: boolean; ffprobe: boolean } | null>(null);
  const [ipcMetrics, setIpcMetrics] = useState<{ running: number; queued: number; maxConcurrent: number } | null>(null);

  // Load settings and server info
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          setSettings((p) => ({ ...p, ...saved }));
          if (typeof saved.showNotifications === 'boolean') setClientSettings({ showNotifications: !!saved.showNotifications });
        }
      }
    } catch {}

    (async () => {
      try {
        const s = await getJobsSettings();
        setSettings((prev) => ({
          ...prev,
          serverMaxConcurrent: s.maxConcurrent,
          serverProxyUrl: (s as any).proxyUrl || '',
          serverLimitRateKbps: Number((s as any).limitRateKbps || 0),
        }));
      } catch {}
      try {
        const h = await getDefaultDirHandle();
        if (h) setDefaultDirName((h as any).name || '');
      } catch {}
      if (!isIpc) {
        try {
          const r = await fetch(`${apiBase}/api/version`, { cache: 'no-store', headers: authHeaders() });
          if (r.ok) {
            const j = await r.json();
            setServerInfo({ name: j?.name, version: j?.version, node: j?.node, platform: j?.platform, ytDlp: j?.ytDlp, ffmpeg: j?.ffmpeg, ffmpegVersion: j?.ffmpegVersion, checks: j?.checks });
          }
        } catch {}
        try {
          const r = await fetch(`${apiBase}/api/logs/tail?lines=200`, { cache: 'no-store', headers: authHeaders() });
          if (r.ok) {
            const j = await r.json();
            setLogLines(Array.isArray(j?.lines) ? j.lines : null);
          }
        } catch {}
      } else {
        // Load desktop (IPC) settings and binaries status
        try {
          const r = await (window as any).api?.getSettings?.();
            if (r?.ok && r?.data) setIpcSettings({
            maxConcurrent: Number(r.data.maxConcurrent || 3),
            proxyUrl: String(r.data.proxyUrl || ''),
            proxyEnabled: (r.data.proxyEnabled ?? true),
            limitRateKib: Number(r.data.limitRateKib || 0),
            connections: Math.max(1, Number(r.data.connections || 3)),
            openOnComplete: Boolean(r.data.openOnComplete),
            filenameTemplate: String(r.data.filenameTemplate || '%(title)s.%(ext)s'),
            subtitles: { enabled: !!r.data?.subtitles?.enabled, embed: !!r.data?.subtitles?.embed, languages: String(r.data?.subtitles?.languages || '') },
            playlistItems: String(r.data.playlistItems || ''),
            clipboardWatcher: !!r.data.clipboardWatcher,
            pauseNewJobs: !!r.data.pauseNewJobs,
            autoAnalyzeClipboard: !!r.data.autoAnalyzeClipboard,
            closeToTray: !!r.data.closeToTray,
            startMinimized: !!r.data.startMinimized,
              launchOnStartup: !!r.data.launchOnStartup,
              preventSleepWhileDownloading: !!r.data.preventSleepWhileDownloading,
              confirmOnQuitIfJobs: !!r.data.confirmOnQuitIfJobs,
              resumeQueuedOnStartup: !!r.data.resumeQueuedOnStartup,
              downloadsRootDir: String(r.data.downloadsRootDir || ''),
              skipExisting: !!r.data.skipExisting,
              useDownloadArchive: !!r.data.useDownloadArchive,
          });
        } catch {}
        try {
          const r = await (window as any).api?.checkBinaries?.();
          if (r?.ok && r?.data) setBinStatus({ ytdlp: !!r.data.ytdlp, ffmpeg: !!r.data.ffmpeg, ffprobe: !!r.data.ffprobe });
        } catch {}
      }
    })();
  }, [apiBase, setClientSettings, isIpc]);

  // Poll server metrics
  useEffect(() => {
    if (isIpc) return;
    let disposed = false;
    const tick = async () => {
      try {
        const r = await fetch(`${apiBase}/api/jobs/metrics`, { cache: 'no-store', headers: authHeaders() });
        if (r.ok) {
          const j = await r.json();
          if (!disposed) setServerStats({ running: Number(j.running || 0), queued: Number(j.queued || 0) });
        }
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { disposed = true; clearInterval(id); };
  }, [apiBase, isIpc]);

  // IPC metrics polling for desktop mode
  useEffect(() => {
    if (!isIpc) return;
    let disposed = false;
    const tick = async () => {
      try {
        const r = await (window as any).api?.jobsMetrics?.();
        if (!disposed && r) setIpcMetrics({ running: Number(r.running || 0), queued: Number(r.queued || 0), maxConcurrent: Number(r.maxConcurrent || (ipcSettings?.maxConcurrent || 3)) });
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { disposed = true; clearInterval(id); };
  }, [isIpc, ipcSettings?.maxConcurrent]);

  const sections: SettingsSection[] = [
    { id: 'general', title: 'General', icon: SettingsIcon, description: 'Basic app preferences' },
    { id: 'downloads', title: 'Downloads', icon: DownloadIcon, description: 'Download behavior and paths' },
    { id: 'quality', title: 'Quality', icon: Monitor, description: 'Default quality settings' },
    { id: 'network', title: 'Network', icon: Wifi, description: 'Connection and proxy settings' },
    { id: 'privacy', title: 'Privacy', icon: Shield, description: 'Privacy and security options' },
  { id: 'system', title: 'System', icon: Cpu, description: 'Server jobs and queue' },
  { id: 'diagnostics', title: 'Diagnostics', icon: Activity, description: 'Maintenance and system info' },
    { id: 'advanced', title: 'Advanced', icon: Zap, description: 'Advanced technical settings' },
  ];

  const planLabel = useMemo(() => policy?.plan || me?.plan || 'FREE', [policy, me]);

  const handleSettingChange = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  if (key === 'showNotifications') setClientSettings({ showNotifications: Boolean(value) });
    if (key === 'openFolderAfterSave') setClientSettings({ openFolderAfterSave: Boolean(value) });
  };

  const handleBrowseFolder = async () => {
    try {
      if (!('showDirectoryPicker' in window)) { error('Folder picker not supported.'); return; }
      const handle = await (window as any).showDirectoryPicker();
      const ok = await ensureWritePermission(handle);
      if (!ok) { error('Permission denied for selected folder.'); return; }
      await setDefaultDirHandle(handle);
      setDefaultDirName(handle.name || '');
      success('Default folder saved.');
    } catch {}
  };

  const ToggleSwitch: React.FC<{ enabled: boolean; onChange: (value: boolean) => void; label: string; description?: string }> = ({ enabled, onChange, label, description }) => (
    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
      <div>
        <div className="text-white font-medium">{label}</div>
        {description && <div className="text-white/60 text-sm mt-1">{description}</div>}
      </div>
      <button onClick={() => onChange(!enabled)} className={`relative w-12 h-6 rounded-full transition-all duration-300 ${enabled ? 'bg-gradient-to-r from-purple-600 to-pink-600' : 'bg-white/20'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${enabled ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  );

  const InputField: React.FC<{ label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; suffix?: string }> = ({ label, value, onChange, type = 'text', placeholder, suffix }) => (
    <div className="space-y-2">
      <label className="text-white font-medium">{label}</label>
      <div className="relative">
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 transition-all duration-300 outline-none" />
        {suffix && (<span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 text-sm">{suffix}</span>)}
      </div>
    </div>
  );

  const SelectField: React.FC<{ label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }> = ({ label, value, onChange, options }) => (
    <div className="space-y-2">
      <label className="text-white font-medium">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 transition-all duration-300 outline-none">
        {options.map((option) => (<option key={option.value} value={option.value} className="bg-slate-800">{option.label}</option>))}
      </select>
    </div>
  );

  useEffect(() => {
    if (!isIpc) return;
    try {
      const off = (window as any).api?.onSettingsChanged?.((s: any) => {
        if (!s) return;
  setIpcSettings({
          maxConcurrent: Number(s.maxConcurrent || 3),
          proxyUrl: String(s.proxyUrl || ''),
    proxyEnabled: (s.proxyEnabled ?? true),
          limitRateKib: Number(s.limitRateKib || 0),
          connections: Math.max(1, Number(s.connections || 3)),
          openOnComplete: !!s.openOnComplete,
          filenameTemplate: String(s.filenameTemplate || '%(title)s.%(ext)s'),
          subtitles: { enabled: !!s?.subtitles?.enabled, embed: !!s?.subtitles?.embed, languages: String(s?.subtitles?.languages || '') },
          playlistItems: String(s.playlistItems || ''),
          clipboardWatcher: !!s.clipboardWatcher,
          pauseNewJobs: !!s.pauseNewJobs,
          autoAnalyzeClipboard: !!s.autoAnalyzeClipboard,
          closeToTray: !!s.closeToTray,
          startMinimized: !!s.startMinimized,
        preventSleepWhileDownloading: !!s.preventSleepWhileDownloading,
  confirmOnQuitIfJobs: !!s.confirmOnQuitIfJobs,
  resumeQueuedOnStartup: !!s.resumeQueuedOnStartup,
  downloadsRootDir: String(s.downloadsRootDir || ''),
  skipExisting: !!s.skipExisting,
  useDownloadArchive: !!s.useDownloadArchive,
        });
      });
      return () => { try { off?.(); } catch {} };
    } catch {}
  }, [isIpc]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch min-h-[70vh]">
        {/* Left: categories */}
        <div className="lg:col-span-1 h-full">
          <div className="space-y-2">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => setActiveSection(s.id as any)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${activeSection === s.id ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
                  <Icon className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs opacity-80">{s.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: content */}
        <div className="lg:col-span-3 h-full flex flex-col">
          <div className="flex-1 flex flex-col">
            {/* General */}
            {activeSection === 'general' && (
              <div className="space-y-6">
                <div className="p-4 bg-emerald-500/10 border border-emerald-400/30 rounded-xl">
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div>
                      <div className="text-white font-medium">Plan: <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-emerald-200 text-xs">{planLabel}</span></div>
                      <div className="text-white/70 text-sm">Free plan. Login required. No premium features.</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <SelectField label="Theme" value={settings.theme} onChange={(v) => handleSettingChange('theme', v)} options={[{ value: 'dark', label: 'Dark Theme' }, { value: 'light', label: 'Light Theme' }, { value: 'auto', label: 'Auto (System)' }]} />
                  <SelectField label="Language" value={settings.language} onChange={(v) => handleSettingChange('language', v)} options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' }, { value: 'fr', label: 'French' }, { value: 'de', label: 'German' }, { value: 'sr', label: 'Serbian' }]} />
                </div>

                <div className="space-y-4">
                  <ToggleSwitch enabled={settings.autoStart} onChange={(v) => handleSettingChange('autoStart', v)} label="Auto Start" description="Launch application when system starts" />
                  <ToggleSwitch enabled={settings.minimizeToTray} onChange={(v) => handleSettingChange('minimizeToTray', v)} label="Minimize to System Tray" description="Keep running in background when window is closed" />
                  <ToggleSwitch enabled={settings.showNotifications} onChange={(v) => handleSettingChange('showNotifications', v)} label="Show Notifications" description="Display desktop notifications for downloads" />
                  <ToggleSwitch enabled={settings.openFolderAfterSave} onChange={(v) => handleSettingChange('openFolderAfterSave', v)} label="Open folder after save" description="Opens the destination folder automatically when a file is saved" />
                </div>
              </div>
            )}

            {/* Downloads */}
            {activeSection === 'downloads' && (
              <div className="space-y-6">
                <div>
                  <label className="text-white font-medium mb-2 block">Download Location</label>
                  <div className="flex gap-3">
                    <input type="text" value={defaultDirName || settings.downloadPath} onChange={(e) => handleSettingChange('downloadPath', e.target.value)} placeholder={defaultDirName ? 'Chosen via picker' : ''} className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 transition-all duration-300 outline-none" readOnly={Boolean(defaultDirName)} />
                    <button onClick={handleBrowseFolder} className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl transition-all duration-300 flex items-center gap-2"><Folder className="w-5 h-5" />Browse</button>
                    {defaultDirName && (
                      <button onClick={async () => { await clearDefaultDirHandle(); setDefaultDirName(''); success('Default folder cleared.'); }} className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-300">Clear</button>
                    )}
                  </div>
                  {defaultDirName && (<div className="text-xs text-white/60 mt-2">Using: {defaultDirName}</div>)}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <InputField label="Max Concurrent Downloads" value={settings.maxConcurrentDownloads.toString()} onChange={(v) => handleSettingChange('maxConcurrentDownloads', parseInt(v) || 3)} type="number" />
                  <InputField label="Max Retries" value={settings.maxRetries.toString()} onChange={(v) => handleSettingChange('maxRetries', parseInt(v) || 5)} type="number" />
                  <InputField label="Connection Timeout" value={settings.connectionTimeout.toString()} onChange={(v) => handleSettingChange('connectionTimeout', parseInt(v) || 30)} type="number" suffix="seconds" />
                </div>

                <div className="space-y-4">
                  <ToggleSwitch enabled={settings.autoResume} onChange={(v) => handleSettingChange('autoResume', v)} label="Auto Resume Downloads" description="Automatically resume interrupted downloads" />
                  <ToggleSwitch enabled={settings.createSubfolders} onChange={(v) => handleSettingChange('createSubfolders', v)} label="Create Subfolders" description="Organize downloads by type in separate folders" />
                </div>
              </div>
            )}

            {/* Quality */}
            {activeSection === 'quality' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <SelectField label="Default Video Quality" value={settings.defaultVideoQuality} onChange={(v) => handleSettingChange('defaultVideoQuality', v)} options={[{ value: '4K', label: '4K Ultra HD' }, { value: '1440p', label: '1440p QHD' }, { value: '1080p', label: '1080p Full HD' }, { value: '720p', label: '720p HD' }, { value: '480p', label: '480p SD' }]} />
                  <SelectField label="Default Audio Quality" value={settings.defaultAudioQuality} onChange={(v) => handleSettingChange('defaultAudioQuality', v)} options={[{ value: '320', label: '320 kbps (Best)' }, { value: '256', label: '256 kbps (High)' }, { value: '192', label: '192 kbps (Standard)' }, { value: '128', label: '128 kbps (Low)' }]} />
                  <SelectField label="Preferred Video Format" value={settings.preferredFormat} onChange={(v) => handleSettingChange('preferredFormat', v)} options={[{ value: 'mp4', label: 'MP4 (Recommended)' }, { value: 'webm', label: 'WebM' }, { value: 'mkv', label: 'MKV' }, { value: 'avi', label: 'AVI' }]} />
                </div>
                <ToggleSwitch enabled={settings.enableHDR} onChange={(v) => handleSettingChange('enableHDR', v)} label="Enable HDR Downloads" description="Download HDR content when available (requires compatible display)" />
              </div>
            )}

            {/* Network */}
            {activeSection === 'network' && (
              <div className="space-y-6">
                <div className="space-y-6">
                  <ToggleSwitch enabled={settings.useProxy} onChange={(v) => handleSettingChange('useProxy', v)} label="Use Proxy Server" description="Route downloads through a proxy server" />
                  {settings.useProxy && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-8 border-l-2 border-purple-500/30">
                      <InputField label="Proxy Address" value={settings.proxyAddress} onChange={(v) => handleSettingChange('proxyAddress', v)} placeholder="proxy.example.com" />
                      <InputField label="Proxy Port" value={settings.proxyPort} onChange={(v) => handleSettingChange('proxyPort', v)} placeholder="8080" type="number" />
                    </div>
                  )}
                  <ToggleSwitch enabled={settings.limitBandwidth} onChange={(v) => handleSettingChange('limitBandwidth', v)} label="Limit Download Speed" description="Set maximum download speed to preserve bandwidth" />
                  {settings.limitBandwidth && (
                    <div className="pl-8 border-l-2 border-purple-500/30">
                      <InputField label="Maximum Speed" value={settings.maxSpeed} onChange={(v) => handleSettingChange('maxSpeed', v)} placeholder="0 = unlimited" suffix="MB/s" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Privacy */}
            {activeSection === 'privacy' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <ToggleSwitch enabled={settings.clearHistoryOnExit} onChange={(v) => handleSettingChange('clearHistoryOnExit', v)} label="Clear History on Exit" description="Automatically clear download history when closing the app" />
                  <ToggleSwitch enabled={settings.incognitoMode} onChange={(v) => handleSettingChange('incognitoMode', v)} label="Incognito Mode" description="Don't save download history or temporary files" />
                  <ToggleSwitch enabled={settings.anonymousDownload} onChange={(v) => handleSettingChange('anonymousDownload', v)} label="Anonymous Downloads" description="Use anonymous user agent and headers" />
                </div>

                <div className="mt-8 p-6 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <h3 className="text-red-400 font-semibold mb-3 flex items-center gap-2"><Database className="w-5 h-5" />Data Management</h3>
                  <div className="space-y-3">
                    <button onClick={async () => { try { const api = import.meta.env.VITE_API_BASE || 'http://localhost:5176'; const r = await fetch(`${api}/api/history`, { method: 'DELETE' }); if (!r.ok) throw new Error('failed'); success('History cleared'); } catch { error('Failed to clear history'); } }} className="w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-400 transition-all duration-300">Clear All Download History</button>
                    <button onClick={async () => { try { const api = import.meta.env.VITE_API_BASE || 'http://localhost:5176'; const r = await fetch(`${api}/api/jobs/cleanup-temp`, { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('failed'); success(`Temporary files cleaned${typeof j.removed === 'number' ? `, removed ${j.removed}` : ''}`); } catch { error('Failed to clean temp files'); } }} className="w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-400 transition-all duration-300">Clear All Temporary Files</button>
                    <button disabled={(serverStats.running + serverStats.queued) > 0} title={(serverStats.running + serverStats.queued) > 0 ? 'Stop or finish jobs before resetting' : ''} onClick={async () => { try { const api = import.meta.env.VITE_API_BASE || 'http://localhost:5176'; const r = await fetch(`${api}/api/jobs/settings/reset`, { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('failed'); setSettings((prev) => ({ ...prev, serverMaxConcurrent: Number(j.maxConcurrent ?? 2), serverProxyUrl: String(j.proxyUrl || ''), serverLimitRateKbps: Number(j.limitRateKbps || 0) })); success('All server settings reset'); } catch { error('Failed to reset settings'); } }} className="w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-400 transition-all duration-300">Reset All Settings</button>
                  </div>
                </div>
              </div>
            )}

            {/* System (moved from Advanced) */}
            {activeSection === 'system' && (
              <div className="space-y-6">
                <div className="p-6 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                  {!isIpc ? (
                    <>
                      <h3 className="text-purple-300 font-semibold mb-3">Jobs Queue</h3>
                      <p className="text-white/70 text-sm mb-4">Control how many downloads run in parallel on the server.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                        <div>
                          <label className="text-white font-medium">Max Concurrent Jobs</label>
                          <div className="mt-2 flex items-center gap-3">
                            <input type="range" min={1} max={6} step={1} value={settings.serverMaxConcurrent} onChange={(e) => handleSettingChange('serverMaxConcurrent', parseInt(e.target.value) || 1)} className="w-full" />
                            <span className="w-10 text-white/80 text-sm text-center">{settings.serverMaxConcurrent}</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-white font-medium">Proxy URL (optional)</label>
                          <input type="text" value={settings.serverProxyUrl} onChange={(e) => handleSettingChange('serverProxyUrl', e.target.value)} placeholder="http://user:pass@host:port or socks5://host:port" className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none" />
                        </div>
                        <div>
                          <label className="text-white font-medium">Limit Rate (KiB/s, 0 = unlimited)</label>
                          <input type="number" min={0} value={settings.serverLimitRateKbps} onChange={(e) => handleSettingChange('serverLimitRateKbps', parseInt(e.target.value) || 0)} className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none" />
                        </div>
                        <div className="md:col-span-2 text-xs text-white/60 -mt-2">Current: max {settings.serverMaxConcurrent} • Proxy: {settings.serverProxyUrl ? 'on' : 'off'} • Limit: {Number(settings.serverLimitRateKbps || 0)} KiB/s • Running: {serverStats.running} • Queued: {serverStats.queued}</div>
                        <div className="text-right">
                          <button onClick={async () => { try { if (settings.serverProxyUrl && !/^https?:\/\//i.test(settings.serverProxyUrl) && !/^socks\d?:\/\//i.test(settings.serverProxyUrl)) { error('Proxy must start with http://, https://, socks5://'); return; } const s = await updateJobsSettings({ maxConcurrent: settings.serverMaxConcurrent, proxyUrl: settings.serverProxyUrl || undefined, limitRateKbps: Number(settings.serverLimitRateKbps || 0) }); setSettings((prev) => ({ ...prev, serverMaxConcurrent: Number(s.maxConcurrent ?? prev.serverMaxConcurrent), serverProxyUrl: String(s.proxyUrl || ''), serverLimitRateKbps: Number(s.limitRateKbps || 0) })); success('Server settings saved'); } catch { error('Failed to update server settings'); } }} className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl">Save Server Settings</button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-purple-300 font-semibold mb-3">Desktop Download Engine</h3>
                      <p className="text-white/70 text-sm mb-4">These settings apply to downloads run directly on your PC.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                        <div>
                          <label className="text-white font-medium">Max Concurrent Jobs</label>
                          <div className="mt-2 flex items-center gap-3">
                            <input type="range" min={1} max={6} step={1} value={ipcSettings?.maxConcurrent || 3} onChange={(e) => setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), maxConcurrent: parseInt(e.target.value) || 1 }))} className="w-full" />
                            <span className="w-10 text-white/80 text-sm text-center">{ipcSettings?.maxConcurrent || 3}</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-white font-medium">Proxy URL (optional)</label>
                          <input type="text" value={ipcSettings?.proxyUrl || ''} onChange={(e) => setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), proxyUrl: e.target.value }))} placeholder="http://user:pass@host:port or socks5://host:port" className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none" />
                          <label className="mt-2 inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={ipcSettings?.proxyEnabled ?? true} onChange={(e) => setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), proxyEnabled: e.target.checked }))} /> Enable proxy
                          </label>
                        </div>
                        <div>
                          <label className="text-white font-medium">Downloads folder (desktop engine)</label>
                          <div className="mt-2 flex items-center gap-2">
                            <input type="text" readOnly value={ipcSettings?.downloadsRootDir || ''} placeholder={`Default: ${navigator.platform?.startsWith('Win') ? 'Downloads\\MediaDownloader' : 'Downloads/MediaDownloader'}`} className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 outline-none" />
                            <button onClick={async () => { try { const pick = await (window as any).api?.pickDirectory?.({ title: 'Select downloads folder' }); if (pick?.ok && pick.path) setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), downloadsRootDir: pick.path })); } catch {} }} className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white">Choose…</button>
                            <button onClick={() => setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), downloadsRootDir: '' }))} className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white">Clear</button>
                          </div>
                          <div className="text-xs text-white/50 mt-1">If empty, defaults to your system Downloads/MediaDownloader.</div>
                        </div>
                        <div>
                          <label className="text-white font-medium">Limit Rate (KiB/s, 0 = unlimited)</label>
                          <input type="number" min={0} value={ipcSettings?.limitRateKib ?? 0} onChange={(e) => setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), limitRateKib: parseInt(e.target.value) || 0 }))} className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none" />
                        </div>
                        <div>
                          <label className="text-white font-medium">Connections per download</label>
                          <input type="number" min={1} max={16} value={ipcSettings?.connections ?? 3} onChange={(e) => setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), connections: Math.max(1, parseInt(e.target.value) || 1) }))} className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-white font-medium">Filename template</label>
                          <input type="text" value={ipcSettings?.filenameTemplate || '%(title)s.%(ext)s'} onChange={(e) => setIpcSettings((p) => {
                            const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3, openOnComplete: false, filenameTemplate: '%(title)s.%(ext)s', subtitles: { enabled: false, embed: false, languages: '' }, playlistItems: '', clipboardWatcher: false, pauseNewJobs: false, autoAnalyzeClipboard: false };
                            return { ...base, filenameTemplate: e.target.value };
                          })} placeholder="e.g. {title} [{resolution}] ({id}).{ext}" className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none" />
                          <div className="text-xs text-white/50 mt-1">Placeholders: {`{title} {id} {ext} {uploader} {resolution}`} or yt-dlp style like %(title)s.%(ext)s</div>
                        </div>
                        <div className="md:col-span-2">
                          <div className="text-white font-medium mb-2">Subtitles</div>
                          <div className="flex flex-col md:flex-row gap-3">
                            <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                              <input type="checkbox" checked={!!ipcSettings?.subtitles?.enabled} onChange={(e) => setIpcSettings((p) => {
                                const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3, openOnComplete: false, filenameTemplate: '%(title)s.%(ext)s', subtitles: { enabled: false, embed: false, languages: '' }, playlistItems: '', clipboardWatcher: false, pauseNewJobs: false, autoAnalyzeClipboard: false };
                                return { ...base, subtitles: { ...(base.subtitles || {}), enabled: e.target.checked } };
                              })} />
                              Download subtitles
                            </label>
                            <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                              <input type="checkbox" checked={!!ipcSettings?.subtitles?.embed} onChange={(e) => setIpcSettings((p) => {
                                const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3, openOnComplete: false, filenameTemplate: '%(title)s.%(ext)s', subtitles: { enabled: false, embed: false, languages: '' }, playlistItems: '', clipboardWatcher: false, pauseNewJobs: false, autoAnalyzeClipboard: false };
                                return { ...base, subtitles: { ...(base.subtitles || {}), embed: e.target.checked } };
                              })} />
                              Embed into video (requires FFmpeg)
                            </label>
                            <input type="text" value={ipcSettings?.subtitles?.languages || ''} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3, openOnComplete: false, filenameTemplate: '%(title)s.%(ext)s', subtitles: { enabled: false, embed: false, languages: '' }, playlistItems: '', clipboardWatcher: false, pauseNewJobs: false, autoAnalyzeClipboard: false };
                              return { ...base, subtitles: { ...(base.subtitles || {}), languages: e.target.value } };
                            })} placeholder="e.g. en,hr,sr" className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none" />
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-white font-medium">Playlist items</label>
                          <input type="text" value={ipcSettings?.playlistItems || ''} onChange={(e) => setIpcSettings((p) => {
                            const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3, openOnComplete: false, filenameTemplate: '%(title)s.%(ext)s', subtitles: { enabled: false, embed: false, languages: '' }, playlistItems: '', clipboardWatcher: false, pauseNewJobs: false, autoAnalyzeClipboard: false };
                            return { ...base, playlistItems: e.target.value };
                          })} placeholder="e.g. 1-25,30,40-" className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/25 outline-none" />
                          <div className="text-xs text-white/50 mt-1">Leave empty to download a single video only</div>
                        </div>
                        <div className="md:col-span-2 text-xs text-white/60 -mt-2">Current: max {ipcSettings?.maxConcurrent || 3} • Proxy: {ipcSettings?.proxyUrl ? 'on' : 'off'} • Limit: {Number(ipcSettings?.limitRateKib || 0)} KiB/s • Connections: {ipcSettings?.connections || 3} • Open on complete: {ipcSettings?.openOnComplete ? 'yes' : 'no'}</div>
                        <div className="md:col-span-2">
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.openOnComplete} onChange={(e) => setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), openOnComplete: e.target.checked }))} />
                            Open downloads folder when a download completes
                          </label>
                        </div>
                        <div className="md:col-span-2 flex items-center gap-4">
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.skipExisting} onChange={(e) => setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), skipExisting: e.target.checked }))} />
                            Skip existing files (no overwrite)
                          </label>
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.useDownloadArchive} onChange={(e) => setIpcSettings((p) => ({ ...(p || { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 }), useDownloadArchive: e.target.checked }))} />
                            Use download archive to avoid duplicates
                          </label>
                        </div>
                        <div className="md:col-span-2 flex items-center gap-4">
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.clipboardWatcher} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3, openOnComplete: false, filenameTemplate: '%(title)s.%(ext)s', subtitles: { enabled: false, embed: false, languages: '' }, playlistItems: '', clipboardWatcher: false, pauseNewJobs: false, autoAnalyzeClipboard: false };
                              return { ...base, clipboardWatcher: e.target.checked };
                            })} />
                            Watch clipboard for video URLs
                          </label>
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.pauseNewJobs} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3, openOnComplete: false, filenameTemplate: '%(title)s.%(ext)s', subtitles: { enabled: false, embed: false, languages: '' }, playlistItems: '', clipboardWatcher: false, pauseNewJobs: false, autoAnalyzeClipboard: false };
                              return { ...base, pauseNewJobs: e.target.checked };
                            })} />
                            Pause new jobs (queue only)
                          </label>
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.autoAnalyzeClipboard} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3, openOnComplete: false, filenameTemplate: '%(title)s.%(ext)s', subtitles: { enabled: false, embed: false, languages: '' }, playlistItems: '', clipboardWatcher: false, pauseNewJobs: false, autoAnalyzeClipboard: false };
                              return { ...base, autoAnalyzeClipboard: e.target.checked };
                            })} />
                            Auto analyze new URLs (clipboard/deep link)
                          </label>
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.closeToTray} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 } as any;
                              return { ...base, closeToTray: e.target.checked };
                            })} />
                            Close to tray (hide window instead of quitting)
                          </label>
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.startMinimized} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 } as any;
                              return { ...base, startMinimized: e.target.checked };
                            })} />
                            Start minimized (show in tray)
                          </label>
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.launchOnStartup} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 } as any;
                              return { ...base, launchOnStartup: e.target.checked };
                            })} />
                            Launch at login
                          </label>
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.preventSleepWhileDownloading} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 } as any;
                              return { ...base, preventSleepWhileDownloading: e.target.checked };
                            })} />
                            Keep PC awake during downloads
                          </label>
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.confirmOnQuitIfJobs} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 } as any;
                              return { ...base, confirmOnQuitIfJobs: e.target.checked };
                            })} />
                            Confirm quit if jobs running
                          </label>
                          <label className="inline-flex items-center gap-2 text-white/90 text-sm">
                            <input type="checkbox" checked={!!ipcSettings?.resumeQueuedOnStartup} onChange={(e) => setIpcSettings((p) => {
                              const base = p ?? { maxConcurrent: 3, proxyUrl: '', limitRateKib: 0, connections: 3 } as any;
                              return { ...base, resumeQueuedOnStartup: e.target.checked };
                            })} />
                            Resume queued items on startup
                          </label>
                        </div>
                        <div className="flex items-center gap-2 md:col-span-2">
                          <button onClick={async () => { try { const r = await (window as any).api?.setSettings?.(ipcSettings || {}); if (r?.ok) { setIpcSettings({ maxConcurrent: r.data.maxConcurrent, proxyUrl: r.data.proxyUrl, proxyEnabled: (r.data.proxyEnabled ?? true), limitRateKib: r.data.limitRateKib, connections: r.data.connections, openOnComplete: !!r.data.openOnComplete, filenameTemplate: r.data.filenameTemplate, subtitles: r.data.subtitles, playlistItems: r.data.playlistItems, clipboardWatcher: !!r.data.clipboardWatcher, pauseNewJobs: !!r.data.pauseNewJobs, autoAnalyzeClipboard: !!r.data.autoAnalyzeClipboard, closeToTray: !!r.data.closeToTray, startMinimized: !!r.data.startMinimized, launchOnStartup: !!r.data.launchOnStartup, preventSleepWhileDownloading: !!r.data.preventSleepWhileDownloading, confirmOnQuitIfJobs: !!r.data.confirmOnQuitIfJobs, resumeQueuedOnStartup: !!r.data.resumeQueuedOnStartup, downloadsRootDir: String(r.data.downloadsRootDir || ''), skipExisting: !!r.data.skipExisting, useDownloadArchive: !!r.data.useDownloadArchive }); success('Settings saved'); } else { error('Save failed'); } } catch { error('Save failed'); } }} className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl">Save Desktop Settings</button>
                          <button onClick={async () => { try { const r = await (window as any).api?.openDownloads?.(); if (!r?.ok) throw new Error(); } catch {} }} className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white">Open Downloads Folder</button>
                          <button onClick={async () => { try { const r = await (window as any).api?.updateBinaries?.(); if (r?.ok) { success('yt-dlp updated'); } else { error(r?.error || 'Update failed'); } } catch { error('Update failed'); } }} className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white">Update yt-dlp</button>
                          <button onClick={async () => { try { const r = await (window as any).api?.checkBinaries?.(); if (r?.ok && r?.data) { setBinStatus({ ytdlp: !!r.data.ytdlp, ffmpeg: !!r.data.ffmpeg, ffprobe: !!r.data.ffprobe }); success('Binaries status refreshed'); } else { error('Refresh failed'); } } catch { error('Refresh failed'); } }} className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white">Refresh Status</button>
                          <button onClick={async () => { try { const r = await (window as any).api?.backupCreate?.(); if (r?.ok) { success('Backup created'); await (window as any).api?.openBackups?.(); } else { error(r?.error || 'Backup failed'); } } catch { error('Backup failed'); } }} className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white">Backup</button>
                          <button onClick={async () => { try { const pick = await (window as any).api?.pickDirectory?.({ title: 'Select backup folder' }); if (!pick?.ok || !pick?.path) return; const r = await (window as any).api?.backupRestore?.(pick.path); if (r?.ok) { success('Restore complete'); } else { error(r?.error || 'Restore failed'); } } catch { error('Restore failed'); } }} className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white">Restore</button>
                          <button onClick={async () => { try { await (window as any).api?.openBackups?.(); } catch {} }} className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white">Open Backups Folder</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'diagnostics' && (
              <div className="flex-1 flex flex-col gap-6">
                <div className="p-6 bg-slate-700/30 border border-slate-600/50 rounded-xl">
                  <h3 className="text-slate-200 font-semibold mb-3">Maintenance</h3>
                  <p className="text-white/60 text-sm mb-4">Clean up temporary job files on the server.</p>
                  {!isIpc && (
                    <button onClick={async () => { try { const r = await fetch(`${apiBase}/api/jobs/cleanup-temp`, { method: 'POST', headers: authHeaders() }); const j = await r.json().catch(() => ({})); if (r.ok) success(`Cleanup done${typeof j.removed === 'number' ? `, removed ${j.removed} files` : ''}`); else error('Cleanup failed'); } catch { error('Cleanup failed'); } }} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-xl transition-all duration-300">Cleanup Temp Files</button>
                  )}
                </div>

                <div className="flex-1 p-6 bg-blue-500/10 border border-blue-500/30 rounded-xl flex flex-col min-h-[260px]">
                  <h3 className="text-blue-400 font-semibold mb-3 flex items-center gap-2"><Cpu className="w-5 h-5" />System Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {!isIpc ? (
                      <>
                        <div className="flex justify-between"><span className="text-white/70">Version:</span><span className="text-white">{serverInfo?.version || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-white/70">Platform:</span><span className="text-white">{serverInfo?.platform || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-white/70">Node.js:</span><span className="text-green-400">{serverInfo?.node || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-white/70">yt-dlp:</span><span className="text-green-400">{serverInfo?.ytDlp || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-white/70">FFmpeg:</span><span className="text-green-400">{serverInfo?.ffmpegVersion || (serverInfo?.ffmpeg ? 'configured' : 'system/unknown')}</span></div>
                        <div className="flex justify-between"><span className="text-white/70">Checks:</span><span className="text-white">yt-dlp {serverInfo?.checks?.ytdlpAvailable ? 'OK' : 'missing'} • ffmpeg {serverInfo?.checks?.ffmpegAvailable ? 'OK' : 'missing'}</span></div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between"><span className="text-white/70">Binaries:</span><span className="text-white">yt-dlp {binStatus?.ytdlp ? 'OK' : 'missing'} • ffmpeg {binStatus?.ffmpeg ? 'OK' : 'missing'} • ffprobe {binStatus?.ffprobe ? 'OK' : 'missing'}</span></div>
                        <div className="flex justify-between"><span className="text-white/70">Platform:</span><span className="text-white">Electron (IPC)</span></div>
                        <div className="flex justify-between"><span className="text-white/70">Downloads Folder:</span><button onClick={async () => { try { await (window as any).api?.openDownloads?.(); } catch {} }} className="text-blue-300 underline">Open</button></div>
                        <div className="flex justify-between"><span className="text-white/70">Jobs:</span><span className="text-white">running {ipcMetrics?.running ?? 0} / {ipcMetrics?.maxConcurrent ?? ipcSettings?.maxConcurrent ?? 3}</span></div>
                      </>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => { try { const blob = new Blob([JSON.stringify(serverInfo || {}, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'diagnostics.json'; a.click(); URL.revokeObjectURL(a.href); } catch {} }} className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-sm">Copy Diagnostics</button>
                    {isIpc && (
                      <>
                        <button onClick={async () => { try { await (window as any).api?.jobsCancelAll?.(); success('Canceled all running jobs'); } catch {} }} className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-sm">Cancel All Jobs</button>
                        <button onClick={async () => { try { const r = await (window as any).api?.appInfo?.(); if (r?.ok) { const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'app-info.json'; a.click(); URL.revokeObjectURL(a.href); } } catch {} }} className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-sm">Export App Info</button>
                        <button onClick={async () => { try { await (window as any).api?.openLogsFolder?.(); } catch {} }} className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-sm">Open Logs Folder</button>
                        <button onClick={async () => { try { await (window as any).api?.openLogFile?.(); } catch {} }} className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-sm">Open Log File</button>
                        <button onClick={async () => { try { await (window as any).api?.openSettingsFile?.(); } catch {} }} className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-sm">Open Settings File</button>
                        <button onClick={async () => { try { await (window as any).api?.openHistoryFile?.(); } catch {} }} className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-sm">Open History File</button>
                      </>
                    )}
                    {!isIpc && (
                      <button onClick={async () => { try { const r = await fetch(`${apiBase}/api/logs/tail?lines=200`, { cache: 'no-store', headers: authHeaders() }); if (r.ok) { const j = await r.json(); setLogLines(Array.isArray(j?.lines) ? j.lines : []); } } catch {} }} className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-sm">Refresh Logs</button>
                    )}
                  </div>
                  {Array.isArray(logLines) && (<div className="mt-3 flex-1 overflow-auto bg-slate-900/60 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 font-mono whitespace-pre-wrap">{logLines.length ? logLines.join('\n') : 'No logs'}</div>)}
                  {isIpc && !serverInfo && (
                    <div className="mt-3 text-xs text-white/60">Desktop mode (IPC): backend server features are not available.</div>
                  )}
                </div>
              </div>
            )}

            {/* Advanced (now minimal) */}
            {activeSection === 'advanced' && (
              <div className="space-y-4">
                <ToggleSwitch enabled={settings.enableLogging} onChange={(v) => handleSettingChange('enableLogging', v)} label="Enable Logging" description="Save detailed logs for troubleshooting" />
                <ToggleSwitch enabled={settings.debugMode} onChange={(v) => handleSettingChange('debugMode', v)} label="Debug Mode" description="Show detailed debug information (performance impact)" />
                <ToggleSwitch enabled={settings.hardwareAcceleration} onChange={(v) => handleSettingChange('hardwareAcceleration', v)} label="Hardware Acceleration" description="Use GPU acceleration for video processing" />
                <ToggleSwitch enabled={settings.autoUpdate} onChange={(v) => handleSettingChange('autoUpdate', v)} label="Automatic Updates" description="Automatically check and install updates" />
              </div>
            )}
          </div>

          {/* Save bar */}
          <div className="mt-auto pt-6 border-t border-white/10">
            <div className="flex gap-4">
              <button onClick={async () => {
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
                try {
                  if (settings.serverProxyUrl && !/^https?:\/\//i.test(settings.serverProxyUrl) && !/^socks\d?:\/\//i.test(settings.serverProxyUrl)) { error('Proxy must start with http://, https://, socks5://'); return; }
                  const s = await updateJobsSettings({ maxConcurrent: Number(settings.serverMaxConcurrent || 2), proxyUrl: settings.serverProxyUrl || undefined, limitRateKbps: Number(settings.serverLimitRateKbps || 0) });
                  setSettings((prev) => ({ ...prev, serverMaxConcurrent: Number(s.maxConcurrent ?? prev.serverMaxConcurrent), serverProxyUrl: String(s.proxyUrl || ''), serverLimitRateKbps: Number(s.limitRateKbps || 0) }));
                  setSavedAt(Date.now());
                  success('All settings saved');
                } catch { error('Saved locally, but failed to update server settings'); }
              }} className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl">Save Settings</button>

              <button onClick={() => {
                try {
                  const defaults = {
                    theme: 'dark', language: 'en', autoStart: true, minimizeToTray: true, showNotifications: true,
                    downloadPath: 'C:\\\\Users\\\\User\\\\Downloads', maxConcurrentDownloads: 3, maxRetries: 5, connectionTimeout: 30, autoResume: true, createSubfolders: true,
                    defaultVideoQuality: '1080p', defaultAudioQuality: '320', preferredFormat: 'mp4', enableHDR: true,
                    useProxy: false, proxyAddress: '', proxyPort: '', limitBandwidth: false, maxSpeed: '0',
                    clearHistoryOnExit: false, incognitoMode: false, anonymousDownload: false,
                    enableLogging: true, debugMode: false, hardwareAcceleration: true, autoUpdate: true,
                  } as const;
                  setSettings((prev) => {
                    const next: any = { ...defaults, serverMaxConcurrent: prev.serverMaxConcurrent, serverProxyUrl: prev.serverProxyUrl, serverLimitRateKbps: prev.serverLimitRateKbps };
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                    setClientSettings({ showNotifications: true });
                    return next;
                  });
                  success('Settings reset to defaults');
                } catch { error('Failed to reset settings'); }
              }} className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl transition-all duration-300">Reset to Defaults</button>

              <button onClick={() => { try { const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'settings-export.json'; a.click(); URL.revokeObjectURL(a.href); success('Settings exported'); } catch { error('Failed to export settings'); } }} className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl transition-all duration-300">Export</button>

              <>
                <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    const data = JSON.parse(text || '{}');
                    if (!data || typeof data !== 'object') throw new Error('invalid');
                    setSettings((prev) => ({ ...prev, ...data }));
                    if (typeof (data as any).showNotifications === 'boolean') setClientSettings({ showNotifications: Boolean((data as any).showNotifications) });
                    const srv = { maxConcurrent: Number((data as any).serverMaxConcurrent), proxyUrl: typeof (data as any).serverProxyUrl === 'string' ? (data as any).serverProxyUrl : undefined, limitRateKbps: Number((data as any).serverLimitRateKbps) };
                    const hasSrv = Number.isFinite(srv.maxConcurrent) || typeof srv.proxyUrl === 'string' || Number.isFinite(srv.limitRateKbps as any);
                    if (hasSrv) {
                      if (srv.proxyUrl && !/^https?:\/\//i.test(srv.proxyUrl) && !/^socks\d?:\/\//i.test(srv.proxyUrl)) { error('Imported proxy URL is invalid'); }
                      else {
                        try {
                          const s = await updateJobsSettings({ maxConcurrent: Number.isFinite(srv.maxConcurrent) ? (srv.maxConcurrent as number) : settings.serverMaxConcurrent, proxyUrl: srv.proxyUrl ?? settings.serverProxyUrl, limitRateKbps: Number.isFinite(srv.limitRateKbps as any) ? (srv.limitRateKbps as number) : settings.serverLimitRateKbps });
                          setSettings((prev) => ({ ...prev, serverMaxConcurrent: Number(s.maxConcurrent ?? prev.serverMaxConcurrent), serverProxyUrl: String(s.proxyUrl || ''), serverLimitRateKbps: Number(s.limitRateKbps || 0) }));
                        } catch { error('Imported locally, but failed to apply server settings'); }
                      }
                    }
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, ...data })); } catch {}
                    success('Settings imported');
                  } catch { error('Failed to import settings'); } finally { if (importInputRef.current) importInputRef.current.value = ''; }
                }} />
                <button onClick={() => importInputRef.current?.click()} className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl transition-all duration-300">Import</button>
              </>
            </div>
            {savedAt && (<div className="mt-3 text-xs text-white/60">Saved {new Date(savedAt).toLocaleTimeString()}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};
