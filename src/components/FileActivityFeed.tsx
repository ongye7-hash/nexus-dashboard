'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  FilePlus,
  FileX,
  FileEdit,
  Radio,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useFileWatcher, FileChangeEvent } from '@/hooks/useFileWatcher';
import { useMemo } from 'react';

interface FileActivityFeedProps {
  projectPaths?: string[];
  enabled?: boolean;
  compact?: boolean;
}

export default function FileActivityFeed({
  projectPaths = [],
  enabled = true,
  compact = false,
}: FileActivityFeedProps) {
  const { events, isConnected, clearEvents } = useFileWatcher({
    projectPaths,
    enabled,
    maxEvents: 30,
  });

  const getIcon = (type: FileChangeEvent['type']) => {
    switch (type) {
      case 'add':
        return <FilePlus className="w-3.5 h-3.5 text-emerald-400" />;
      case 'change':
        return <FileEdit className="w-3.5 h-3.5 text-blue-400" />;
      case 'unlink':
        return <FileX className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const getTypeLabel = (type: FileChangeEvent['type']) => {
    switch (type) {
      case 'add':
        return '생성';
      case 'change':
        return '수정';
      case 'unlink':
        return '삭제';
      case 'addDir':
        return '폴더 생성';
      case 'unlinkDir':
        return '폴더 삭제';
      default:
        return '변경';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 5) return '방금';
    if (diffSecs < 60) return `${diffSecs}초 전`;
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}분 전`;
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  // 확장자별 색상
  const getExtColor = (filepath: string) => {
    const ext = filepath.split('.').pop()?.toLowerCase();
    const colors: Record<string, string> = {
      ts: 'text-blue-400',
      tsx: 'text-blue-400',
      js: 'text-yellow-400',
      jsx: 'text-yellow-400',
      json: 'text-amber-400',
      css: 'text-purple-400',
      scss: 'text-pink-400',
      html: 'text-orange-400',
      md: 'text-zinc-400',
      py: 'text-green-400',
    };
    return colors[ext || ''] || 'text-zinc-400';
  };

  // 그룹화된 이벤트 (같은 프로젝트끼리)
  const groupedEvents = useMemo(() => {
    const groups: Record<string, FileChangeEvent[]> = {};
    for (const event of events) {
      if (event.projectName) {
        if (!groups[event.projectName]) {
          groups[event.projectName] = [];
        }
        groups[event.projectName].push(event);
      }
    }
    return groups;
  }, [events]);

  if (!enabled) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {isConnected ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>Live</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <WifiOff className="w-3 h-3" />
            <span>Offline</span>
          </div>
        )}
        {events.length > 0 && (
          <span className="text-xs text-zinc-500">
            {events.length}개 변경
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white">실시간 파일 변경</h3>
          {isConnected ? (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400">Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full">
              <WifiOff className="w-3 h-3 text-zinc-500" />
              <span className="text-xs text-zinc-500">연결 끊김</span>
            </div>
          )}
        </div>
        {events.length > 0 && (
          <button
            onClick={clearEvents}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            지우기
          </button>
        )}
      </div>

      {/* 이벤트 목록 */}
      {events.length === 0 ? (
        <div className="text-center py-8 text-zinc-500 text-sm">
          <Wifi className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>파일 변경 대기중...</p>
          <p className="text-xs text-zinc-600 mt-1">
            {projectPaths.length > 0
              ? `${projectPaths.length}개 프로젝트 감시중`
              : '감시중인 프로젝트 없음'}
          </p>
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {events.slice(0, 20).map((event, index) => (
              <motion.div
                key={`${event.timestamp}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-zinc-800/50 group"
              >
                {getIcon(event.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium truncate ${getExtColor(event.relativePath || '')}`}>
                      {event.relativePath}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <span>{event.projectName}</span>
                    <span>·</span>
                    <span>{getTypeLabel(event.type)}</span>
                  </div>
                </div>
                <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">
                  {formatTime(event.timestamp)}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
