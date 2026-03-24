import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  projectPath: string;
  projectName: string;
  relativePath: string;
  timestamp: string;
}

type FileChangeCallback = (event: FileChangeEvent) => void;

class FileWatcherService {
  private watchers: Map<string, FSWatcher> = new Map();
  private callbacks: Set<FileChangeCallback> = new Set();
  private eventBuffer: FileChangeEvent[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // 무시할 패턴들
  private ignoredPatterns = [
    '**/node_modules/**',
    '**/.git/**',
    '**/.next/**',
    '**/.vercel/**',
    '**/dist/**',
    '**/build/**',
    '**/*.log',
    '**/.DS_Store',
    '**/Thumbs.db',
  ];

  subscribe(callback: FileChangeCallback) {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  private notifyCallbacks(event: FileChangeEvent) {
    this.eventBuffer.push(event);

    // 디바운스: 100ms 동안 모은 이벤트를 한번에 전송
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const events = [...this.eventBuffer];
      this.eventBuffer = [];

      for (const evt of events) {
        this.callbacks.forEach(cb => cb(evt));
      }
    }, 100);
  }

  watchProject(projectPath: string) {
    if (this.watchers.has(projectPath)) {
      return; // 이미 감시 중
    }

    const projectName = path.basename(projectPath);

    const watcher = chokidar.watch(projectPath, {
      ignored: this.ignoredPatterns,
      persistent: true,
      ignoreInitial: true,
      depth: 5, // 최대 깊이 제한
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    watcher
      .on('add', (filePath) => {
        this.notifyCallbacks({
          type: 'add',
          path: filePath,
          projectPath,
          projectName,
          relativePath: path.relative(projectPath, filePath),
          timestamp: new Date().toISOString(),
        });
      })
      .on('change', (filePath) => {
        this.notifyCallbacks({
          type: 'change',
          path: filePath,
          projectPath,
          projectName,
          relativePath: path.relative(projectPath, filePath),
          timestamp: new Date().toISOString(),
        });
      })
      .on('unlink', (filePath) => {
        this.notifyCallbacks({
          type: 'unlink',
          path: filePath,
          projectPath,
          projectName,
          relativePath: path.relative(projectPath, filePath),
          timestamp: new Date().toISOString(),
        });
      })
      .on('error', (error) => {
        console.error(`Watcher error for ${projectPath}:`, error);
      });

    this.watchers.set(projectPath, watcher);
    console.log(`Started watching: ${projectPath}`);
  }

  unwatchProject(projectPath: string) {
    const watcher = this.watchers.get(projectPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectPath);
      console.log(`Stopped watching: ${projectPath}`);
    }
  }

  unwatchAll() {
    this.watchers.forEach((watcher, projectPath) => {
      watcher.close();
      console.log(`Stopped watching: ${projectPath}`);
    });
    this.watchers.clear();
  }

  getWatchedProjects(): string[] {
    return Array.from(this.watchers.keys());
  }

  isWatching(projectPath: string): boolean {
    return this.watchers.has(projectPath);
  }
}

// 싱글톤 인스턴스
export const fileWatcher = new FileWatcherService();
