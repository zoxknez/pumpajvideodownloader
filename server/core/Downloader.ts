import { spawn, type ChildProcess } from 'node:child_process';
import type { Logger } from './logger.js';
import { normalizeYtError } from './errors.js';

/**
 * Download progress event
 */
export interface DownloadProgress {
  percent?: number;
  downloaded?: string;
  total?: string;
  speed?: string;
  eta?: string;
  status: 'downloading' | 'processing' | 'completed' | 'failed';
  message?: string;
}

/**
 * Download result
 */
export interface DownloadResult {
  success: boolean;
  outputFile?: string;
  error?: string;
  errorType?: string;
  exitCode?: number;
  metadata?: Record<string, any>;
}

/**
 * Download options
 */
export interface DownloadOptions {
  url: string;
  outputTemplate: string;
  format?: string;
  limitRate?: string;
  proxy?: string;
  cookies?: string;
  writeInfoJson?: boolean;
  writeSubs?: boolean;
  embedSubs?: boolean;
  noPlaylist?: boolean;
  playlistItems?: string;
  postprocessor?: string[];
  additionalArgs?: string[];
  onProgress?: (progress: DownloadProgress) => void;
  onStderr?: (line: string) => void;
}

/**
 * Downloader - yt-dlp wrapper with progress tracking
 * 
 * Features:
 * - Structured progress parsing from yt-dlp output
 * - Error normalization and classification
 * - Configurable output templates and formats
 * - Proxy and cookie support
 * - Subtitle handling (download/embed)
 * - Postprocessor support (ffmpeg, etc.)
 */
export class Downloader {
  private readonly log: Logger;
  private readonly ytDlpPath: string;

  constructor(log: Logger, ytDlpPath = 'yt-dlp') {
    this.log = log;
    this.ytDlpPath = ytDlpPath;
  }

  /**
   * Execute yt-dlp download with progress tracking
   */
  async download(options: DownloadOptions): Promise<DownloadResult> {
    const args = this.buildArgs(options);
    
    this.log.info('downloader_start', { 
      url: options.url, 
      format: options.format,
      outputTemplate: options.outputTemplate 
    });

    return new Promise((resolve) => {
      const child = spawn(this.ytDlpPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let lastProgress: DownloadProgress | null = null;

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;

        // Parse progress from output
        const progress = this.parseProgress(text);
        if (progress) {
          lastProgress = progress;
          options.onProgress?.(progress);
        }
      });

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        options.onStderr?.(text);
      });

      child.on('error', (err) => {
        this.log.error('downloader_spawn_error', { error: String(err) });
        resolve({
          success: false,
          error: `Failed to spawn yt-dlp: ${err.message}`,
          errorType: 'spawn_error',
        });
      });

      child.on('close', (code) => {
        if (code === 0) {
          this.log.info('downloader_success', { 
            url: options.url,
            outputTemplate: options.outputTemplate 
          });
          
          resolve({
            success: true,
            outputFile: options.outputTemplate,
            exitCode: code ?? undefined,
          });
        } else {
          const normalized = normalizeYtError(stderr || stdout);
          
          this.log.error('downloader_failed', { 
            url: options.url, 
            exitCode: code,
            errorType: normalized.code,
            error: normalized.message 
          });

          resolve({
            success: false,
            error: normalized.message,
            errorType: normalized.code,
            exitCode: code ?? undefined,
          });
        }
      });
    });
  }

  /**
   * Spawn yt-dlp process without waiting (for streaming downloads)
   */
  spawn(options: DownloadOptions): ChildProcess {
    const args = this.buildArgs(options);
    
    this.log.info('downloader_spawn', { 
      url: options.url, 
      format: options.format 
    });

    const child = spawn(this.ytDlpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Optional progress tracking for spawned process
    if (options.onProgress || options.onStderr) {
      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        const progress = this.parseProgress(text);
        if (progress) {
          options.onProgress?.(progress);
        }
      });

      child.stderr?.on('data', (chunk) => {
        options.onStderr?.(chunk.toString());
      });
    }

    return child;
  }

  /**
   * Build yt-dlp command arguments from options
   */
  private buildArgs(options: DownloadOptions): string[] {
    const args: string[] = [
      '--no-warnings',
      '--no-colors',
      '--newline',
      '--progress',
      '-o', options.outputTemplate,
    ];

    if (options.format) {
      args.push('-f', options.format);
    }

    if (options.limitRate) {
      args.push('-r', options.limitRate);
    }

    if (options.proxy) {
      args.push('--proxy', options.proxy);
    }

    if (options.cookies) {
      args.push('--cookies', options.cookies);
    }

    if (options.writeInfoJson) {
      args.push('--write-info-json');
    }

    if (options.writeSubs) {
      args.push('--write-subs', '--write-auto-subs', '--sub-langs', 'all');
    }

    if (options.embedSubs) {
      args.push('--embed-subs');
    }

    if (options.noPlaylist !== undefined) {
      args.push(options.noPlaylist ? '--no-playlist' : '--yes-playlist');
    }

    if (options.playlistItems) {
      args.push('--playlist-items', options.playlistItems);
    }

    if (options.postprocessor) {
      for (const pp of options.postprocessor) {
        args.push('--postprocessor-args', pp);
      }
    }

    if (options.additionalArgs) {
      args.push(...options.additionalArgs);
    }

    args.push(options.url);

    return args;
  }

  /**
   * Parse progress information from yt-dlp output
   */
  private parseProgress(text: string): DownloadProgress | null {
    // Example: [download]  45.2% of 123.45MiB at 1.23MiB/s ETA 00:42
    const downloadMatch = text.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/);
    if (downloadMatch) {
      return {
        status: 'downloading',
        percent: parseFloat(downloadMatch[1]),
        total: downloadMatch[2],
        speed: downloadMatch[3],
        eta: downloadMatch[4],
      };
    }

    // Example: [download] 100% of 123.45MiB
    const completeMatch = text.match(/\[download\]\s+100%/);
    if (completeMatch) {
      return {
        status: 'completed',
        percent: 100,
        message: 'Download complete',
      };
    }

    // Example: [ffmpeg] Merging formats into "output.mp4"
    const ffmpegMatch = text.match(/\[ffmpeg\]\s+(.+)/);
    if (ffmpegMatch) {
      return {
        status: 'processing',
        message: ffmpegMatch[1],
      };
    }

    return null;
  }

  /**
   * Get yt-dlp version
   */
  async getVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ytDlpPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      child.stdout?.on('data', (chunk) => {
        output += chunk.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error('Failed to get yt-dlp version'));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Check if yt-dlp is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.getVersion();
      return true;
    } catch {
      return false;
    }
  }
}
