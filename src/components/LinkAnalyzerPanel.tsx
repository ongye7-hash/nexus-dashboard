'use client';

import { useState, useEffect, useCallback } from 'react';
import { Link2, Send, Trash2, ExternalLink, Loader2, AlertCircle, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LinkAnalysis } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function LinkAnalyzerPanel() {
  const [url, setUrl] = useState('');
  const [analyses, setAnalyses] = useState<LinkAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<LinkAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalyses = useCallback(async () => {
    try {
      const res = await fetch('/api/analyze-link?limit=50');
      if (res.ok) {
        const data = await res.json();
        setAnalyses(data.analyses || []);
      }
    } catch (err) {
      console.warn('분석 히스토리 로드 실패:', err);
    }
  }, []);

  useEffect(() => { fetchAnalyses(); }, [fetchAnalyses]);

  const handleAnalyze = async () => {
    if (!url.trim() || loading) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/analyze-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '분석 실패');
        return;
      }
      setUrl('');
      await fetchAnalyses();
      setSelectedId(data.id);
      // 상세 로드
      const detailRes = await fetch(`/api/analyze-link?id=${data.id}`);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        setSelectedAnalysis(detail.analysis);
      } else {
        setError('분석 완료됐으나 상세 내용을 불러오지 못했습니다. 목록에서 다시 선택해주세요.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    try {
      const res = await fetch(`/api/analyze-link?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedAnalysis(data.analysis);
      }
    } catch (err) {
      console.warn('상세 로드 실패:', err);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch('/api/analyze-link', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedAnalysis(null);
      }
      await fetchAnalyses();
    } catch (err) {
      console.warn('삭제 실패:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze();
    }
  };

  return (
    <div className="flex h-full gap-4 p-4">
      {/* 왼쪽: 입력 + 히스토리 */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        {/* URL 입력 */}
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 mb-3">
            <Link2 size={18} className="text-blue-400" />
            <span className="text-sm font-medium text-zinc-200">링크 분석</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="YouTube URL 입력..."
              className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:border-blue-500 focus:outline-none placeholder-zinc-500"
              disabled={loading}
            />
            <button
              onClick={handleAnalyze}
              disabled={!url.trim() || loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg px-3 py-2 transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 mt-2 text-red-400 text-xs">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 mt-2 text-blue-400 text-xs">
              <Loader2 size={14} className="animate-spin" />
              <span>자막 추출 + AI 분석 중... (30초~1분)</span>
            </div>
          )}
        </div>

        {/* 히스토리 목록 */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {analyses.length === 0 && (
            <div className="text-center text-zinc-500 text-sm py-8">
              분석 히스토리가 없습니다
            </div>
          )}
          {analyses.map(a => (
            <div
              key={a.id}
              onClick={() => handleSelect(a.id)}
              className={`bg-zinc-900 rounded-lg p-3 border cursor-pointer transition-colors group ${
                selectedId === a.id
                  ? 'border-blue-500 bg-zinc-800/50'
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start gap-3">
                {a.thumbnail && (
                  <img
                    src={a.thumbnail}
                    alt=""
                    className="w-16 h-10 object-cover rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 font-medium truncate">{a.title || '제목 없음'}</p>
                  <p className="text-xs text-zinc-500 truncate">{a.channel}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={10} className="text-zinc-600" />
                    <span className="text-xs text-zinc-600">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ko })}
                    </span>
                    {a.status === 'done' && (
                      <span className="text-xs text-green-500">완료</span>
                    )}
                    {a.status === 'failed' && (
                      <span className="text-xs text-red-500">실패</span>
                    )}
                    {a.status === 'analyzing' && (
                      <span className="text-xs text-blue-400">분석중</span>
                    )}
                  </div>
                  {a.tags && (() => {
                    try {
                      const parsed = JSON.parse(a.tags);
                      if (!Array.isArray(parsed)) return null;
                      return (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {parsed.slice(0, 3).map((tag: unknown, i: number) => (
                            typeof tag === 'string' ? (
                              <span key={i} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                                {tag}
                              </span>
                            ) : null
                          ))}
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </div>
                <button
                  onClick={e => handleDelete(a.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 오른쪽: 분석 결과 */}
      <div className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 overflow-y-auto">
        {!selectedAnalysis ? (
          <div className="flex items-center justify-center h-full text-zinc-600">
            <div className="text-center">
              <Link2 size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm">YouTube URL을 입력하고 분석을 시작하세요</p>
              <p className="text-xs mt-1 text-zinc-700">
                자막을 추출하고 비즈니스 인사이트를 생성합니다
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {/* 영상 헤더 */}
            <div className="flex items-start gap-4 mb-6 pb-4 border-b border-zinc-800">
              {selectedAnalysis.thumbnail && (
                <img
                  src={selectedAnalysis.thumbnail}
                  alt=""
                  className="w-32 h-20 object-cover rounded-lg"
                />
              )}
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-zinc-100">{selectedAnalysis.title}</h2>
                <p className="text-sm text-zinc-400 mt-1">{selectedAnalysis.channel}</p>
                <a
                  href={selectedAnalysis.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2"
                >
                  <ExternalLink size={12} />
                  YouTube에서 보기
                </a>
              </div>
            </div>

            {/* 분석 결과 마크다운 */}
            {selectedAnalysis.analysis ? (
              <div className="prose prose-invert prose-sm max-w-none
                prose-headings:text-zinc-100 prose-p:text-zinc-300
                prose-li:text-zinc-300 prose-strong:text-zinc-200
                prose-a:text-blue-400">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedAnalysis.analysis}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <Loader2 size={16} className="animate-spin" />
                분석 결과를 불러오는 중...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
