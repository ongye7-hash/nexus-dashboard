'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Loader2,
  Key,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface VPSSettingsProps {
  open: boolean;
  onClose: () => void;
}

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

export function VPSSettings({ open, onClose }: VPSSettingsProps) {
  const [servers, setServers] = useState<VPSServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message?: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState(22);
  const [formUsername, setFormUsername] = useState('');
  const [formAuthType, setFormAuthType] = useState<'password' | 'key'>('password');
  const [formPassword, setFormPassword] = useState('');
  const [formKeyPath, setFormKeyPath] = useState('');
  const [formWorkDir, setFormWorkDir] = useState('/home');

  useEffect(() => {
    if (open) {
      fetchServers();
      resetForm();
      setError(null);
      setTestResult(null);
    } else {
      setLoading(false);
      setSaving(false);
      setTesting(null);
    }
  }, [open]);

  // testResult 타이머 정리
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
    } catch (error) {
      console.warn('VPS 서버 목록 로드 실패:', error);
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
    } catch (error) {
      console.warn('VPS 연결 테스트 실패:', error);
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
    } catch (error) {
      console.warn('VPS 서버 저장 실패:', error);
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
    } catch (error) {
      console.warn('VPS 서버 삭제 실패:', error);
      setError('삭제에 실패했습니다');
    }
  };

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
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 max-h-[85vh] overflow-y-auto"
          >
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden">
              {/* 헤더 */}
              <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Server className="w-4 h-4 text-purple-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white">VPS 설정</h3>
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
                {loading && servers.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 서버 목록 */}
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
                              <p className="text-sm font-medium text-white truncate">
                                {server.name}
                              </p>
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

                    {/* 서버 추가/수정 폼 */}
                    {showForm ? (
                      <div className="space-y-3 p-3 bg-[#0f0f10] rounded-lg border border-[#27272a]">
                        <p className="text-sm font-medium text-zinc-300">
                          {editingId ? '서버 수정' : '새 서버 추가'}
                        </p>

                        {/* 서버 이름 */}
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

                        {/* 호스트 + 포트 */}
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

                        {/* 사용자명 */}
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

                        {/* 인증 방식 */}
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

                        {/* 비밀번호 / 키 파일 경로 */}
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

                        {/* 기본 작업 경로 */}
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

                        {/* 테스트 결과 (폼 내) */}
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

                        {/* 버튼 */}
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

                    {/* 빈 상태 */}
                    {servers.length === 0 && !showForm && !loading && (
                      <div className="text-center py-6">
                        <Server className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                        <p className="text-sm text-zinc-400">등록된 VPS 서버가 없습니다</p>
                        <p className="text-xs text-zinc-500 mt-1">서버를 추가하여 원격 관리를 시작하세요</p>
                      </div>
                    )}
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
