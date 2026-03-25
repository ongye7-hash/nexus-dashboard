'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FolderGit2 as GithubIcon,
  Server,
  Bot,
  Key,
  Check,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Unlink,
  Plus,
  Trash2,
  Edit3,
  Wifi,
  WifiOff,
} from 'lucide-react';

type TabId = 'github' | 'vps' | 'ai';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabId;
}

const TABS = [
  { id: 'github' as const, label: 'GitHub', icon: GithubIcon },
  { id: 'vps' as const, label: 'VPS', icon: Server },
  { id: 'ai' as const, label: 'AI', icon: Bot },
];

// === GitHub 관련 타입/상태 ===
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

// === VPS 관련 타입 ===
interface VPSServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  keyPath?: string;
  workDir: string;
  online?: boolean;
}

export function SettingsModal({ open, onClose, initialTab = 'github' }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

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
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 max-h-[85vh] flex flex-col"
          >
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* 헤더 + 탭 */}
              <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
                <h3 className="text-base font-semibold text-white">설정</h3>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 탭 바 */}
              <div className="flex border-b border-[#27272a]">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                        isActive
                          ? 'text-purple-400'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                      {isActive && (
                        <motion.div
                          layoutId="settings-tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 탭 콘텐츠 */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'github' && <GitHubTabContent />}
                {activeTab === 'vps' && <VPSTabContent />}
                {activeTab === 'ai' && <AITabContent />}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// GitHub Tab Content
// ============================================================
function GitHubTabContent() {
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
    fetchAuthStatus();
  }, []);

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
    <div className="p-4">
      {loading && !authStatus ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      ) : authStatus?.authenticated && authStatus.user ? (
        <div className="space-y-4">
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

      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// VPS Tab Content
// ============================================================
function VPSTabContent() {
  const [servers, setServers] = useState<VPSServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message?: string } | null>(null);

  const [formName, setFormName] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState(22);
  const [formUsername, setFormUsername] = useState('');
  const [formAuthType, setFormAuthType] = useState<'password' | 'key'>('password');
  const [formPassword, setFormPassword] = useState('');
  const [formKeyPath, setFormKeyPath] = useState('');
  const [formWorkDir, setFormWorkDir] = useState('/home');

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    if (!testResult) return;
    const timer = setTimeout(() => setTestResult(null), 3000);
    return () => clearTimeout(timer);
  }, [testResult]);

  const fetchServers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vps');
      const data = await res.json();
      setServers(data.servers || []);
    } catch {
      setError('서버 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setFormHost('');
    setFormPort(22);
    setFormUsername('');
    setFormAuthType('password');
    setFormPassword('');
    setFormKeyPath('');
    setFormWorkDir('/home');
  };

  const handleEdit = (server: VPSServer) => {
    setEditingId(server.id);
    setFormName(server.name);
    setFormHost(server.host);
    setFormPort(server.port);
    setFormUsername(server.username);
    setFormAuthType(server.authType);
    setFormPassword(server.password || '');
    setFormKeyPath(server.keyPath || '');
    setFormWorkDir(server.workDir);
    setShowForm(true);
  };

  const handleTest = async (server?: VPSServer) => {
    const targetId = server?.id || 'new';
    setTesting(targetId);
    setTestResult(null);
    try {
      const body = server
        ? { action: 'test', id: server.id }
        : {
            action: 'test',
            host: formHost,
            port: formPort,
            username: formUsername,
            authType: formAuthType === 'key' ? 'key_file' : 'password',
            credential: formAuthType === 'password' ? formPassword : formKeyPath,
          };

      const res = await fetch('/api/vps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTestResult({
        id: targetId,
        success: data.success || false,
        message: data.message || (data.success ? '연결 성공' : '연결 실패'),
      });
      if (data.success && server) {
        setServers((prev) =>
          prev.map((s) => (s.id === server.id ? { ...s, online: true } : s))
        );
      }
    } catch {
      setTestResult({ id: targetId, success: false, message: '연결 테스트에 실패했습니다' });
    } finally {
      setTesting(null);
    }
  };

  const handleSave = async () => {
    if (!formName.trim() || !formHost.trim() || !formUsername.trim()) {
      setError('서버 이름, 호스트, 사용자명은 필수입니다');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const credential = formAuthType === 'password' ? formPassword : formKeyPath;
      const body = {
        action: editingId ? 'update' : 'add',
        id: editingId || undefined,
        name: formName.trim(),
        host: formHost.trim(),
        port: formPort,
        username: formUsername.trim(),
        authType: formAuthType === 'key' ? 'key_file' : 'password',
        credential,
        defaultCwd: formWorkDir.trim() || '/home',
      };
      const res = await fetch('/api/vps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '저장에 실패했습니다');
        return;
      }
      resetForm();
      await fetchServers();
    } catch {
      setError('저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch('/api/vps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      if (res.ok) {
        setServers((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      setError('삭제에 실패했습니다');
    }
  };

  return (
    <div className="p-4">
      {loading && servers.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {servers.length > 0 && (
            <div className="space-y-2">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center gap-3 p-3 bg-[#0f0f10] rounded-lg"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      server.online ? 'bg-green-400' : 'bg-red-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{server.name}</p>
                    <p className="text-xs text-zinc-500">
                      {server.username}@{server.host}:{server.port}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {server.online ? (
                      <Wifi className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                    {testResult?.id === server.id && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          testResult.success
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {testResult.message}
                      </span>
                    )}
                    <button
                      onClick={() => handleTest(server)}
                      disabled={testing === server.id}
                      className="p-1.5 rounded text-zinc-400 hover:text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                      title="연결 테스트"
                    >
                      {testing === server.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Wifi className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleEdit(server)}
                      className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="수정"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(server.id)}
                      className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showForm ? (
            <div className="space-y-3 p-3 bg-[#0f0f10] rounded-lg border border-[#27272a]">
              <p className="text-sm font-medium text-zinc-300">
                {editingId ? '서버 수정' : '새 서버 추가'}
              </p>

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">서버 이름</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="내 VPS"
                  className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 mb-1 block">호스트</label>
                  <input
                    type="text"
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500"
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-zinc-500 mb-1 block">포트</label>
                  <input
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">사용자명</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="root"
                  className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">인증 방식</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormAuthType('password')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      formAuthType === 'password'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                        : 'bg-[#18181b] text-zinc-400 border border-[#27272a] hover:border-[#3f3f46]'
                    }`}
                  >
                    <Key className="w-3.5 h-3.5" />
                    비밀번호
                  </button>
                  <button
                    onClick={() => setFormAuthType('key')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      formAuthType === 'key'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                        : 'bg-[#18181b] text-zinc-400 border border-[#27272a] hover:border-[#3f3f46]'
                    }`}
                  >
                    <Key className="w-3.5 h-3.5" />
                    SSH 키 파일
                  </button>
                </div>
              </div>

              {formAuthType === 'password' ? (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">비밀번호</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">SSH 키 파일 경로</label>
                  <input
                    type="text"
                    value={formKeyPath}
                    onChange={(e) => setFormKeyPath(e.target.value)}
                    placeholder="C:\Users\user\.ssh\id_rsa"
                    className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">기본 작업 경로</label>
                <input
                  type="text"
                  value={formWorkDir}
                  onChange={(e) => setFormWorkDir(e.target.value)}
                  placeholder="/home"
                  className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500 font-mono"
                />
              </div>

              {testResult?.id === 'new' && (
                <div
                  className={`p-2 rounded-lg text-sm ${
                    testResult.success
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}
                >
                  {testResult.message}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleTest()}
                  disabled={!formHost.trim() || !formUsername.trim() || testing === 'new'}
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-zinc-300 transition-colors"
                >
                  {testing === 'new' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wifi className="w-3.5 h-3.5" />
                  )}
                  연결 테스트
                </button>
                <div className="flex-1" />
                <button
                  onClick={resetForm}
                  className="px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim() || !formHost.trim() || !formUsername.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-[#3f3f46] hover:border-purple-500/50 hover:bg-purple-500/5 rounded-lg text-sm text-zinc-400 hover:text-purple-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              서버 추가
            </button>
          )}

          {servers.length === 0 && !showForm && !loading && (
            <div className="text-center py-6">
              <Server className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400">등록된 VPS 서버가 없습니다</p>
              <p className="text-xs text-zinc-500 mt-1">서버를 추가하여 원격 관리를 시작하세요</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// AI Tab Content
// ============================================================
function AITabContent() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ online: boolean; provider: string; model?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    if (!saveSuccess) return;
    const timer = setTimeout(() => setSaveSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [saveSuccess]);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai');
      const data = await res.json();
      setStatus({ online: data.online, provider: data.provider, model: data.model });
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveApiKey', apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setApiKey('');
        setSaveSuccess(true);
        await checkStatus();
      } else {
        setError(data.error || '저장 실패');
      }
    } catch {
      setError('API 키 저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteApiKey' }),
      });
      if (res.ok) {
        setConfirmDelete(false);
        await checkStatus();
      }
    } catch {
      setError('API 키 삭제에 실패했습니다');
    }
  };

  return (
    <div className="p-4">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      ) : status?.online ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-[#0f0f10] rounded-lg">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Claude AI</p>
              <p className="text-xs text-zinc-500">{status.model || 'claude-haiku-4-5'}</p>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-full">
              <Check className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-400">연결됨</span>
            </div>
          </div>

          <div className="p-3 bg-[#0f0f10] rounded-lg">
            <p className="text-sm text-zinc-300 mb-1">제공자</p>
            <p className="text-xs text-zinc-500">{status.provider || 'Anthropic'}</p>
          </div>

          <div className="pt-3 border-t border-[#27272a]">
            <button
              onClick={handleDeleteKey}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                confirmDelete
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10'
              }`}
            >
              <Unlink className="w-4 h-4" />
              {confirmDelete ? '정말 연결을 해제하시겠습니까?' : 'API 키 삭제'}
            </button>
            {confirmDelete && (
              <button
                onClick={() => setConfirmDelete(false)}
                className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                취소
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-[#0f0f10] rounded-lg">
            <p className="text-sm text-zinc-300 mb-1">Claude API Key 입력</p>
            <p className="text-xs text-zinc-500">
              Anthropic Console에서 API 키를 생성하세요
            </p>
          </div>

          <div className="relative">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setError(null); }}
                placeholder="sk-ant-..."
                className="flex-1 px-3 py-2 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500 font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveKey();
                }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={handleSaveKey}
            disabled={!apiKey.trim() || saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
            {saving ? '확인 중...' : saveSuccess ? '연결 완료!' : '연결'}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
