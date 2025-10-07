import type { Response } from 'express';
import type { Logger } from './logger.js';

/**
 * SSE Hub - Centralized Server-Sent Events management
 * 
 * Features:
 * - Connection lifecycle management (register/unregister)
 * - Ring buffer for late subscriber event replay (last 20 events)
 * - Automatic cleanup on connection close
 * - Broadcast to all subscribers of a channel (job ID)
 */

interface SseEvent {
  id: string;
  data: any;
  event?: string;
}

export class SseHub {
  private listeners = new Map<string, Set<Response>>();
  private buffers = new Map<string, SseEvent[]>();
  private readonly bufferSize: number;
  private readonly log: Logger;

  constructor(log: Logger, bufferSize = 20) {
    this.log = log;
    this.bufferSize = bufferSize;
  }

  /**
   * Register SSE connection for a channel (job ID)
   * Automatically replays buffered events for late subscribers
   */
  register(id: string, res: Response, lastEventId?: string): void {
    // Get or create listener set
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(res);

    // Auto-cleanup on connection close
    res.on('close', () => {
      this.unregister(id, res);
    });

    // Replay buffered events for late subscribers
    const buffer = this.buffers.get(id);
    if (buffer && buffer.length > 0) {
      let startIdx = 0;
      if (lastEventId) {
        const idx = buffer.findIndex((e) => e.id === lastEventId);
        if (idx >= 0) startIdx = idx + 1;
      }
      
      for (let i = startIdx; i < buffer.length; i++) {
        const evt = buffer[i];
        this.sendToClient(res, evt);
      }
    }

    this.log.debug('sse_registered', { id, totalConnections: set.size });
  }

  /**
   * Unregister SSE connection from a channel
   */
  unregister(id: string, res: Response): void {
    const set = this.listeners.get(id);
    if (!set) return;

    set.delete(res);
    if (set.size === 0) {
      this.listeners.delete(id);
      this.log.debug('sse_channel_closed', { id });
    }
  }

  /**
   * Broadcast event to all subscribers of a channel
   * Event is buffered for late subscribers
   */
  push(id: string, data: any, event?: string): void {
    const evt: SseEvent = { id, data, event };

    // Buffer event for late subscribers
    let buffer = this.buffers.get(id);
    if (!buffer) {
      buffer = [];
      this.buffers.set(id, buffer);
    }
    buffer.push(evt);
    if (buffer.length > this.bufferSize) {
      buffer.shift(); // Keep only last N events
    }

    // Broadcast to all connected clients
    const set = this.listeners.get(id);
    if (!set || set.size === 0) return;

    for (const res of Array.from(set)) {
      this.sendToClient(res, evt);
    }

    this.log.debug('sse_broadcast', { id, event, subscribers: set.size });
  }

  /**
   * End SSE channel - send final event and close all connections
   */
  end(id: string, status: 'completed' | 'failed' | 'canceled' = 'completed'): void {
    // Send final event
    this.push(id, { id, status }, 'end');

    // Close all connections
    const set = this.listeners.get(id);
    if (set) {
      for (const res of Array.from(set)) {
        try {
          res.end();
        } catch (err) {
          this.log.warn('sse_end_error', { id, error: String(err) });
        }
      }
      this.listeners.delete(id);
    }

    // Clean up buffer
    this.buffers.delete(id);
    this.log.debug('sse_ended', { id, status });
  }

  /**
   * Get active connection count for a channel
   */
  getConnectionCount(id: string): number {
    return this.listeners.get(id)?.size ?? 0;
  }

  /**
   * Get total active connection count across all channels
   */
  getTotalConnections(): number {
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Get all active channel IDs
   */
  getActiveChannels(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Clean up resources for a channel (connections + buffer)
   */
  cleanup(id: string): void {
    this.listeners.delete(id);
    this.buffers.delete(id);
    this.log.debug('sse_cleanup', { id });
  }

  /**
   * Send SSE-formatted event to a specific client
   */
  private sendToClient(res: Response, evt: SseEvent): void {
    try {
      if (evt.id) res.write(`id: ${evt.id}\n`);
      if (evt.event) res.write(`event: ${evt.event}\n`);
      res.write(`data: ${JSON.stringify(evt.data)}\n\n`);
    } catch (err) {
      this.log.warn('sse_send_error', { error: String(err) });
    }
  }

  /**
   * Get debug stats for monitoring
   */
  getStats() {
    return {
      activeChannels: this.listeners.size,
      totalConnections: this.getTotalConnections(),
      bufferedChannels: this.buffers.size,
      channels: Array.from(this.listeners.keys()).map((id) => ({
        id,
        connections: this.listeners.get(id)?.size ?? 0,
        bufferedEvents: this.buffers.get(id)?.length ?? 0,
      })),
    };
  }
}
