// Downloader helper functions (adapted for web - no IPC)
export const ipcAvailable = false; // Web doesn't have IPC

export async function startIpcAdvanced(opts: any): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'IPC not available in web' };
}

export function onProgressIpc(callback: (data: any) => void): () => void {
  return () => {};
}

export function onDoneIpc(callback: (data: any) => void): () => void {
  return () => {};
}

export function revealPath(path: string) {
  // No-op in web environment
}

export function openPath(path: string) {
  // No-op in web environment
}
