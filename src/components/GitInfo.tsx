'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  GitCommit,
  GitMerge,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Circle,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from 'lucide-react';

interface GitCommitData {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  relativeDate: string;
}

interface GitBranchData {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

interface GitStatusData {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  staged: string[];
}

interface GitInfoData {
  isGitRepo: boolean;
  currentBranch?: string;
  commits?: GitCommitData[];
  branches?: GitBranchData[];
  status?: GitStatusData;
  remoteUrl?: string;
  hasRemote?: boolean;
  ahead?: number;
  behind?: number;
}

interface GitInfoProps {
  projectPath: string;
}

export function GitInfo({ projectPath }: GitInfoProps) {
  const [info, setInfo] = useState<GitInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showAllCommits, setShowAllCommits] = useState(false);

  const fetchGitInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/git?path=${encodeURIComponent(projectPath)}`);
      const data = await res.json();
      setInfo(data);
    } catch (error) {
      console.error('Git 정보 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGitInfo();
  }, [projectPath]);

  if (loading) {
    return (
      <div className="p-4 bg-[#0f0f10] rounded-lg animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-1/3"></div>
      </div>
    );
  }

  if (!info || !info.isGitRepo) {
    return null;
  }

  const totalChanges =
    (info.status?.modified.length || 0) +
    (info.status?.added.length || 0) +
    (info.status?.deleted.length || 0) +
    (info.status?.untracked.length || 0);

  const hasChanges = totalChanges > 0;
  const displayCommits = showAllCommits
    ? info.commits
    : info.commits?.slice(0, 5);

  // GitHub URL 추출
  const getGitHubUrl = () => {
    if (!info.remoteUrl) return null;
    const match = info.remoteUrl.match(
      /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/
    );
    if (match) {
      return `https://github.com/${match[1]}`;
    }
    return null;
  };

  const githubUrl = getGitHubUrl();

  return (
    <div className="bg-[#0f0f10] rounded-lg overflow-hidden">
      {/* 헤더 - 항상 보임 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <GitBranch className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-zinc-300">
            {info.currentBranch}
          </span>

          {/* 상태 표시 */}
          {hasChanges ? (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded-full">
              <Circle className="w-2 h-2 fill-current" />
              {totalChanges} 변경됨
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
              <CheckCircle className="w-3 h-3" />
              최신
            </span>
          )}

          {/* Ahead/Behind */}
          {info.hasRemote && (info.ahead || info.behind) ? (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              {info.ahead ? (
                <span className="flex items-center gap-0.5 text-blue-400">
                  <ArrowUp className="w-3 h-3" />
                  {info.ahead}
                </span>
              ) : null}
              {info.behind ? (
                <span className="flex items-center gap-0.5 text-amber-400">
                  <ArrowDown className="w-3 h-3" />
                  {info.behind}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchGitInfo();
            }}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* 확장된 내용 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-0 space-y-4">
              {/* 변경 사항 */}
              {hasChanges && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    변경 사항
                  </span>
                  <div className="space-y-1">
                    {info.status?.modified.map((file) => (
                      <div
                        key={file}
                        className="flex items-center gap-2 text-xs text-zinc-400"
                      >
                        <span className="w-4 h-4 flex items-center justify-center rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                          M
                        </span>
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                    {info.status?.added.map((file) => (
                      <div
                        key={file}
                        className="flex items-center gap-2 text-xs text-zinc-400"
                      >
                        <span className="w-4 h-4 flex items-center justify-center rounded text-[10px] font-bold bg-green-500/20 text-green-400">
                          A
                        </span>
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                    {info.status?.deleted.map((file) => (
                      <div
                        key={file}
                        className="flex items-center gap-2 text-xs text-zinc-400"
                      >
                        <span className="w-4 h-4 flex items-center justify-center rounded text-[10px] font-bold bg-red-500/20 text-red-400">
                          D
                        </span>
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                    {info.status?.untracked.slice(0, 5).map((file) => (
                      <div
                        key={file}
                        className="flex items-center gap-2 text-xs text-zinc-400"
                      >
                        <span className="w-4 h-4 flex items-center justify-center rounded text-[10px] font-bold bg-zinc-700 text-zinc-400">
                          ?
                        </span>
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                    {(info.status?.untracked.length || 0) > 5 && (
                      <p className="text-xs text-zinc-500 pl-6">
                        +{info.status!.untracked.length - 5}개 더...
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 최근 커밋 */}
              {info.commits && info.commits.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    최근 커밋
                  </span>
                  <div className="space-y-2">
                    {displayCommits?.map((commit, index) => (
                      <div
                        key={commit.hash}
                        className="flex items-start gap-3 group"
                      >
                        {/* 타임라인 */}
                        <div className="flex flex-col items-center">
                          <GitCommit className="w-4 h-4 text-indigo-400" />
                          {index < (displayCommits?.length || 0) - 1 && (
                            <div className="w-0.5 h-full min-h-[20px] bg-zinc-800 mt-1" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                            {commit.message}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                            <span className="font-mono text-indigo-400">
                              {commit.shortHash}
                            </span>
                            <span>{commit.author}</span>
                            <span>{commit.relativeDate}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {info.commits.length > 5 && (
                    <button
                      onClick={() => setShowAllCommits(!showAllCommits)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {showAllCommits
                        ? '접기'
                        : `+${info.commits.length - 5}개 더 보기`}
                    </button>
                  )}
                </div>
              )}

              {/* 브랜치 */}
              {info.branches && info.branches.length > 1 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    브랜치
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {info.branches
                      .filter((b) => !b.isRemote)
                      .map((branch) => (
                        <span
                          key={branch.name}
                          className={`px-2 py-0.5 text-xs rounded-full ${
                            branch.isCurrent
                              ? 'bg-indigo-500/20 text-indigo-400'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {branch.name}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
