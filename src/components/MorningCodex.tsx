'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Zap, Coffee, Play } from 'lucide-react';
import { Project } from '@/lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import FileActivityFeed from './FileActivityFeed';
import MorningRoutineModal from './MorningRoutineModal';

// 서브 컴포넌트
import GreetingHeader from './codex/GreetingHeader';
import AlertsPanel, { AlertItem } from './codex/AlertsPanel';
import RunningServers from './codex/RunningServers';
import FocusProjectCard from './codex/FocusProjectCard';

// ============ Types ============

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

interface RunningProcess {
  port: number;
  pid: number;
  name?: string;
  projectPath?: string;
  projectName?: string;
}

interface YesterdayRecap {
  commits: number;
  projects: number;
  minutes: number;
}

interface StreakInfo {
  current: number;
  longest: number;
  lastActiveDate: string;
}

interface ActiveSession {
  id: number;
  project_path: string;
  started_at: string;
}

interface QuickCommitState {
  message: string;
  loading: boolean;
  aiLoading: boolean;
  result: { success: boolean; text: string } | null;
}

interface MorningCodexProps {
  projects: Project[];
  onRunProject: (project: Project) => void;
  onOpenVSCode: (project: Project) => void;
  onOpenTerminal: (project: Project) => void;
  onSelectProject: (project: Project) => void;
  onBatchRun: (projects: Project[]) => void;
}

// ============ Component ============

export function MorningCodex({
  projects, onRunProject, onOpenVSCode, onOpenTerminal, onSelectProject, onBatchRun,
}: MorningCodexProps) {
  // State
  const [gitInfoMap, setGitInfoMap] = useState<Record<string, GitInfo>>({});
  const [runningProcesses, setRunningProcesses] = useState<RunningProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [killConfirm, setKillConfirm] = useState<{ pid: number; port: number; name?: string; projectPath?: string } | null>(null);
  const [morningRoutineOpen, setMorningRoutineOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [yesterdayRecap, setYesterdayRecap] = useState<YesterdayRecap | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [resumingProjects, setResumingProjects] = useState<Set<string>>(new Set());
  const [quickCommitMap, setQuickCommitMap] = useState<Record<string, QuickCommitState>>({});
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [timerTick, setTimerTick] = useState(0);

  // Focus projects
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

  const focusProjectIds = useMemo(() => focusProjects.map(p => p.id).join(','), [focusProjects]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { period: 'morning' };
    if (hour >= 12 && hour < 17) return { period: 'afternoon' };
    if (hour >= 17 && hour < 21) return { period: 'evening' };
    return { period: 'night' };
  };
  const greeting = getGreeting();

  // ============ Data Fetching ============

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
    return results;
  }, [focusProjectIds, focusProjects]);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch('/api/processes');
      const data = await res.json();
      setRunningProcesses(data.processes || []);
    } catch {
      setRunningProcesses([]);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return;
      const data = await res.json();
      if (data.streak) {
        setStreak({ current: data.streak.current || 0, longest: data.streak.longest || 0, lastActiveDate: data.streak.lastActiveDate || '' });
      }
      if (data.activity && Array.isArray(data.activity)) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const yesterdayData = data.activity.find((d: { date: string }) => d.date === yesterdayStr);
        setYesterdayRecap(yesterdayData
          ? { commits: yesterdayData.commit_count || 0, projects: yesterdayData.project_count || 0, minutes: yesterdayData.total_minutes || 0 }
          : { commits: 0, projects: 0, minutes: 0 });
      }
    } catch { /* 조용히 실패 */ }
  }, []);

  const fetchActiveSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/work-sessions');
      if (!res.ok) return;
      const data = await res.json();
      setActiveSessions(data.activeSessions || []);
    } catch {
      setActiveSessions([]);
    }
  }, []);

  // Build alerts from git data
  const buildAlerts = useCallback((gitResults: Record<string, GitInfo>) => {
    const newAlerts: AlertItem[] = [];
    for (const project of focusProjects) {
      const gitInfo = gitResults[project.id];
      if (!gitInfo?.isGitRepo || !gitInfo.status) continue;
      const { modified, added, deleted, untracked } = gitInfo.status;
      const count = modified.length + added.length + deleted.length + untracked.length;
      if (count > 0) {
        newAlerts.push({ id: `uncommitted-${project.id}`, type: 'uncommitted', severity: count > 10 ? 'danger' : 'warning', title: project.name, message: `${count}개 미커밋 변경사항`, projectId: project.id });
      }
      if (gitInfo.ahead && gitInfo.ahead > 0) {
        newAlerts.push({ id: `unpushed-${project.id}`, type: 'unpushed', severity: 'info', title: project.name, message: `${gitInfo.ahead}개 커밋이 push 되지 않음`, projectId: project.id });
      }
    }
    if (streak && streak.current > 0) {
      const today = new Date().toISOString().split('T')[0];
      if (streak.lastActiveDate !== today) {
        newAlerts.push({ id: 'streak-warning', type: 'streak', severity: 'danger', title: '스트릭 위험', message: `${streak.current}일 스트릭이 오늘 끊길 수 있어요!` });
      }
    }
    setAlerts(newAlerts);
  }, [focusProjects, streak]);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      const [gitResults] = await Promise.all([fetchGitInfo(), fetchProcesses(), fetchStats(), fetchActiveSessions()]);
      if (isMounted) {
        buildAlerts(gitResults);
        setLoading(false);
      }
    };
    loadData();
    const interval = setInterval(fetchProcesses, 30000);
    return () => { isMounted = false; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusProjectIds]);

  // Streak alert rebuild
  useEffect(() => {
    if (Object.keys(gitInfoMap).length > 0) buildAlerts(gitInfoMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak]);

  // Timer tick
  useEffect(() => {
    if (activeSessions.length === 0) return;
    const interval = setInterval(() => setTimerTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, [activeSessions.length]);

  // ============ Handlers ============

  const confirmKillProcess = async () => {
    if (!killConfirm) return;
    try {
      await fetch('/api/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kill', pid: killConfirm.pid, projectPath: killConfirm.projectPath }),
      });
      setRunningProcesses(prev => prev.filter(p => p.port !== killConfirm.port));
    } catch (error) {
      console.warn('프로세스 종료 실패:', error);
    }
  };

  const handleResume = async (project: Project) => {
    setResumingProjects(prev => new Set([...prev, project.id]));
    try {
      await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'openVSCode', path: project.path }) });
      await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'runProject', path: project.path }) });
      try { await fetch('/api/work-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', projectPath: project.path }) }); } catch { /* graceful */ }
      setTimeout(fetchProcesses, 2000);
    } catch (error) {
      console.warn('Resume 실패:', error);
    } finally {
      setResumingProjects(prev => { const next = new Set(prev); next.delete(project.id); return next; });
    }
  };

  const fetchAiCommitMessage = async (project: Project) => {
    setQuickCommitMap(prev => ({ ...prev, [project.id]: { ...prev[project.id], aiLoading: true } }));
    try {
      const res = await fetch('/api/commit-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectPath: project.path, useAI: true }) });
      const data = await res.json();
      if (data.success && data.message) {
        setQuickCommitMap(prev => ({ ...prev, [project.id]: { ...prev[project.id], message: data.message, aiLoading: false } }));
      } else {
        setQuickCommitMap(prev => ({ ...prev, [project.id]: { ...prev[project.id], aiLoading: false } }));
      }
    } catch {
      setQuickCommitMap(prev => ({ ...prev, [project.id]: { ...prev[project.id], aiLoading: false } }));
    }
  };

  const toggleQuickCommit = (project: Project) => {
    if (expandedCommit === project.id) { setExpandedCommit(null); return; }
    setExpandedCommit(project.id);
    if (!quickCommitMap[project.id]) {
      setQuickCommitMap(prev => ({ ...prev, [project.id]: { message: '', loading: false, aiLoading: false, result: null } }));
      fetchAiCommitMessage(project);
    }
  };

  const handleQuickCommit = async (project: Project, andPush: boolean) => {
    const state = quickCommitMap[project.id];
    if (!state || !state.message.trim()) return;
    setQuickCommitMap(prev => ({ ...prev, [project.id]: { ...prev[project.id], loading: true, result: null } }));
    try {
      const commitRes = await fetch('/api/git', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'commit', path: project.path, message: state.message.trim() }) });
      const commitData = await commitRes.json();
      if (!commitRes.ok || commitData.error) {
        setQuickCommitMap(prev => ({ ...prev, [project.id]: { ...prev[project.id], loading: false, result: { success: false, text: commitData.error || 'Commit failed' } } }));
        return;
      }
      if (andPush) {
        const pushRes = await fetch('/api/git', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'push', path: project.path }) });
        const pushData = await pushRes.json();
        if (!pushRes.ok || pushData.error) {
          setQuickCommitMap(prev => ({ ...prev, [project.id]: { ...prev[project.id], loading: false, result: { success: true, text: 'Committed, but push failed' } } }));
          fetchGitInfo();
          return;
        }
      }
      setQuickCommitMap(prev => ({ ...prev, [project.id]: { ...prev[project.id], loading: false, message: '', result: { success: true, text: andPush ? 'Commit & Push 완료!' : 'Commit 완료!' } } }));
      fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'record', type: 'commit' }) }).catch(() => {});
      fetchGitInfo();
      setTimeout(() => { setExpandedCommit(null); setQuickCommitMap(prev => { const next = { ...prev }; delete next[project.id]; return next; }); }, 2000);
    } catch {
      setQuickCommitMap(prev => ({ ...prev, [project.id]: { ...prev[project.id], loading: false, result: { success: false, text: 'Network error' } } }));
    }
  };

  // ============ Render ============

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. 인사말 + 스트릭 + 어제 요약 */}
      <GreetingHeader
        projectCount={projects.length}
        runningCount={runningProcesses.length}
        streak={streak}
        yesterdayRecap={yesterdayRecap}
        onOpenMorningRoutine={() => setMorningRoutineOpen(true)}
      />

      {/* 2. 알림 */}
      <AlertsPanel
        alerts={alerts}
        dismissedAlerts={dismissedAlerts}
        onDismiss={(id) => setDismissedAlerts(prev => new Set([...prev, id]))}
      />

      {/* 3. 실행 중인 서버 */}
      <RunningServers
        processes={runningProcesses}
        onKillProcess={(pid, port, name, projectPath) => setKillConfirm({ pid, port, name, projectPath })}
      />

      {/* 4. 작업 프로젝트 */}
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
              onClick={() => { onBatchRun(focusProjects.filter(p => selectedForBatch.has(p.id))); setSelectedForBatch(new Set()); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-medium text-white transition-colors"
            >
              <Play className="w-3 h-3" />{selectedForBatch.size}개 일괄 실행
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
              {focusProjects.map((project, index) => (
                <FocusProjectCard
                  key={project.id}
                  project={project}
                  index={index}
                  gitInfo={gitInfoMap[project.id]}
                  isSelected={selectedForBatch.has(project.id)}
                  isResuming={resumingProjects.has(project.id)}
                  activeSession={activeSessions.find(s => s.project_path === project.path)}
                  commitState={quickCommitMap[project.id]}
                  isCommitExpanded={expandedCommit === project.id}
                  timerTick={timerTick}
                  onSelect={onSelectProject}
                  onToggleBatch={(id) => setSelectedForBatch(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
                  onResume={handleResume}
                  onRun={onRunProject}
                  onOpenVSCode={onOpenVSCode}
                  onOpenTerminal={onOpenTerminal}
                  onToggleCommit={toggleQuickCommit}
                  onCommitMessageChange={(id, msg) => setQuickCommitMap(prev => ({ ...prev, [id]: { ...prev[id], message: msg, result: null } }))}
                  onQuickCommit={handleQuickCommit}
                  onCancelCommit={() => setExpandedCommit(null)}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* 5. 파일 변경 피드 */}
      {focusProjects.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <FileActivityFeed projectPaths={focusProjects.map(p => p.path)} enabled={true} />
        </motion.div>
      )}

      {/* 6. 개발 팁 */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
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

      {/* 다이얼로그/모달 */}
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
      <MorningRoutineModal
        open={morningRoutineOpen}
        onClose={() => setMorningRoutineOpen(false)}
        projects={projects}
      />
    </div>
  );
}
