/**
 * Mock File System Store for Web (replaces Electron File System API)
 * Web doesn't have native folder picker, so we use localStorage for preferences
 */

// Mock folder handle (web doesn't have real handles)
export interface MockDirHandle {
  name: string;
  kind: 'directory';
}

/**
 * Get default download directory handle (mock for web)
 */
export async function getDefaultDirHandle(): Promise<MockDirHandle | null> {
  try {
    const saved = localStorage.getItem('app:defaultDir');
    if (saved) {
      return JSON.parse(saved);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Set default download directory (mock for web)
 */
export async function setDefaultDirHandle(handle: MockDirHandle): Promise<void> {
  try {
    localStorage.setItem('app:defaultDir', JSON.stringify(handle));
    // Dispatch event for components listening to changes
    window.dispatchEvent(new CustomEvent('default-dir-changed', { detail: handle }));
  } catch (err) {
    console.error('[fsStore] Failed to save default directory:', err);
  }
}

/**
 * Clear default download directory
 */
export async function clearDefaultDirHandle(): Promise<void> {
  try {
    localStorage.removeItem('app:defaultDir');
    window.dispatchEvent(new CustomEvent('default-dir-changed', { detail: null }));
  } catch (err) {
    console.error('[fsStore] Failed to clear default directory:', err);
  }
}

/**
 * Ensure write permission (mock for web - always returns true)
 */
export async function ensureWritePermission(handle: MockDirHandle): Promise<boolean> {
  // Web doesn't have permission system like File System Access API
  // Downloads happen through browser's download manager
  return true;
}

/**
 * Request directory picker (web version using native browser API if available)
 */
export async function requestDirectoryPicker(): Promise<MockDirHandle | null> {
  // Check if browser supports File System Access API
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      return {
        name: dirHandle.name,
        kind: 'directory',
      };
    } catch (err) {
      // User cancelled or browser doesn't support
      // Directory picker cancelled or unsupported
      return null;
    }
  }
  
  // Fallback: prompt user for folder name (no real picker available)
  const folderName = prompt('Enter download folder name (web uses browser downloads):');
  if (folderName) {
    return {
      name: folderName,
      kind: 'directory',
    };
  }
  
  return null;
}
