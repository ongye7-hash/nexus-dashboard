'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  Flame,
  ArrowUpCircle,
  ListTodo,
  Info,
  AlertTriangle,
  X,
  Send,
  Loader2,
  Timer,
  Rocket,
} from 'lucide-react';
import { Project } from '@/lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import FileActivityFeed from './FileActivityFeed';
import MorningRoutineModal from './MorningRoutineModal';

// ============ Types ============

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

interface AlertItem {
  id: string;
  type: 'uncommitted' | 'unpushed' | 'streak' | 'todos';
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  projectId?: string;
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
  projects,
  onRunProject,
  onOpenVSCode,
  onOpenTerminal,
  onSelectProject,
  onBatchRun,
}: MorningCodexProps) {
  // Existing state
  const [gitInfoMap, setGitInfoMap] = useState<Record<string, GitInfo>>({});
  const [runningProcesses, setRunningProcesses] = useState<RunningProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [killConfirm, setKillConfirm] = useState<{ pid: number; port: number; name?: string; projectPath?: string } | null>(null);
  const [morningRoutineOpen, setMorningRoutineOpen] = useState(false);

  // New state: Alerts
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // New state: Yesterday recap
  const [yesterdayRecap, setYesterdayRecap] = useState<YesterdayRecap | null>(null);

  // New state: Streak
  const [streak, setStreak] = useState<StreakInfo | null>(null);

  // New state: Resume loading states
  const [resumingProjects, setResumingProjects] = useState<Set<string>>(new Set());

  // New state: Quick commit per project
  const [quickCommitMap, setQuickCommitMap] = useState<Record<string, QuickCommitState>>({});
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);

  // New state: Active work sessions
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);

  // Timer tick for live elapsed display
  const [timerTick, setTimerTick] = useState(0);

  // Focus projects (existing logic)
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

  // Greeting (existing)
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

  const focusProjectIds = useMemo(() =>
    focusProjects.map(p => p.id).join(','),
    [focusProjects]
  );

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

  // Fetch stats for streak + yesterday recap
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return;
      const data = await res.json();

      // Streak
      if (data.streak) {
        setStreak({
          current: data.streak.current || 0,
          longest: data.streak.longest || 0,
          lastActiveDate: data.streak.lastActiveDate || '',
        });
      }

      // Yesterday recap from activity data
      if (data.activity && Array.isArray(data.activity)) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const yesterdayData = data.activity.find((d: { date: string }) => d.date === yesterdayStr);

        if (yesterdayData) {
          setYesterdayRecap({
            commits: yesterdayData.commit_count || 0,
            projects: yesterdayData.project_count || 0,
            minutes: yesterdayData.total_minutes || 0,
          });
        } else {
          setYesterdayRecap({ commits: 0, projects: 0, minutes: 0 });
        }
      }
    } catch {
      // Silently fail
    }
  }, []);

  // Fetch active work sessions
  const fetchActiveSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/work-sessions');
      if (!res.ok) return;
      const data = await res.json();
      setActiveSessions(data.sessions || []);
    } catch {
      // API may not exist - gracefully handle
      setActiveSessions([]);
    }
  }, []);

  // Build alerts from existing data
  const buildAlerts = useCallback((gitResults: Record<string, GitInfo>) => {
    const newAlerts: AlertItem[] = [];

    // Uncommitted changes per project
    for (const project of focusProjects) {
      const gitInfo = gitResults[project.id];
      if (!gitInfo?.isGitRepo || !gitInfo.status) continue;

      const { modified, added, deleted, untracked } = gitInfo.status;
      const uncommittedCount = modified.length + added.length + deleted.length + untracked.length;

      if (uncommittedCount > 0) {
        newAlerts.push({
          id: `uncommitted-${project.id}`,
          type: 'uncommitted',
          severity: uncommittedCount > 10 ? 'danger' : 'warning',
          title: project.name,
          message: `${uncommittedCount}개 미커밋 변경사항`,
          projectId: project.id,
        });
      }

      // Unpushed commits
      if (gitInfo.ahead && gitInfo.ahead > 0) {
        newAlerts.push({
          id: `unpushed-${project.id}`,
          type: 'unpushed',
          severity: 'info',
          title: project.name,
          message: `${gitInfo.ahead}개 커밋이 push 되지 않음`,
          projectId: project.id,
        });
      }
    }

    // Streak warning
    if (streak) {
      const today = new Date().toISOString().split('T')[0];
      if (streak.lastActiveDate !== today && streak.current >= 7) {
        newAlerts.push({
          id: 'streak-warning',
          type: 'streak',
          severity: 'danger',
          title: '스트릭 위험!',
          message: `${streak.current}일 연속 기록이 오늘 끊길 수 있어요!`,
        });
      }
    }

    setAlerts(newAlerts);
  }, [focusProjects, streak]);

  // Fetch pending TODOs and add to alerts
  const fetchTodosAlert = useCallback(async () => {
    try {
      // Use the same pattern as other fetches - check all focus projects for todos
      let totalPending = 0;
      for (const project of focusProjects) {
        try {
          const res = await fetch(`/api/files?path=${encodeURIComponent(project.path)}&type=todos`);
          if (res.ok) {
            const data = await res.json();
            if (data.pending) totalPending += data.pending;
          }
        } catch {
          // Skip
        }
      }

      if (totalPending > 0) {
        setAlerts(prev => {
          // Remove old todo alert, add new one
          const filtered = prev.filter(a => a.type !== 'todos');
          return [...filtered, {
            id: 'todos-pending',
            type: 'todos',
            severity: totalPending > 10 ? 'warning' : 'info',
            title: '할 일',
            message: `${totalPending}개의 미완료 TODO가 있어요`,
          }];
        });
      }
    } catch {
      // Silently fail
    }
  }, [focusProjects]);

  // ============ Effects ============

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      const [gitResults] = await Promise.all([
        fetchGitInfo(),
        fetchProcesses(),
        fetchStats(),
        fetchActiveSessions(),
      ]);
      if (isMounted) {
        buildAlerts(gitResults);
        setLoading(false);
      }
    };
    loadData();
    fetchTodosAlert();

    const interval = setInterval(fetchProcesses, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusProjectIds]);

  // Rebuild alerts when streak data arrives
  useEffect(() => {
    if (streak && Object.keys(gitInfoMap).length > 0) {
      buildAlerts(gitInfoMap);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak]);

  // Timer tick for active sessions
  useEffect(() => {
    if (activeSessions.length === 0) return;
    const interval = setInterval(() => setTimerTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, [activeSessions.length]);

  // ============ Handlers ============

  // Existing handlers
  const requestKillProcess = (pid: number, port: number, name?: string, projectPath?: string) => {
    setKillConfirm({ pid, port, name, projectPath });
  };

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

  const runSelectedProjects = () => {
    const projectsToRun = focusProjects.filter(p => selectedForBatch.has(p.id));
    onBatchRun(projectsToRun);
    setSelectedForBatch(new Set());
  };

  const getUncommittedCount = (gitInfo: GitInfo) => {
    if (!gitInfo.status) return 0;
    const { modified, added, deleted, untracked } = gitInfo.status;
    return modified.length + added.length + deleted.length + untracked.length;
  };

  // 포트-프로젝트 매칭은 API에서만 수행. 클라이언트에서 추측하지 않음.

  // Dismiss alert
  const dismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => new Set([...prev, alertId]));
  };

  // Resume project: open VSCode + run + start session
  const handleResume = async (project: Project) => {
    setResumingProjects(prev => new Set([...prev, project.id]));
    try {
      // Step 1: Open VSCode
      await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'openVSCode', path: project.path }),
      });

      // Step 2: Run project
      await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'runProject', path: project.path }),
      });

      // Step 3: Start work session (may 404 if API doesn't exist)
      try {
        await fetch('/api/work-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', projectPath: project.path }),
        });
      } catch {
        // Gracefully ignore if work-sessions API doesn't exist
      }

      // Refresh processes after a brief delay
      setTimeout(fetchProcesses, 2000);
    } catch (error) {
      console.error('Resume failed:', error);
    } finally {
      setResumingProjects(prev => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
    }
  };

  // Quick commit: fetch AI suggestion
  const fetchAiCommitMessage = async (project: Project) => {
    setQuickCommitMap(prev => ({
      ...prev,
      [project.id]: { ...prev[project.id], aiLoading: true },
    }));

    try {
      const res = await fetch('/api/commit-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: project.path, useAI: true }),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setQuickCommitMap(prev => ({
          ...prev,
          [project.id]: {
            ...prev[project.id],
            message: data.message,
            aiLoading: false,
          },
        }));
      } else {
        setQuickCommitMap(prev => ({
          ...prev,
          [project.id]: { ...prev[project.id], aiLoading: false },
        }));
      }
    } catch {
      setQuickCommitMap(prev => ({
        ...prev,
        [project.id]: { ...prev[project.id], aiLoading: false },
      }));
    }
  };

  // Toggle quick commit expanded for a project
  const toggleQuickCommit = (project: Project) => {
    if (expandedCommit === project.id) {
      setExpandedCommit(null);
      return;
    }
    setExpandedCommit(project.id);

    // Initialize if not already
    if (!quickCommitMap[project.id]) {
      setQuickCommitMap(prev => ({
        ...prev,
        [project.id]: { message: '', loading: false, aiLoading: false, result: null },
      }));
      // Auto-fetch AI suggestion
      fetchAiCommitMessage(project);
    }
  };

  // Do the commit
  const handleQuickCommit = async (project: Project, andPush: boolean) => {
    const state = quickCommitMap[project.id];
    if (!state || !state.message.trim()) return;

    setQuickCommitMap(prev => ({
      ...prev,
      [project.id]: { ...prev[project.id], loading: true, result: null },
    }));

    try {
      // Commit
      const commitRes = await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          path: project.path,
          message: state.message.trim(),
        }),
      });
      const commitData = await commitRes.json();

      if (!commitRes.ok || commitData.error) {
        setQuickCommitMap(prev => ({
          ...prev,
          [project.id]: {
            ...prev[project.id],
            loading: false,
            result: { success: false, text: commitData.error || 'Commit failed' },
          },
        }));
        return;
      }

      // Push if requested
      if (andPush) {
        const pushRes = await fetch('/api/git', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'push',
            path: project.path,
          }),
        });
        const pushData = await pushRes.json();

        if (!pushRes.ok || pushData.error) {
          setQuickCommitMap(prev => ({
            ...prev,
            [project.id]: {
              ...prev[project.id],
              loading: false,
              result: { success: true, text: 'Committed, but push failed' },
            },
          }));
          // Still refresh git info
          fetchGitInfo();
          return;
        }
      }

      setQuickCommitMap(prev => ({
        ...prev,
        [project.id]: {
          ...prev[project.id],
          loading: false,
          message: '',
          result: { success: true, text: andPush ? 'Commit & Push 완료!' : 'Commit 완료!' },
        },
      }));

      // Refresh git info
      fetchGitInfo();

      // Auto-close after success
      setTimeout(() => {
        setExpandedCommit(null);
        setQuickCommitMap(prev => {
          const next = { ...prev };
          delete next[project.id];
          return next;
        });
      }, 2000);
    } catch (error) {
      setQuickCommitMap(prev => ({
        ...prev,
        [project.id]: {
          ...prev[project.id],
          loading: false,
          result: { success: false, text: 'Network error' },
        },
      }));
    }
  };

  // Helper: Format elapsed time from a start date
  const formatElapsed = (startedAt: string): string => {
    // Use timerTick to force re-render
    void timerTick;
    const start = new Date(startedAt).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Get active session for a project
  const getActiveSession = (projectPath: string): ActiveSession | undefined => {
    return activeSessions.find(s => s.project_path === projectPath);
  };

  // Severity styles
  const severityStyles = {
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      text: 'text-blue-400',
      icon: Info,
    },
    warning: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-400',
      icon: AlertTriangle,
    },
    danger: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-400',
      icon: AlertCircle,
    },
  };

  // Visible alerts (not dismissed)
  const visibleAlerts = alerts.filter(a => !dismissedAlerts.has(a.id));

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
      {/* Greeting Header + Streak */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-linear-to-br from-indigo-600/20 via-purple-600/10 to-transparent border border-indigo-500/20 p-6"
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
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">{greeting.text}</h1>
                {/* Streak Display */}
                {streak && streak.current > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/15 border border-orange-500/30 rounded-full">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-bold text-orange-400">Day {streak.current}</span>
                  </div>
                )}
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                {new Date().toLocaleDateString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </p>
            </div>
          </div>

          {/* Quick stats & actions */}
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

        {/* Background decoration */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -right-5 -bottom-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
      </motion.div>

      {/* Yesterday's Recap */}
      {yesterdayRecap && (yesterdayRecap.commits > 0 || yesterdayRecap.projects > 0 || yesterdayRecap.minutes > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/5 border border-indigo-500/15"
        >
          <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-sm text-zinc-300">
            어제: 커밋 <span className="font-semibold text-indigo-400">{yesterdayRecap.commits}</span>개,{' '}
            <span className="font-semibold text-indigo-400">{yesterdayRecap.projects}</span>개 프로젝트 작업,{' '}
            <span className="font-semibold text-indigo-400">{yesterdayRecap.minutes}</span>분 코딩
          </span>
        </motion.div>
      )}

      {/* Alerts / Insights */}
      {visibleAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-2"
        >
          <AnimatePresence mode="popLayout">
            {visibleAlerts.map((alert) => {
              const style = severityStyles[alert.severity];
              const AlertIcon = style.icon;

              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10, height: 0 }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${style.bg} ${style.border}`}
                >
                  <AlertIcon className={`w-4 h-4 shrink-0 ${style.text}`} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-semibold ${style.text}`}>{alert.title}</span>
                    <span className="text-xs text-zinc-400 ml-2">{alert.message}</span>
                  </div>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Running Servers (existing) */}
      {runningProcesses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
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
                const displayName = process.projectName || process.name || `포트 ${process.port}`;

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

      {/* Focus Projects */}
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
                const isResuming = resumingProjects.has(project.id);
                const activeSession = getActiveSession(project.path);
                const commitState = quickCommitMap[project.id];
                const isCommitExpanded = expandedCommit === project.id;

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
                    {/* Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBatchSelect(project.id);
                      }}
                      className={`absolute top-3 left-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors z-10 ${
                        isSelected
                          ? 'bg-indigo-500 border-indigo-500'
                          : 'border-zinc-600 group-hover:border-zinc-500'
                      }`}
                    >
                      {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                    </button>

                    <div className="p-4 pl-10 cursor-pointer" onClick={() => onSelectProject(project)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white truncate">
                              {project.name}
                            </h3>
                            {project.pinned && (
                              <span className="text-amber-400 text-xs">★</span>
                            )}
                            {/* Work Timer Display */}
                            {activeSession && (
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 border border-green-500/25 rounded-full">
                                <Timer className="w-3 h-3 text-green-400" />
                                <span className="text-xs font-medium text-green-400">
                                  {formatElapsed(activeSession.started_at)}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Git info */}
                          {gitInfo?.isGitRepo && (
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              <span className="flex items-center gap-1 text-cyan-400">
                                <GitBranch className="w-3 h-3" />
                                {gitInfo.currentBranch}
                              </span>
                              {uncommittedCount > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleQuickCommit(project);
                                  }}
                                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                                  title="Quick Commit"
                                >
                                  <AlertCircle className="w-3 h-3" />
                                  {uncommittedCount}개 변경
                                </button>
                              )}
                              {gitInfo.ahead && gitInfo.ahead > 0 && (
                                <span className="text-green-400">↑{gitInfo.ahead}</span>
                              )}
                              {gitInfo.behind && gitInfo.behind > 0 && (
                                <span className="text-red-400">↓{gitInfo.behind}</span>
                              )}
                            </div>
                          )}

                          {/* Last commit */}
                          {lastCommit && (
                            <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                              <GitCommit className="w-3 h-3" />
                              <span className="truncate max-w-50">{lastCommit.message}</span>
                              <span className="shrink-0">{lastCommit.relativeDate}</span>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Resume Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResume(project);
                            }}
                            disabled={isResuming}
                            className="p-2 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                            title="Resume (VSCode + Run + Session)"
                          >
                            {isResuming ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Rocket className="w-4 h-4" />
                            )}
                          </button>
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

                    {/* Quick Commit Panel */}
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
                              {/* Commit message input */}
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={commitState?.message || ''}
                                  onChange={(e) => {
                                    setQuickCommitMap(prev => ({
                                      ...prev,
                                      [project.id]: {
                                        ...prev[project.id],
                                        message: e.target.value,
                                        result: null,
                                      },
                                    }));
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      handleQuickCommit(project, false);
                                    }
                                  }}
                                  placeholder={commitState?.aiLoading ? 'AI 메시지 생성 중...' : '커밋 메시지 입력...'}
                                  disabled={commitState?.loading || commitState?.aiLoading}
                                  className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                                />
                                {commitState?.aiLoading && (
                                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                                )}
                              </div>

                              {/* Action buttons */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickCommit(project, false);
                                  }}
                                  disabled={commitState?.loading || !commitState?.message?.trim()}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors"
                                >
                                  {commitState?.loading ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <GitCommit className="w-3 h-3" />
                                  )}
                                  Commit
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickCommit(project, true);
                                  }}
                                  disabled={commitState?.loading || !commitState?.message?.trim()}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors"
                                >
                                  {commitState?.loading ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <ArrowUpCircle className="w-3 h-3" />
                                  )}
                                  Commit & Push
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedCommit(null);
                                  }}
                                  className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                  취소
                                </button>
                              </div>

                              {/* Result feedback */}
                              {commitState?.result && (
                                <motion.div
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className={`flex items-center gap-2 text-xs ${
                                    commitState.result.success ? 'text-green-400' : 'text-red-400'
                                  }`}
                                >
                                  {commitState.result.success ? (
                                    <CheckCircle className="w-3 h-3" />
                                  ) : (
                                    <XCircle className="w-3 h-3" />
                                  )}
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
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* File Activity Feed (existing) */}
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

      {/* Dev Tip (existing) */}
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

      {/* Kill Process Confirm Dialog (existing) */}
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

      {/* Morning Routine Modal (existing) */}
      <MorningRoutineModal
        open={morningRoutineOpen}
        onClose={() => setMorningRoutineOpen(false)}
        projects={projects}
      />
    </div>
  );
}
