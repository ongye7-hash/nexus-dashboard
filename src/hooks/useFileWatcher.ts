'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'connected';
  path?: string;
  projectPath?: string;
  projectName?: string;
  relativePath?: string;
  timestamp: string;
}

interface UseFileWatcherOptions {
  projectPaths?: string[];
  onFileChange?: (event: FileChangeEvent) => void;
  enabled?: boolean;
  maxEvents?: number;
}

export function useFileWatcher({
  projectPaths = [],
  onFileChange,
  enabled = true,
  maxEvents = 50,
}: UseFileWatcherOptions = {}) {
  const [events, setEvents] = useState<FileChangeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSE 연결
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const eventSource = new EventSource('/api/watch');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as FileChangeEvent;

          if (data.type === 'connected') {
            setIsConnected(true);
            return;
          }

          // 이벤트 추가 (최대 개수 제한)
          setEvents((prev) => {
            const newEvents = [data, ...prev].slice(0, maxEvents);
            return newEvents;
          });

          // 콜백 호출
          onFileChange?.(data);
        } catch (error) {
          console.error('Failed to parse file change event:', error);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        setError('Connection lost');
        eventSource.close();

        // 5초 후 재연결 시도
        reconnectTimeoutRef.current = setTimeout(() => {
          if (enabled) {
            connect();
          }
        }, 5000);
      };
    } catch (err) {
      setError(String(err));
      setIsConnected(false);
    }
  }, [enabled, maxEvents, onFileChange]);

  // 프로젝트 감시 시작
  const watchProjects = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;

    try {
      await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'watch', projectPaths: paths }),
      });
    } catch (err) {
      console.error('Failed to start watching:', err);
    }
  }, []);

  // 프로젝트 감시 중지
  const unwatchProject = useCallback(async (path: string) => {
    try {
      await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unwatch', projectPath: path }),
      });
    } catch (err) {
      console.error('Failed to stop watching:', err);
    }
  }, []);

  // 모든 감시 중지
  const unwatchAll = useCallback(async () => {
    try {
      await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unwatchAll' }),
      });
    } catch (err) {
      console.error('Failed to stop all watching:', err);
    }
  }, []);

  // 이벤트 초기화
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // 연결 관리
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [enabled, connect]);

  // 프로젝트 감시 시작
  useEffect(() => {
    if (enabled && isConnected && projectPaths.length > 0) {
      watchProjects(projectPaths);
    }
  }, [enabled, isConnected, projectPaths, watchProjects]);

  return {
    events,
    isConnected,
    error,
    watchProjects,
    unwatchProject,
    unwatchAll,
    clearEvents,
  };
}
