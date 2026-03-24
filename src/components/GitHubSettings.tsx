'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderGit2 as GithubIcon,
  Key,
  RefreshCw,
  Unlink,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
} from 'lucide-react';

interface GitHubSettingsProps {
  open: boolean;
  onClose: () => void;
}

interface AuthStatus {
  authenticated: boolean;
  user?: {
    login: string;
    avatar_url: string;
    public_repos: number;
    total_private_repos?: number;
  };
  lastSynced?: string;
}

export function GitHubSettings({ open, onClose }: GitHubSettingsProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      fetchAuthStatus();
      setToken('');
      setShowToken(false);
      setError(null);
      setConfirmDisconnect(false);
      setSaveSuccess(false);
    } else {
      // 모달 닫힐 때 상태 정리
      setLoading(false);
      setSaving(false);
      setSyncing(false);
    }
  }, [open]);

  // saveSuccess 타이머 정리 (언마운트 시 메모리 누수 방지)
  useEffect(() => {
    if (!saveSuccess) return;
    const timer = setTimeout(() => setSaveSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [saveSuccess]);

  const fetchAuthStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/github/auth');
      const data = await res.json();
      setAuthStatus(data);
    } catch {
      setError('인증 상태를 확인할 수 없습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/github/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '토큰 저장에 실패했습니다');
        return;
      }
      setSaveSuccess(true);
      setToken('');
      await fetchAuthStatus();
    } catch {
      setError('토큰 저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/github/repos?refresh=true');
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '동기화에 실패했습니다');
        return;
      }
      await fetchAuthStatus();
    } catch {
      setError('동기화에 실패했습니다');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/github/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete' }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '연결 해제에 실패했습니다');
        return;
      }
      setAuthStatus({ authenticated: false });
      setConfirmDisconnect(false);
    } catch {
      setError('연결 해제에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const repoCount = authStatus?.user
    ? (authStatus.user.public_repos || 0) + (authStatus.user.total_private_repos || 0)
    : 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
          >
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden">
              {/* 헤더 */}
              <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <GithubIcon className="w-4 h-4 text-purple-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white">GitHub 설정</h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 본문 */}
              <div className="p-4">
                {loading && !authStatus ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                  </div>
                ) : authStatus?.authenticated && authStatus.user ? (
                  /* 인증됨 */
                  <div className="space-y-4">
                    {/* 사용자 정보 */}
                    <div className="flex items-center gap-3 p-3 bg-[#0f0f10] rounded-lg">
                      <img
                        src={authStatus.user.avatar_url}
                        alt={authStatus.user.login}
                        className="w-10 h-10 rounded-full"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{authStatus.user.login}</p>
                        <p className="text-xs text-zinc-500">레포지토리 {repoCount}개</p>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-full">
                        <Check className="w-3 h-3 text-green-400" />
                        <span className="text-xs text-green-400">연결됨</span>
                      </div>
                    </div>

                    {/* 동기화 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-300">레포 동기화</p>
                        {authStatus.lastSynced && (
                          <p className="text-xs text-zinc-500 mt-0.5">
                            마지막 동기화: {new Date(authStatus.lastSynced).toLocaleString('ko-KR')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? '동기화 중...' : '레포 동기화'}
                      </button>
                    </div>

                    {/* 연결 해제 */}
                    <div className="pt-3 border-t border-[#27272a]">
                      <button
                        onClick={handleDisconnect}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          confirmDisconnect
                            ? 'bg-red-600 hover:bg-red-500 text-white'
                            : 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10'
                        }`}
                      >
                        <Unlink className="w-4 h-4" />
                        {confirmDisconnect ? '정말 연결을 해제하시겠습니까?' : '연결 해제'}
                      </button>
                      {confirmDisconnect && (
                        <button
                          onClick={() => setConfirmDisconnect(false)}
                          className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          취소
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* 미인증 */
                  <div className="space-y-4">
                    <div className="p-3 bg-[#0f0f10] rounded-lg">
                      <p className="text-sm text-zinc-300 mb-1">Personal Access Token 입력</p>
                      <p className="text-xs text-zinc-500">
                        GitHub Settings &gt; Developer settings &gt; Personal access tokens에서 생성
                      </p>
                    </div>

                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                        <input
                          type={showToken ? 'text' : 'password'}
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          placeholder="ghp_xxxxxxxxxxxx"
                          className="flex-1 px-3 py-2 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500 font-mono"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveToken();
                          }}
                        />
                        <button
                          onClick={() => setShowToken(!showToken)}
                          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleSaveToken}
                      disabled={!token.trim() || saving}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : saveSuccess ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <GithubIcon className="w-4 h-4" />
                      )}
                      {saving ? '연결 중...' : saveSuccess ? '연결 완료!' : '연결'}
                    </button>
                  </div>
                )}

                {/* 에러 */}
                {error && (
                  <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
