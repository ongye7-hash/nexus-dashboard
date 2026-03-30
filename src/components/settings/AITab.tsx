'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  Key,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Unlink,
  Zap,
} from 'lucide-react';

export default function AITab() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ online: boolean; provider: string; model?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // n8n
  const [n8nKey, setN8nKey] = useState('');
  const [showN8nKey, setShowN8nKey] = useState(false);
  const [n8nSaving, setN8nSaving] = useState(false);
  const [n8nStatus, setN8nStatus] = useState<{ online: boolean; url: string } | null>(null);
  const [n8nError, setN8nError] = useState<string | null>(null);
  const [n8nSaveSuccess, setN8nSaveSuccess] = useState(false);
  const [n8nConfirmDelete, setN8nConfirmDelete] = useState(false);

  useEffect(() => {
    checkStatus();
    checkN8nStatus();
  }, []);

  useEffect(() => {
    if (!saveSuccess) return;
    const timer = setTimeout(() => setSaveSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [saveSuccess]);

  useEffect(() => {
    if (!n8nSaveSuccess) return;
    const timer = setTimeout(() => setN8nSaveSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [n8nSaveSuccess]);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai');
      const data = await res.json();
      setStatus({ online: data.online, provider: data.provider, model: data.model });
    } catch { /* AI 상태 확인 실패 — null 처리 */
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
    } catch (error) {
      console.warn('API 키 저장 실패:', error);
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
    } catch (error) {
      console.warn('API 키 삭제 실패:', error);
      setError('API 키 삭제에 실패했습니다');
    }
  };

  const checkN8nStatus = async () => {
    try {
      const res = await fetch('/api/ai?action=n8nStatus');
      const data = await res.json();
      setN8nStatus(data);
    } catch {
      setN8nStatus(null);
    }
  };

  const handleSaveN8nKey = async () => {
    if (!n8nKey.trim()) return;
    setN8nSaving(true);
    setN8nError(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveN8nKey', n8nApiKey: n8nKey.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setN8nKey('');
        setN8nSaveSuccess(true);
        await checkN8nStatus();
      } else {
        setN8nError(data.error || '저장 실패');
      }
    } catch (error) {
      console.warn('n8n API 키 저장 실패:', error);
      setN8nError('n8n API 키 저장에 실패했습니다');
    } finally {
      setN8nSaving(false);
    }
  };

  const handleDeleteN8nKey = async () => {
    if (!n8nConfirmDelete) { setN8nConfirmDelete(true); return; }
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteN8nKey' }),
      });
      if (res.ok) {
        setN8nConfirmDelete(false);
        await checkN8nStatus();
      }
    } catch (error) {
      console.warn('n8n API 키 삭제 실패:', error);
      setN8nError('n8n API 키 삭제에 실패했습니다');
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

      {/* n8n API Key 섹션 */}
      <div className="mt-6 pt-6 border-t border-[#27272a]">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-white">n8n 연동</span>
        </div>

        {n8nStatus?.online ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-[#0f0f10] rounded-lg">
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">n8n</p>
                <p className="text-xs text-zinc-500">{n8nStatus.url}</p>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-full">
                <Check className="w-3 h-3 text-green-400" />
                <span className="text-xs text-green-400">연결됨</span>
              </div>
            </div>
            <button
              onClick={handleDeleteN8nKey}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                n8nConfirmDelete
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10'
              }`}
            >
              <Unlink className="w-4 h-4" />
              {n8nConfirmDelete ? '정말 연결을 해제하시겠습니까?' : 'API 키 삭제'}
            </button>
            {n8nConfirmDelete && (
              <button
                onClick={() => setN8nConfirmDelete(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                취소
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-[#0f0f10] rounded-lg">
              <p className="text-sm text-zinc-300 mb-1">n8n API Key 입력</p>
              <p className="text-xs text-zinc-500">n8n 설정 &gt; API에서 키를 생성하세요</p>
            </div>
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <input
                type={showN8nKey ? 'text' : 'password'}
                value={n8nKey}
                onChange={(e) => { setN8nKey(e.target.value); setN8nError(null); }}
                placeholder="eyJhbG..."
                className="flex-1 px-3 py-2 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-orange-500 font-mono"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveN8nKey(); }}
              />
              <button
                onClick={() => setShowN8nKey(!showN8nKey)}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {showN8nKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleSaveN8nKey}
              disabled={!n8nKey.trim() || n8nSaving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
            >
              {n8nSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : n8nSaveSuccess ? (
                <Check className="w-4 h-4" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {n8nSaving ? '저장 중...' : n8nSaveSuccess ? '저장 완료!' : '연결'}
            </button>
          </div>
        )}

        {n8nError && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{n8nError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
