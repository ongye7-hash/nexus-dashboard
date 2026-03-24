'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun,
  Moon,
  Sunrise,
  Sunset,
  Coffee,
  GitBranch,
  GitCommit,
  AlertCircle,
  Play,
  StopCircle,
  Terminal,
  Code2,
  ExternalLink,
  ChevronRight,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  Radio,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import { Project } from '@/lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import FileActivityFeed from './FileActivityFeed';
import MorningRoutineModal from './MorningRoutineModal';

interface GitInfo {
  isGitRepo: boolean;
  currentBranch?: string;
  commits?: Array<{
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
    relativeDate: string;
  }>;
  status?: {
    modified: string[];
    added: string[];
    deleted: string[];
    untracked: string[];
    staged: string[];
  };
  ahead?: number;
  behind?: number;
}

interface RunningProcess {
  port: number;
  pid: number;
  name?: string;
  projectPath?: string;
  projectName?: string;
}

interface MorningCodexProps {
  projects: Project[];
  onRunProject: (project: Project) => void;
  onOpenVSCode: (project: Project) => void;
  onOpenTerminal: (project: Project) => void;
  onSelectProject: (project: Project) => void;
  onBatchRun: (projects: Project[]) => void;
}

export function MorningCodex({
  projects,
  onRunProject,
  onOpenVSCode,
  onOpenTerminal,
  onSelectProject,
  onBatchRun,
}: MorningCodexProps) {
  const [gitInfoMap, setGitInfoMap] = useState<Record<string, GitInfo>>({});
  const [runningProcesses, setRunningProcesses] = useState<RunningProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [killConfirm, setKillConfirm] = useState<{ pid: number; port: number; name?: string; projectPath?: string } | null>(null);
  const [morningRoutineOpen, setMorningRoutineOpen] = useState(false);

  // 핀된 프로젝트 또는 최근 열어본 프로젝트 (메모이제이션)
  const focusProjects = useMemo(() => {
    return projects
      .filter(p => p.pinned || p.lastOpened)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const aTime = a.lastOpened ? new Date(a.lastOpened).getTime() : 0;
        const bTime = b.lastOpened ? new Date(b.lastOpened).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [projects]);

  // 시간대에 따른 인사말
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return { text: '좋은 아침이야', icon: Sunrise, period: 'morning' };
    } else if (hour >= 12 && hour < 17) {
      return { text: '오후도 화이팅', icon: Sun, period: 'afternoon' };
    } else if (hour >= 17 && hour < 21) {
      return { text: '저녁 개발 시작', icon: Sunset, period: 'evening' };
    } else {
      return { text: '야간 코딩 모드', icon: Moon, period: 'night' };
    }
  };

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  // focusProjects의 ID 목록 (의존성 비교용)
  const focusProjectIds = useMemo(() =>
    focusProjects.map(p => p.id).join(','),
    [focusProjects]
  );

  // Git 정보 가져오기
  const fetchGitInfo = useCallback(async () => {
    const gitProjects = focusProjects.filter(p => p.hasGit);
    const results: Record<string, GitInfo> = {};

    await Promise.all(
      gitProjects.map(async (project) => {
        try {
          const res = await fetch(`/api/git?path=${encodeURIComponent(project.path)}`);
          const data = await res.json();
          results[project.id] = data;
        } catch {
          results[project.id] = { isGitRepo: false };
        }
      })
    );

    setGitInfoMap(results);
  }, [focusProjectIds, focusProjects]);

  // 실행 중인 프로세스 가져오기
  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch('/api/processes');
      const data = await res.json();
      setRunningProcesses(data.processes || []);
    } catch {
      setRunningProcesses([]);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchGitInfo(), fetchProcesses()]);
      if (isMounted) setLoading(false);
    };
    loadData();

    // 30초마다 프로세스 상태 업데이트
    const interval = setInterval(fetchProcesses, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusProjectIds]);

  // 프로세스 종료 확인 요청
  const requestKillProcess = (pid: number, port: number, name?: string, projectPath?: string) => {
    setKillConfirm({ pid, port, name, projectPath });
  };

  // 프로세스 실제 종료
  const confirmKillProcess = async () => {
    if (!killConfirm) return;

    try {
      await fetch('/api/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'kill',
          pid: killConfirm.pid,
          projectPath: killConfirm.projectPath,
        }),
      });
      setRunningProcesses(prev => prev.filter(p => p.port !== killConfirm.port));
    } catch (error) {
      console.error('프로세스 종료 실패:', error);
    }
  };

  // 배치 실행 토글
  const toggleBatchSelect = (projectId: string) => {
    setSelectedForBatch(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  // 선택된 프로젝트 일괄 실행
  const runSelectedProjects = () => {
    const projectsToRun = focusProjects.filter(p => selectedForBatch.has(p.id));
    onBatchRun(projectsToRun);
    setSelectedForBatch(new Set());
  };

  // 미커밋 변경사항 개수 계산
  const getUncommittedCount = (gitInfo: GitInfo) => {
    if (!gitInfo.status) return 0;
    const { modified, added, deleted, untracked } = gitInfo.status;
    return modified.length + added.length + deleted.length + untracked.length;
  };

  // 포트와 프로젝트 매칭 (간단한 휴리스틱)
  const getProjectForPort = (port: number): Project | undefined => {
    // 8507은 현재 대시보드
    if (port === 8507) return undefined;

    // 3000번대는 Next.js/React
    const possibleProjects = projects.filter(p =>
      p.type === 'nextjs' || p.type === 'react' || p.type === 'node'
    );

    // 최근 열었거나 실행한 프로젝트 중에서 찾기
    return possibleProjects.find(p => p.lastOpened) || possibleProjects[0];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 인사말 헤더 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-transparent border border-indigo-500/20 p-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${
              greeting.period === 'morning' ? 'bg-amber-500/20' :
              greeting.period === 'afternoon' ? 'bg-yellow-500/20' :
              greeting.period === 'evening' ? 'bg-orange-500/20' :
              'bg-indigo-500/20'
            }`}>
              <GreetingIcon className={`w-6 h-6 ${
                greeting.period === 'morning' ? 'text-amber-400' :
                greeting.period === 'afternoon' ? 'text-yellow-400' :
                greeting.period === 'evening' ? 'text-orange-400' :
                'text-indigo-400'
              }`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{greeting.text}</h1>
              <p className="text-sm text-zinc-400 mt-1">
                {new Date().toLocaleDateString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </p>
            </div>
          </div>

          {/* 빠른 통계 & 액션 */}
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-zinc-400">
                <FolderOpen className="w-4 h-4" />
                <span>{projects.length}개 프로젝트</span>
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <Radio className="w-4 h-4 animate-pulse" />
                <span>{runningProcesses.length}개 실행 중</span>
              </div>
            </div>
            <button
              onClick={() => setMorningRoutineOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium text-white transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Morning Routine
            </button>
          </div>
        </div>

        {/* 배경 장식 */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -right-5 -bottom-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
      </motion.div>

      {/* 실행 중인 서버 */}
      {runningProcesses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-[#18181b] border border-[#27272a] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a]">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-green-400 animate-pulse" />
              <span className="text-sm font-medium text-white">실행 중인 서버</span>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {runningProcesses.map((process) => {
                const isCurrentDashboard = process.port === 8507;
                // 우선순위: API에서 받은 projectName > 휴리스틱 매칭 > process name
                const displayName = process.projectName || getProjectForPort(process.port)?.name || process.name || 'Unknown';

                return (
                  <div
                    key={process.port}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isCurrentDashboard
                        ? 'bg-indigo-500/10 border-indigo-500/30'
                        : 'bg-zinc-800/50 border-zinc-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        isCurrentDashboard ? 'bg-indigo-400' : 'bg-green-400'
                      } animate-pulse`} />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {isCurrentDashboard ? 'Nexus Dashboard' : displayName}
                        </p>
                        <p className="text-xs text-zinc-500">
                          localhost:{process.port}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`http://localhost:${process.port}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {!isCurrentDashboard && (
                        <button
                          onClick={() => requestKillProcess(
                            process.pid,
                            process.port,
                            displayName,
                            process.projectPath
                          )}
                          className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="프로세스 종료"
                        >
                          <StopCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* 작업 중인 프로젝트들 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl bg-[#18181b] border border-[#27272a] overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a]">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-white">작업 프로젝트</span>
          </div>
          {selectedForBatch.size > 0 && (
            <button
              onClick={runSelectedProjects}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-medium text-white transition-colors"
            >
              <Play className="w-3 h-3" />
              {selectedForBatch.size}개 일괄 실행
            </button>
          )}
        </div>

        <div className="p-4">
          {focusProjects.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <Coffee className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>핀된 프로젝트가 없어요</p>
              <p className="text-xs mt-1">프로젝트에서 별표를 눌러 즐겨찾기에 추가하세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {focusProjects.map((project, index) => {
                const gitInfo = gitInfoMap[project.id];
                const uncommittedCount = gitInfo ? getUncommittedCount(gitInfo) : 0;
                const lastCommit = gitInfo?.commits?.[0];
                const isSelected = selectedForBatch.has(project.id);

                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    className={`group relative rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/50'
                        : 'bg-zinc-800/30 border-zinc-700/50 hover:bg-zinc-800/50 hover:border-zinc-600'
                    }`}
                  >
                    {/* 체크박스 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBatchSelect(project.id);
                      }}
                      className={`absolute top-3 left-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-indigo-500 border-indigo-500'
                          : 'border-zinc-600 group-hover:border-zinc-500'
                      }`}
                    >
                      {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                    </button>

                    <div className="p-4 pl-10" onClick={() => onSelectProject(project)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white truncate">
                              {project.name}
                            </h3>
                            {project.pinned && (
                              <span className="text-amber-400 text-xs">★</span>
                            )}
                          </div>

                          {/* Git 정보 */}
                          {gitInfo?.isGitRepo && (
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              <span className="flex items-center gap-1 text-cyan-400">
                                <GitBranch className="w-3 h-3" />
                                {gitInfo.currentBranch}
                              </span>
                              {uncommittedCount > 0 && (
                                <span className="flex items-center gap-1 text-amber-400">
                                  <AlertCircle className="w-3 h-3" />
                                  {uncommittedCount}개 변경
                                </span>
                              )}
                              {gitInfo.ahead && gitInfo.ahead > 0 && (
                                <span className="text-green-400">↑{gitInfo.ahead}</span>
                              )}
                              {gitInfo.behind && gitInfo.behind > 0 && (
                                <span className="text-red-400">↓{gitInfo.behind}</span>
                              )}
                            </div>
                          )}

                          {/* 마지막 커밋 */}
                          {lastCommit && (
                            <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                              <GitCommit className="w-3 h-3" />
                              <span className="truncate max-w-[200px]">{lastCommit.message}</span>
                              <span className="flex-shrink-0">{lastCommit.relativeDate}</span>
                            </div>
                          )}
                        </div>

                        {/* 액션 버튼들 */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRunProject(project);
                            }}
                            className="p-2 text-zinc-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                            title="실행"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenVSCode(project);
                            }}
                            className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                            title="VSCode"
                          >
                            <Code2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenTerminal(project);
                            }}
                            className="p-2 text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                            title="터미널"
                          >
                            <Terminal className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* 실시간 파일 변경 피드 */}
      {focusProjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <FileActivityFeed
            projectPaths={focusProjects.map(p => p.path)}
            enabled={true}
          />
        </motion.div>
      )}

      {/* 오늘의 개발 팁 (가볍게) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30 text-xs text-zinc-500"
      >
        <Coffee className="w-4 h-4 text-amber-500/50" />
        <span>
          {greeting.period === 'morning' && '오늘도 좋은 코드 작성하자. Ctrl+Shift+F로 코드 검색!'}
          {greeting.period === 'afternoon' && '점심 먹었어? 커밋 전에 테스트 한번 더!'}
          {greeting.period === 'evening' && '저녁엔 리팩토링하기 좋은 시간이야.'}
          {greeting.period === 'night' && '야간 코딩은 버그를 부른다. 푹 자고 내일 하자!'}
        </span>
      </motion.div>

      {/* 프로세스 종료 확인 다이얼로그 */}
      <ConfirmDialog
        open={killConfirm !== null}
        onClose={() => setKillConfirm(null)}
        onConfirm={confirmKillProcess}
        title="프로세스 종료"
        message={`${killConfirm?.name || `포트 ${killConfirm?.port}`} 서버를 종료하시겠습니까?\n\n⚠️ 같은 터미널에서 실행된 다른 프로세스도 함께 종료될 수 있습니다.`}
        confirmText="종료"
        cancelText="취소"
        variant="danger"
      />

      {/* Morning Routine 모달 */}
      <MorningRoutineModal
        open={morningRoutineOpen}
        onClose={() => setMorningRoutineOpen(false)}
        projects={projects}
      />
    </div>
  );
}
