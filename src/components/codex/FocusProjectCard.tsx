'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch, GitCommit, AlertCircle, Play, Terminal, Code2,
  CheckCircle, XCircle, Loader2, ArrowUpCircle, Timer, Rocket, Send,
} from 'lucide-react';
import { Project } from '@/lib/types';

interface GitInfo {
  isGitRepo: boolean;
  currentBranch?: string;
  commits?: Array<{
    hash: string; shortHash: string; message: string;
    author: string; date: string; relativeDate: string;
  }>;
  status?: {
    modified: string[]; added: string[]; deleted: string[];
    untracked: string[]; staged: string[];
  };
  ahead?: number;
  behind?: number;
}

interface QuickCommitState {
  message: string;
  loading: boolean;
  aiLoading: boolean;
  result: { success: boolean; text: string } | null;
}

interface ActiveSession {
  id: number;
  project_path: string;
  started_at: string;
}

interface FocusProjectCardProps {
  project: Project;
  index: number;
  gitInfo?: GitInfo;
  isSelected: boolean;
  isResuming: boolean;
  activeSession?: ActiveSession;
  commitState?: QuickCommitState;
  isCommitExpanded: boolean;
  timerTick: number;
  onSelect: (project: Project) => void;
  onToggleBatch: (projectId: string) => void;
  onResume: (project: Project) => void;
  onRun: (project: Project) => void;
  onOpenVSCode: (project: Project) => void;
  onOpenTerminal: (project: Project) => void;
  onToggleCommit: (project: Project) => void;
  onCommitMessageChange: (projectId: string, message: string) => void;
  onQuickCommit: (project: Project, andPush: boolean) => void;
  onCancelCommit: () => void;
}

function getUncommittedCount(gitInfo: GitInfo): number {
  if (!gitInfo.status) return 0;
  const { modified, added, deleted, untracked } = gitInfo.status;
  return modified.length + added.length + deleted.length + untracked.length;
}

function formatElapsed(startedAt: string, _tick: number): string {
  void _tick; // force re-render dependency
  const diffMs = Date.now() - new Date(startedAt).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function FocusProjectCard({
  project, index, gitInfo, isSelected, isResuming, activeSession,
  commitState, isCommitExpanded, timerTick,
  onSelect, onToggleBatch, onResume, onRun, onOpenVSCode, onOpenTerminal,
  onToggleCommit, onCommitMessageChange, onQuickCommit, onCancelCommit,
}: FocusProjectCardProps) {
  const uncommittedCount = gitInfo ? getUncommittedCount(gitInfo) : 0;
  const lastCommit = gitInfo?.commits?.[0];

  return (
    <motion.div
      key={project.id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.05 }}
      className={`group relative rounded-xl border transition-all ${
        isSelected
          ? 'bg-indigo-500/10 border-indigo-500/50'
          : 'bg-zinc-800/30 border-zinc-700/50 hover:bg-zinc-800/50 hover:border-zinc-600'
      }`}
    >
      {/* 체크박스 */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleBatch(project.id); }}
        className={`absolute top-3 left-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors z-10 ${
          isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-600 group-hover:border-zinc-500'
        }`}
      >
        {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
      </button>

      <div className="p-4 pl-10 cursor-pointer" onClick={() => onSelect(project)}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white truncate">{project.name}</h3>
              {project.pinned && <span className="text-amber-400 text-xs">★</span>}
              {activeSession && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 border border-green-500/25 rounded-full">
                  <Timer className="w-3 h-3 text-green-400" />
                  <span className="text-xs font-medium text-green-400">{formatElapsed(activeSession.started_at, timerTick)}</span>
                </div>
              )}
            </div>

            {/* Git 정보 */}
            {gitInfo?.isGitRepo && (
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span className="flex items-center gap-1 text-cyan-400">
                  <GitBranch className="w-3 h-3" />{gitInfo.currentBranch}
                </span>
                {uncommittedCount > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleCommit(project); }}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                    title="Quick Commit"
                  >
                    <AlertCircle className="w-3 h-3" />{uncommittedCount}개 변경
                  </button>
                )}
                {gitInfo.ahead && gitInfo.ahead > 0 && <span className="text-green-400">↑{gitInfo.ahead}</span>}
                {gitInfo.behind && gitInfo.behind > 0 && <span className="text-red-400">↓{gitInfo.behind}</span>}
              </div>
            )}

            {/* 마지막 커밋 */}
            {lastCommit && (
              <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                <GitCommit className="w-3 h-3" />
                <span className="truncate max-w-[200px]">{lastCommit.message}</span>
                <span className="shrink-0">{lastCommit.relativeDate}</span>
              </div>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={(e) => { e.stopPropagation(); onResume(project); }} disabled={isResuming}
              className="p-2 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50" title="Resume">
              {isResuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onRun(project); }}
              className="p-2 text-zinc-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors" title="실행">
              <Play className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onOpenVSCode(project); }}
              className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors" title="VSCode">
              <Code2 className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onOpenTerminal(project); }}
              className="p-2 text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors" title="터미널">
              <Terminal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 빠른 커밋 패널 */}
      <AnimatePresence>
        {isCommitExpanded && uncommittedCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-zinc-700/50 mt-0">
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={commitState?.message || ''}
                    onChange={(e) => onCommitMessageChange(project.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onQuickCommit(project, false); }
                    }}
                    placeholder={commitState?.aiLoading ? 'AI 메시지 생성 중...' : '커밋 메시지 입력...'}
                    disabled={commitState?.loading || commitState?.aiLoading}
                    className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                  {commitState?.aiLoading && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); onQuickCommit(project, false); }}
                    disabled={commitState?.loading || !commitState?.message?.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-xs font-medium text-white transition-colors">
                    {commitState?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitCommit className="w-3 h-3" />} Commit
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onQuickCommit(project, true); }}
                    disabled={commitState?.loading || !commitState?.message?.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg text-xs font-medium text-white transition-colors">
                    {commitState?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpCircle className="w-3 h-3" />} Commit & Push
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onCancelCommit(); }}
                    className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                    취소
                  </button>
                </div>
                {commitState?.result && (
                  <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center gap-2 text-xs ${commitState.result.success ? 'text-green-400' : 'text-red-400'}`}>
                    {commitState.result.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {commitState.result.text}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
