import React, { useState } from 'react';
import { DownloadCard } from './DownloadCard';
import { Settings, Zap, Shield, Cpu, HardDrive, Wifi, Crown, Rocket, FolderOpen, Clock } from 'lucide-react';
 

export interface OptionsSectionProps {
  systemData?: {
    connectionStatus: 'online' | 'offline' | 'slow';
    cpuStatus: 'ready' | 'busy' | 'overloaded';
    availableSpace: string;
    downloadSpeed?: string;
    queueLength?: number;
  };
  analysisData?: {
    hasSubtitles: boolean;
    isPlaylist: boolean;
    estimatedSize: string;
    supportedFormats: string[];
    canAutoConvert: boolean;
    // optional thumbnails integrated here for consolidated layout
    videoTitle?: string;
  };
  onOptionsChange?: (options: any) => void;
}

export const OptionsSection: React.FC<OptionsSectionProps> = ({ systemData, analysisData, onOptionsChange }) => {
  const [options, setOptions] = useState({
    fastDownload: true,
    autoSubtitles: analysisData?.hasSubtitles || false,
    keepOriginalName: true,
    downloadPlaylist: analysisData?.isPlaylist || false,
    highPriority: true,
    autoConvert: analysisData?.canAutoConvert || false,
  });
  

  const connectionStatus = systemData?.connectionStatus;
  const cpuStatus = systemData?.cpuStatus;

  if (analysisData || systemData) {
    const toggleOption = (key: keyof typeof options) => {
      const newOptions = { ...options, [key]: !options[key] };
      setOptions(newOptions);
      onOptionsChange?.(newOptions);
    };

    const optionsList = [
      { key: 'fastDownload', label: 'Turbo Download Mode', icon: Zap, color: 'text-yellow-400' },
      { key: 'highPriority', label: 'High Priority Queue', icon: Cpu, color: 'text-red-400' },
      ...(analysisData?.hasSubtitles ? [{ key: 'autoSubtitles', label: 'Auto Extract Subtitles', icon: Clock, color: 'text-blue-400' }] : []),
      { key: 'keepOriginalName', label: 'Keep Original Names', icon: FolderOpen, color: 'text-green-400' },
      ...(analysisData?.isPlaylist ? [{ key: 'downloadPlaylist', label: 'Batch Playlist Mode', icon: Settings, color: 'text-purple-400' }] : []),
      ...(analysisData?.canAutoConvert ? [{ key: 'autoConvert', label: 'Smart Auto-Convert', icon: Shield, color: 'text-cyan-400' }] : []),
    ];

    const getStatusColor = (status: string, type: 'connection' | 'cpu') => {
      if (type === 'connection') {
        return status === 'online'
          ? 'bg-white/5 border-white/10 text-green-300'
          : status === 'slow'
          ? 'bg-white/5 border-white/10 text-yellow-300'
          : 'bg-white/5 border-white/10 text-red-300';
      }
      return status === 'ready'
        ? 'bg-white/5 border-white/10 text-blue-300'
        : status === 'busy'
        ? 'bg-white/5 border-white/10 text-yellow-300'
        : 'bg-white/5 border-white/10 text-red-300';
    };

    return (
  <DownloadCard title="Download Settings" icon={Settings} variant="flat">
        <div className="space-y-4">
          {/* Thumbnails (integrated) */}
          {/* Real-time System Status */}
          <div className="grid grid-cols-3 gap-2">
            <div className={`text-center p-2 rounded-lg border ${getStatusColor(connectionStatus || 'online', 'connection')}`}>
              <Wifi className="w-4 h-4 mx-auto mb-1" />
              <div className="text-xs font-medium capitalize">{connectionStatus || 'online'}</div>
              {systemData?.downloadSpeed && <div className="text-xs opacity-70">{systemData.downloadSpeed}</div>}
            </div>
            <div className={`text-center p-2 rounded-lg border ${getStatusColor(cpuStatus || 'ready', 'cpu')}`}>
              <Cpu className="w-4 h-4 mx-auto mb-1" />
              <div className="text-xs font-medium capitalize">{cpuStatus || 'ready'}</div>
              {systemData?.queueLength && systemData.queueLength > 0 && <div className="text-xs opacity-70">Queue: {systemData.queueLength}</div>}
            </div>
            <div className="text-center p-2 rounded-lg bg-white/5 border border-white/10">
              <HardDrive className="w-4 h-4 text-purple-300 mx-auto mb-1" />
              <div className="text-xs font-medium text-purple-300">{systemData?.availableSpace || '2.1TB'}</div>
            </div>
          </div>

          {/* Analysis-based Info */}
          {analysisData && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="text-xs text-slate-400 mb-2">Analysis Results:</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-slate-300">
                  Size: <span className="text-blue-400">{analysisData.estimatedSize}</span>
                </div>
                <div className="text-slate-300">
                  Formats: <span className="text-green-400">{analysisData.supportedFormats?.length || 0}</span>
                </div>
                {analysisData.hasSubtitles && (
                  <div className="text-slate-300"><span className="text-yellow-400">Subtitles Available</span></div>
                )}
                {analysisData.isPlaylist && (
                  <div className="text-slate-300"><span className="text-purple-400">Playlist Detected</span></div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {optionsList.map(({ key, label, icon: Icon, color }) => (
              <div key={key as string} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 group">
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${color} group-hover:scale-110 transition-transform duration-300`} />
                  <span className="text-sm text-slate-200 group-hover:text-white transition-colors duration-300">{label}</span>
                </div>

                <button
                  onClick={() => toggleOption(key as keyof typeof options)}
                  className={`relative w-11 h-6 rounded-full transition-all duration-300 shadow-inner ${options[key as keyof typeof options] ? 'bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg shadow-blue-500/25' : 'bg-slate-600 hover:bg-slate-500'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-lg transition-all duration-300 ease-out ${options[key as keyof typeof options] ? 'translate-x-5 shadow-lg shadow-blue-500/25' : 'translate-x-0.5'}`}>
                    {options[key as keyof typeof options] && <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 opacity-20 animate-pulse" />}
                  </div>
                </button>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-white/10">
            <div className="text-xs text-slate-400 mb-2 flex items-center gap-2">
              <FolderOpen className="w-3 h-3" />
              Download Destination
            </div>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-300 hover:border-white/20 transition-colors duration-200">
                ~/Downloads/PremiumMedia
              </div>
              <button className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all duration-200 hover:shadow-lg transform hover:scale-105">
                <FolderOpen className="w-4 h-4 text-slate-300" />
              </button>
            </div>
          </div>

          {/* Dynamic Progress indicator */}
          <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">System Status</span>
              <span
                className={`text-xs font-medium ${
                  (connectionStatus || 'online') === 'online' && (cpuStatus || 'ready') === 'ready'
                    ? 'text-green-400'
                    : (connectionStatus || 'online') === 'slow' || (cpuStatus || 'ready') === 'busy'
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }`}
              >
                {(connectionStatus || 'online') === 'online' && (cpuStatus || 'ready') === 'ready' ? 'Optimal' : (connectionStatus || 'online') === 'slow' || (cpuStatus || 'ready') === 'busy' ? 'Busy' : 'Issues'}
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full shadow-lg transition-all duration-500 ${
                  (connectionStatus || 'online') === 'online' && (cpuStatus || 'ready') === 'ready'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 w-full shadow-green-500/25'
                    : (connectionStatus || 'online') === 'slow' || (cpuStatus || 'ready') === 'busy'
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 w-3/4 shadow-yellow-500/25'
                    : 'bg-gradient-to-r from-red-500 to-pink-500 w-1/2 shadow-red-500/25'
                }`}
              ></div>
            </div>
          </div>
        </div>
      </DownloadCard>
    );
  }

  // Phase 1 default (no analysis/system data yet) — simplified to 2 tiles + 3 features + CTA
  return (
  <DownloadCard title="Download Settings" icon={Settings} variant="flat">
      <div className="space-y-4">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-xl bg-white/5 p-6 border border-white/10">
          <div className="absolute top-2 right-2">
            <Crown className="w-5 h-5 text-yellow-400 animate-pulse" />
          </div>
          <div className="text-center">
            <Rocket className="w-8 h-8 text-cyan-300 mx-auto mb-2 attention-icon icon-glow glow-cyan" />
            <h3 className="text-lg font-bold text-white mb-2">Pro Features</h3>
            <p className="text-sm text-cyan-200">Advanced options for power users</p>
          </div>
        </div>

        {/* Two top tiles */}
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
            <Wifi className="w-4 h-4 text-emerald-300 mx-auto mb-1" />
            <div className="text-[11px] text-emerald-300 font-medium">Online</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5 border border-white/10">
            <Cpu className="w-4 h-4 text-blue-300 mx-auto mb-1" />
            <div className="text-[11px] text-blue-300 font-medium">Ready</div>
          </div>
        </div>

        {/* Feature List (3) */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"/><span>Secure by default (Helmet, CORS, limits)</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500"/><span>Live progress via SSE</span></div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"/><span>Smart defaults for speed</span></div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-slate-400 mb-2">Options will adapt after analysis</p>
          <div className="text-sm font-medium text-cyan-300">Paste URL above to start</div>
        </div>
      </div>
    </DownloadCard>
  );
};