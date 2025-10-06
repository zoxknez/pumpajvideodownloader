/**
 * Enhanced SSE (Server-Sent Events) client with visibility detection
 * Auto-closes connections when tab is hidden to save resources
 */

export interface SSEProgressData {
  progress?: number;
  stage?: string;
  status?: string;
}

export interface SSESubscription {
  /** Close the SSE connection */
  close: () => void;
  /** Check if connection is still open */
  isOpen: () => boolean;
}

interface SSEOptions {
  /** Auto-close when tab becomes hidden (default: true) */
  autoCloseOnHidden?: boolean;
  /** Auto-reconnect when tab becomes visible again (default: false) */
  autoReconnect?: boolean;
}

/**
 * Subscribe to job progress with automatic cleanup on visibility change
 * 
 * @example
 * const subscription = subscribeJobProgressEnhanced(
 *   jobId,
 *   (data) => setProgress(data.progress),
 *   (status) => console.log('Complete:', status)
 * );
 * 
 * // Later: cleanup
 * subscription.close();
 */
export function subscribeJobProgressEnhanced(
  apiBase: string,
  jobId: string,
  onProgress: (data: SSEProgressData) => void,
  onComplete: (status: string) => void,
  options: SSEOptions = {}
): SSESubscription {
  const { autoCloseOnHidden = true, autoReconnect = false } = options;

  let eventSource: EventSource | null = null;
  let isClosed = false;
  let lastStatus: string | null = null;

  function connect() {
    if (isClosed || eventSource) return;

    eventSource = new EventSource(`${apiBase}/api/progress/${jobId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Emit progress updates
        if (data.progress !== undefined || data.stage) {
          onProgress({ progress: data.progress, stage: data.stage, status: data.status });
        }
        
        // Handle completion
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          lastStatus = data.status;
          onComplete(data.status);
          cleanup();
        }
      } catch (err) {
        // SSE parse error (silently handled)
      }
    };

    eventSource.onerror = (err) => {
      // SSE connection error (handled by onComplete)
      if (!isClosed) {
        onComplete('failed');
        cleanup();
      }
    };

    // Handle 'end' event to prevent memory leaks
    eventSource.addEventListener('end', () => {
      cleanup();
    });
  }

  function cleanup() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  function handleVisibilityChange() {
    if (!autoCloseOnHidden) return;

    if (document.hidden) {
      // Tab hidden: close connection to save resources
      cleanup();
    } else if (autoReconnect && !eventSource && !isClosed && lastStatus !== 'completed') {
      // Tab visible again: reconnect if not completed
      connect();
    }
  }

  // Start connection
  connect();

  // Listen for visibility changes
  if (autoCloseOnHidden && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return {
    close: () => {
      isClosed = true;
      cleanup();
      if (autoCloseOnHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    },
    isOpen: () => eventSource !== null && eventSource.readyState === EventSource.OPEN,
  };
}

/**
 * Multiple SSE connections manager
 * Useful for monitoring multiple jobs simultaneously
 */
export class SSEConnectionManager {
  private connections = new Map<string, SSESubscription>();

  /**
   * Subscribe to a job's progress
   */
  subscribe(
    apiBase: string,
    jobId: string,
    onProgress: (data: SSEProgressData) => void,
    onComplete: (status: string) => void
  ): void {
    // Close existing connection if any
    this.unsubscribe(jobId);

    // Create new connection
    const subscription = subscribeJobProgressEnhanced(
      apiBase,
      jobId,
      onProgress,
      (status) => {
        onComplete(status);
        // Auto-remove completed jobs
        this.unsubscribe(jobId);
      },
      { autoCloseOnHidden: true, autoReconnect: false }
    );

    this.connections.set(jobId, subscription);
  }

  /**
   * Unsubscribe from a specific job
   */
  unsubscribe(jobId: string): void {
    const subscription = this.connections.get(jobId);
    if (subscription) {
      subscription.close();
      this.connections.delete(jobId);
    }
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    for (const subscription of this.connections.values()) {
      subscription.close();
    }
    this.connections.clear();
  }

  /**
   * Get count of active connections
   */
  getActiveCount(): number {
    return this.connections.size;
  }
}
