'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  GitCommit,
  Calendar,
  Flame,
  AlertTriangle,
} from 'lucide-react';
import { Project } from '@/lib/types';

interface WeeklyReportProps {
  projects: Project[];
}

interface DailyActivity {
  date: string;
  total_minutes: number;
  project_count: number;
  commit_count: number;
  file_changes: number;
}

interface InsightsData {
  weeklyReport: {
    totalMinutes: number;
    totalCommits: number;
    totalFileChanges: number;
    activeDays: number;
    dailyBreakdown: DailyActivity[];
  };
  recentSessions: Array<{
    project_path: string;
    total_minutes: number;
    session_count: number;
  }>;
  streak: {
    current: number;
    longest: number;
    lastActiveDate: string;
  };
  todoCounts: {
    total: number;
    completed: number;
    byProject: Array<{ project_path: string; total: number; pending: number }>;
  };
  alerts: Array<{
    type: string;
    message: string;
    project?: string;
    severity: 'info' | 'warning' | 'danger';
  }>;
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}분`;
  return `${hours}시간 ${mins}분`;
}

export default function WeeklyReport({ projects }: WeeklyReportProps) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInsights() {
      try {
        const res = await fetch('/api/insights');
        if (!res.ok) throw new Error('Failed to fetch insights');
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError('인사이트를 불러올 수 없습니다');
        console.error('Insights fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchInsights();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-zinc-500">
        {error || '데이터가 없습니다'}
      </div>
    );
  }

  const { weeklyReport: weekly, recentSessions, streak, alerts } = data;

  // Compute last week stats from daily breakdown for comparison
  // The API doesn't return last week separately, so we skip comparison if no data
  const maxProjectMinutes = recentSessions.length > 0
    ? Math.max(...recentSessions.map((s) => s.total_minutes))
    : 0;

  // Build daily commits for Mon-Sun
  const dailyCommitsMap: Record<string, number> = {};
  weekly.dailyBreakdown.forEach((d) => {
    dailyCommitsMap[d.date] = d.commit_count;
  });

  // Get this week's dates (Mon-Sun)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d.toISOString().split('T')[0]);
  }

  const dailyCommits = weekDates.map((date) => dailyCommitsMap[date] || 0);
  const maxDailyCommits = Math.max(...dailyCommits, 1);

  const hasNoData = weekly.totalCommits === 0 && weekly.totalMinutes === 0 && weekly.totalFileChanges === 0;

  if (hasNoData) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <Calendar className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
        <p className="text-zinc-400 font-medium mb-1">이번 주 활동 데이터가 없습니다</p>
        <p className="text-sm text-zinc-600">프로젝트를 열고 작업을 시작하면 여기에 표시됩니다</p>
      </div>
    );
  }

  const summaryCards = [
    {
      label: '코딩 시간',
      value: formatTime(weekly.totalMinutes),
      icon: Clock,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: '총 커밋',
      value: String(weekly.totalCommits),
      icon: GitCommit,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
    {
      label: '활동일',
      value: `${weekly.activeDays} / 7`,
      icon: Calendar,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
    },
    {
      label: '파일 변경',
      value: String(weekly.totalFileChanges),
      icon: AlertTriangle,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${card.bgColor}`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              <div className="text-xl font-bold text-white">{card.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{card.label}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Alerts section */}
      {alerts && alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
        >
          <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            알림
          </h4>
          <div className="space-y-2">
            {alerts.map((alert, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                  alert.severity === 'danger'
                    ? 'bg-red-500/10 text-red-400'
                    : alert.severity === 'warning'
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-blue-500/10 text-blue-400'
                }`}
              >
                {alert.project && (
                  <span className="font-medium">{alert.project}</span>
                )}
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Daily breakdown (Mon-Sun) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
      >
        <h4 className="text-sm font-medium text-zinc-400 mb-4">일별 커밋</h4>
        <div className="flex items-end gap-2 h-24">
          {dailyCommits.map((count, idx) => {
            const height = count > 0 ? Math.max((count / maxDailyCommits) * 100, 8) : 4;
            const isToday = weekDates[idx] === today.toISOString().split('T')[0];
            return (
              <div key={weekDates[idx]} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-zinc-500">{count > 0 ? count : ''}</span>
                <div
                  className={`w-full rounded-t-md transition-all ${
                    count > 0
                      ? isToday
                        ? 'bg-indigo-500'
                        : 'bg-indigo-500/60'
                      : 'bg-zinc-800'
                  }`}
                  style={{ height: `${height}%` }}
                />
                <span className={`text-xs ${isToday ? 'text-white font-medium' : 'text-zinc-600'}`}>
                  {DAY_LABELS[idx]}
                </span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Per-project time breakdown */}
      {recentSessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
        >
          <h4 className="text-sm font-medium text-zinc-400 mb-4">프로젝트별 작업 시간</h4>
          <div className="space-y-3">
            {recentSessions.map((session) => {
              const projectName = session.project_path.split(/[/\\]/).pop() || session.project_path;
              const widthPercent = maxProjectMinutes > 0
                ? Math.max((session.total_minutes / maxProjectMinutes) * 100, 3)
                : 0;
              return (
                <div key={session.project_path} className="flex items-center gap-3">
                  <span className="text-sm text-zinc-300 w-28 truncate flex-shrink-0" title={projectName}>
                    {projectName}
                  </span>
                  <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPercent}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="h-full bg-indigo-500/70 rounded-full"
                    />
                  </div>
                  <span className="text-xs text-zinc-500 w-16 text-right flex-shrink-0">
                    {formatTime(session.total_minutes)}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Streak info */}
      {streak.current > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4"
        >
          <div className="p-2 bg-orange-500/10 rounded-lg">
            <Flame className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">{streak.current}일 연속</div>
            <div className="text-xs text-zinc-500">
              최장 기록: {streak.longest}일
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
