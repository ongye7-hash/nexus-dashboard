'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  GitPullRequest,
  Package,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Project } from '@/lib/types';

interface RoutineResult {
  projectName: string;
  projectPath: string;
  steps: {
    name: string;
    status: 'success' | 'skipped' | 'error';
    message?: string;
    duration?: number;
  }[];
}

interface MorningRoutineModalProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
}

export default function MorningRoutineModal({
  open,
  onClose,
  projects,
}: MorningRoutineModalProps) {
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set(projects.filter(p => p.pinned).map(p => p.id))
  );
  const [actions, setActions] = useState({
    gitPull: true,
    npmInstall: true,
  });
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RoutineResult[] | null>(null);

  const toggleProject = (id: string) => {
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedProjects(new Set(projects.map(p => p.id)));
  };

  const selectNone = () => {
    setSelectedProjects(new Set());
  };

  const runRoutine = async () => {
    const projectsToRun = projects.filter(p => selectedProjects.has(p.id));
    if (projectsToRun.length === 0) return;

    setRunning(true);
    setResults(null);

    try {
      const res = await fetch('/api/morning-routine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projects: projectsToRun.map(p => ({ name: p.name, path: p.path })),
          actions,
        }),
      });

      const data = await res.json();
      setResults(data.results);
    } catch (error) {
      console.error('Morning routine failed:', error);
    } finally {
      setRunning(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'skipped':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return null;
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl bg-[#18181b] rounded-2xl border border-[#27272a] shadow-2xl overflow-hidden"
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#27272a]">
            <div>
              <h2 className="text-lg font-bold text-white">Morning Routine</h2>
              <p className="text-sm text-zinc-500">일괄 git pull + npm install</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {!results ? (
              <>
                {/* 액션 선택 */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-zinc-400 mb-3">실행할 작업</h3>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setActions(prev => ({ ...prev, gitPull: !prev.gitPull }))}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                        actions.gitPull
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                          : 'border-zinc-700 text-zinc-500'
                      }`}
                    >
                      <GitPullRequest className="w-4 h-4" />
                      git pull
                    </button>
                    <button
                      onClick={() => setActions(prev => ({ ...prev, npmInstall: !prev.npmInstall }))}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                        actions.npmInstall
                          ? 'bg-green-500/20 border-green-500/50 text-green-400'
                          : 'border-zinc-700 text-zinc-500'
                      }`}
                    >
                      <Package className="w-4 h-4" />
                      npm install
                    </button>
                  </div>
                </div>

                {/* 프로젝트 선택 */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-zinc-400">
                      프로젝트 선택 ({selectedProjects.size}/{projects.length})
                    </h3>
                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={selectAll}
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        전체 선택
                      </button>
                      <span className="text-zinc-600">|</span>
                      <button
                        onClick={selectNone}
                        className="text-zinc-500 hover:text-zinc-400"
                      >
                        선택 해제
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {projects.map(project => (
                      <button
                        key={project.id}
                        onClick={() => toggleProject(project.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                          selectedProjects.has(project.id)
                            ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                            : 'border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          selectedProjects.has(project.id)
                            ? 'bg-indigo-500 border-indigo-500'
                            : 'border-zinc-600'
                        }`}>
                          {selectedProjects.has(project.id) && (
                            <CheckCircle className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <span className="truncate text-sm">{project.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* 결과 표시 */
              <div className="space-y-4">
                {results.map((result, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50"
                  >
                    <h4 className="font-medium text-white mb-2">{result.projectName}</h4>
                    <div className="space-y-2">
                      {result.steps.map((step, stepIdx) => (
                        <div
                          key={stepIdx}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {getStatusIcon(step.status)}
                            <span className="text-zinc-400">{step.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-500">{step.message}</span>
                            {step.duration && (
                              <span className="text-zinc-600">{step.duration}ms</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 푸터 */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#27272a]">
            {results ? (
              <button
                onClick={() => setResults(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors"
              >
                다시 실행
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={runRoutine}
                  disabled={running || selectedProjects.size === 0 || (!actions.gitPull && !actions.npmInstall)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
                >
                  {running ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      실행 중...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      루틴 실행
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
