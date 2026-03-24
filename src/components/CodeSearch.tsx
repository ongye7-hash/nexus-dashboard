'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  FileCode,
  FolderOpen,
  Code2,
  Loader2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  CaseSensitive,
  WholeWord,
} from 'lucide-react';
import { Project } from '@/lib/types';

interface SearchResult {
  projectName: string;
  projectPath: string;
  filePath: string;
  relativePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

interface CodeSearchProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
}

export function CodeSearch({ open, onClose, projects }: CodeSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [projectsSearched, setProjectsSearched] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 모달 열릴 때 포커스
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // 검색 실행
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const projectPaths = projects.map(p => p.path);

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          projectPaths,
          caseSensitive,
          wholeWord,
          maxResults: 50,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResults(data.results || []);
        setSearchTime(data.searchTime || 0);
        setProjectsSearched(data.projectsSearched || 0);
      } else {
        setError(data.error || '검색 실패');
      }
    } catch (err) {
      setError('검색 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }, [projects, caseSensitive, wholeWord]);

  // 디바운스 검색
  const handleQueryChange = (value: string) => {
    setQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  // VSCode로 파일 열기
  const openInVSCode = async (filePath: string, lineNumber: number) => {
    try {
      await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'openVSCode',
          path: `${filePath}:${lineNumber}`,
        }),
      });
    } catch (err) {
      console.error('VSCode 열기 실패:', err);
    }
  };

  // 코드 복사
  const copyCode = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // 하이라이트된 코드 렌더링
  const renderHighlightedCode = (content: string, matchStart: number, matchEnd: number) => {
    if (matchStart < 0 || matchEnd <= matchStart) {
      return <span className="text-zinc-300">{content}</span>;
    }

    const before = content.slice(0, matchStart);
    const match = content.slice(matchStart, matchEnd);
    const after = content.slice(matchEnd);

    return (
      <>
        <span className="text-zinc-400">{before}</span>
        <span className="bg-amber-500/30 text-amber-200 px-0.5 rounded">{match}</span>
        <span className="text-zinc-400">{after}</span>
      </>
    );
  };

  // ESC로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      >
        {/* 배경 오버레이 */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* 검색 모달 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          className="relative w-full max-w-3xl bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden"
        >
          {/* 검색 헤더 */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#27272a]">
            <Search className="w-5 h-5 text-zinc-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="모든 프로젝트에서 코드 검색..."
              className="flex-1 bg-transparent text-white placeholder:text-zinc-500 outline-none text-base"
            />
            {loading && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}

            {/* 검색 옵션 */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setCaseSensitive(!caseSensitive);
                  if (query.length >= 2) performSearch(query);
                }}
                className={`p-1.5 rounded transition-colors ${
                  caseSensitive
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="대소문자 구분"
              >
                <CaseSensitive className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setWholeWord(!wholeWord);
                  if (query.length >= 2) performSearch(query);
                }}
                className={`p-1.5 rounded transition-colors ${
                  wholeWord
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="전체 단어만"
              >
                <WholeWord className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 검색 결과 */}
          <div className="max-h-[60vh] overflow-y-auto">
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            {!error && results.length === 0 && query.length >= 2 && !loading && (
              <div className="px-4 py-8 text-center text-zinc-500">
                <Code2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>검색 결과가 없습니다</p>
              </div>
            )}

            {!error && query.length < 2 && (
              <div className="px-4 py-8 text-center text-zinc-500">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>2자 이상 입력하세요</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="divide-y divide-[#27272a]">
                {results.map((result, index) => (
                  <div
                    key={`${result.filePath}:${result.lineNumber}:${index}`}
                    className="group px-4 py-3 hover:bg-zinc-800/50 transition-colors"
                  >
                    {/* 파일 정보 */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 rounded">
                        {result.projectName}
                      </span>
                      <span className="text-sm text-zinc-400 truncate">
                        {result.relativePath}
                      </span>
                      <span className="text-xs text-zinc-600">
                        :{result.lineNumber}
                      </span>

                      {/* 액션 버튼 */}
                      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyCode(result.lineContent, index)}
                          className="p-1 text-zinc-500 hover:text-white rounded transition-colors"
                          title="복사"
                        >
                          {copiedIndex === index ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => openInVSCode(result.filePath, result.lineNumber)}
                          className="p-1 text-zinc-500 hover:text-white rounded transition-colors"
                          title="VSCode에서 열기"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 코드 라인 */}
                    <pre className="text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all">
                      {renderHighlightedCode(
                        result.lineContent,
                        result.matchStart,
                        result.matchEnd
                      )}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 푸터 */}
          {results.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-[#27272a] text-xs text-zinc-500">
              <span>
                {results.length}개 결과 ({projectsSearched}개 프로젝트 검색)
              </span>
              <span>{searchTime}ms</span>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
