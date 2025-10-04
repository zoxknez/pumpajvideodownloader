declare global {
  interface Window {
    api?: {
  start: (params: { id: string; url: string; outDir?: string; format?: string; mode?: 'video'|'audio'; audioFormat?: 'm4a'|'mp3'|'opus'|'aac'; title?: string }) => Promise<{ ok: boolean; error?: string }>;
      cancel: (id: string) => Promise<{ ok: boolean }>;
      onProgress: (cb: (p: any) => void) => () => void;
      onDone: (cb: (p: any) => void) => () => void;
  onBrowserDownloadStart?: (cb: (payload: any) => void) => () => void;
  onBrowserDownloadProgress?: (cb: (payload: any) => void) => () => void;
  onBrowserDownloadDone?: (cb: (payload: any) => void) => () => void;
  getSettings?: () => Promise<{ ok: boolean; data?: any }>;
  setSettings?: (partial: any) => Promise<{ ok: boolean; data?: any }>;
  openDownloads?: () => Promise<{ ok: boolean }>;
  checkBinaries?: () => Promise<{ ok: boolean; data?: any }>;
  updates?: {
    getStatus?: () => Promise<any>;
    checkApp?: () => Promise<any>;
    openLatestRelease?: () => Promise<any>;
    updateYtDlp?: () => Promise<any>;
  };
  historyList?: () => Promise<{ ok: boolean; items?: any[] }>;
  historyClear?: () => Promise<{ ok: boolean }>;
  historyRemove?: (id: string) => Promise<{ ok: boolean }>;
  openPath?: (p: string) => Promise<{ ok: boolean; error?: string }>;
  revealPath?: (p: string) => Promise<{ ok: boolean; error?: string }>;
  onClipboardUrl?: (cb: (p: { url: string }) => void) => () => void;
    }
  }
}

export const ipcAvailable = typeof window !== 'undefined' && !!window.api;
export const startIpc = (id: string, url: string, outDir?: string, format?: string) => window.api!.start({ id, url, outDir, format });
export const startIpcAdvanced = (params: { id: string; url: string; outDir?: string; format?: string; mode?: 'video'|'audio'; audioFormat?: 'm4a'|'mp3'|'opus'|'aac'; title?: string }) => window.api!.start(params);
export const cancelIpc = (id: string) => window.api!.cancel(id);
export const onProgressIpc = (cb: (p: any) => void) => window.api!.onProgress(cb);
export const onDoneIpc = (cb: (p: any) => void) => window.api!.onDone(cb);
export const onBrowserDownloadStart = (cb: (payload: any) => void) => window.api?.onBrowserDownloadStart?.(cb) || (() => {});
export const onBrowserDownloadProgress = (cb: (payload: any) => void) => window.api?.onBrowserDownloadProgress?.(cb) || (() => {});
export const onBrowserDownloadDone = (cb: (payload: any) => void) => window.api?.onBrowserDownloadDone?.(cb) || (() => {});
export const desktopHistoryList = async () => (await window.api?.historyList?.()) || { ok: false } as any;
export const desktopHistoryClear = async () => (await window.api?.historyClear?.()) || { ok: false } as any;
export const desktopHistoryRemove = async (id: string) => (await window.api?.historyRemove?.(id)) || { ok: false } as any;
export const openPath = async (p: string) => (await window.api?.openPath?.(p)) || { ok: false } as any;
export const revealPath = async (p: string) => (await window.api?.revealPath?.(p)) || { ok: false } as any;
export const updateYtDlp = async () => (await window.api?.updates?.updateYtDlp?.()) || { ok: false } as any;
export const onClipboardUrl = (cb: (p: { url: string }) => void) => window.api?.onClipboardUrl?.(cb) || (() => {});
