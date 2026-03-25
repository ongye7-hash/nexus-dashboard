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
