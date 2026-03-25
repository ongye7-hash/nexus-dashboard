'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2, RotateCcw, Check, AlertCircle, Loader2 } from 'lucide-react';

interface ValidatedPath {
  path: string;
  exists: boolean;
}

export default function ScanPathsTab() {
  const [paths, setPaths] = useState<string[]>([]);
  const [validated, setValidated] = useState<ValidatedPath[]>([]);
  const [newPath, setNewPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchPaths();
  }, []);

  const fetchPaths = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scan-paths');
      const data = await res.json();
      setPaths(data.paths || []);
      setValidated(data.validated || []);
    } catch (err) {
      console.warn('스캔 경로 로드 실패:', err);
      setError('경로를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newPath.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/scan-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', path: newPath.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setPaths(data.paths);
        setValidated(data.validated || []);
        setNewPath('');
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      console.warn('경로 추가 실패:', err);
      setError('경로 추가에 실패했습니다');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (pathToRemove: string) => {
    try {
      const res = await fetch('/api/scan-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', path: pathToRemove }),
      });
      const data = await res.json();
      if (res.ok) {
        setPaths(data.paths);
        setValidated(data.validated || []);
      }
    } catch (err) {
      console.warn('경로 삭제 실패:', err);
    }
  };

  const handleReset = async () => {
    try {
      const res = await fetch('/api/scan-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const data = await res.json();
      if (res.ok) {
        setPaths(data.paths);
        setValidated(data.validated || []);
        setError(null);
      }
    } catch (err) {
      console.warn('경로 초기화 실패:', err);
    }
  };

  const getPathValidation = (p: string): boolean | null => {
    const found = validated.find(v => v.path === p);
    return found ? found.exists : null;
  };

  return (
    <div className="p-4">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 설명 */}
          <div className="p-3 bg-[#0f0f10] rounded-lg">
            <p className="text-sm text-zinc-300 mb-1">프로젝트 스캔 경로</p>
            <p className="text-xs text-zinc-500">
              프로젝트를 검색할 폴더를 설정합니다. 각 폴더 내의 개발 프로젝트가 대시보드에 표시됩니다.
            </p>
          </div>

          {/* 경로 목록 */}
          <div className="space-y-2">
            {paths.map((p) => {
              const exists = getPathValidation(p);
              return (
                <div
                  key={p}
                  className="flex items-center gap-2 p-3 bg-[#0f0f10] rounded-lg group"
                >
                  <FolderOpen className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <span className="flex-1 text-sm text-zinc-300 font-mono truncate" title={p}>
                    {p}
                  </span>
                  {exists === true && (
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  )}
                  {exists === false && (
                    <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  )}
                  <button
                    onClick={() => handleRemove(p)}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="경로 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* 경로 추가 */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => { setNewPath(e.target.value); setError(null); }}
              placeholder="C:\Users\user\Projects"
              className="flex-1 px-3 py-2 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500 font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!newPath.trim() || adding}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              추가
            </button>
          </div>

          {/* 기본값 복원 */}
          <div className="pt-3 border-t border-[#27272a]">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              기본값 복원
            </button>
          </div>
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
