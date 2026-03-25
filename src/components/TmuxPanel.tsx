'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Terminal,
  Plus,
  RefreshCw,
  Monitor,
  Plug,
  Unplug,
} from 'lucide-react';

interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
}

interface TmuxPanelProps {
  serverId: string;
  serverName: string;
  onAttach: (sessionName: string) => void;
  onNewSession: (sessionName: string) => void;
}

export function TmuxPanel({ serverId, serverName, onAttach, onNewSession }: TmuxPanelProps) {
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vps/status?id=${encodeURIComponent(serverId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '세션 목록을 불러올 수 없습니다');
        return;
      }
      setSessions(data.tmuxSessions || []);
    } catch (error) {
      console.warn('Tmux 세션 로드 실패:', error);
      setError('서버에 연결할 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleCreateSession = () => {
    const name = newSessionName.trim();
    if (!name) return;
    onNewSession(name);
    setNewSessionName('');
    setShowNewSession(false);
  };

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-zinc-300">
            {serverName} - tmux 세션
          </span>
        </div>
        <button
          onClick={fetchSessions}
          disabled={loading}
          className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 에러 */}
      {error && (
        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* 세션 목록 */}
      {sessions.length > 0 ? (
        <div className="space-y-1.5">
          {sessions.map((session) => (
            <div
              key={session.name}
              className="flex items-center gap-2 p-2 bg-[#0f0f10] rounded-lg"
            >
              <Terminal className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 truncate">{session.name}</p>
                <p className="text-xs text-zinc-500">
                  {session.windows}개 윈도우 &middot;{' '}
                  <span className={session.attached ? 'text-green-400' : 'text-zinc-500'}>
                    {session.attached ? '연결됨' : '분리됨'}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {session.attached ? (
                  <Plug className="w-3 h-3 text-green-400" />
                ) : (
                  <Unplug className="w-3 h-3 text-zinc-500" />
                )}
                <button
                  onClick={() => onAttach(session.name)}
                  className="px-2 py-1 rounded text-xs bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                >
                  연결
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : !loading && !error ? (
        <div className="text-center py-4">
          <Terminal className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">활성 tmux 세션이 없습니다</p>
        </div>
      ) : null}

      {/* 새 세션 */}
      {showNewSession ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder="세션 이름"
            className="flex-1 px-2.5 py-1.5 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSession();
              if (e.key === 'Escape') setShowNewSession(false);
            }}
            autoFocus
          />
          <button
            onClick={handleCreateSession}
            disabled={!newSessionName.trim()}
            className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-xs text-white transition-colors"
          >
            생성
          </button>
          <button
            onClick={() => setShowNewSession(false)}
            className="px-2 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewSession(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-dashed border-[#3f3f46] hover:border-purple-500/50 hover:bg-purple-500/5 rounded-lg text-xs text-zinc-400 hover:text-purple-400 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          새 세션
        </button>
      )}
    </div>
  );
}
