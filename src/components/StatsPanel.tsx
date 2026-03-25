'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Download } from 'lucide-react';
import { useStats } from '@/hooks/useStats';
import ActivityHeatmap from './ActivityHeatmap';
import StreakDisplay from './StreakDisplay';
import BadgeDisplay from './BadgeDisplay';
import DependencyHealth from './DependencyHealth';
import WeeklyReport from './WeeklyReport';
import { Project } from '@/lib/types';

interface StatsPanelProps {
  projects?: Project[];
}

export default function StatsPanel({ projects = [] }: StatsPanelProps) {
  const { data, loading, error, refetch } = useStats();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ totalCommits: number; daysImported: number } | null>(null);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch('/api/stats/import', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        refetch();
      }
    } catch (err) {
      console.warn('Import failed:', err);
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-zinc-500">
        통계를 불러올 수 없습니다
      </div>
    );
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}분`;
    return `${hours}시간 ${mins}분`;
  };

  return (
    <div className="p-6 space-y-8">
      {/* 스트릭 */}
      <section>
        <h3 className="text-lg font-bold text-zinc-200 mb-4 flex items-center gap-2">
          <span>🔥</span> 연속 작업
        </h3>
        <StreakDisplay
          current={data.streak.current}
          longest={data.streak.longest}
        />
      </section>

      {/* 이번 주 요약 */}
      <section>
        <h3 className="text-lg font-bold text-zinc-200 mb-4 flex items-center gap-2">
          <span>📊</span> 이번 주 활동
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20"
          >
            <div className="text-2xl font-bold text-blue-400">{data.stats.weekDays}</div>
            <div className="text-xs text-zinc-500">활동일</div>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20"
          >
            <div className="text-2xl font-bold text-emerald-400">{data.stats.weekCommits}</div>
            <div className="text-xs text-zinc-500">커밋</div>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20"
          >
            <div className="text-2xl font-bold text-purple-400">
              {formatMinutes(data.stats.weekMinutes)}
            </div>
            <div className="text-xs text-zinc-500">작업 시간</div>
          </motion.div>
        </div>
      </section>

      {/* 총 통계 */}
      <section>
        <h3 className="text-lg font-bold text-zinc-200 mb-4 flex items-center gap-2">
          <span>📈</span> 전체 통계
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <div className="text-lg font-bold text-zinc-200">{data.stats.totalDays}</div>
            <div className="text-xs text-zinc-500">총 활동일</div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <div className="text-lg font-bold text-zinc-200">{data.stats.totalCommits}</div>
            <div className="text-xs text-zinc-500">총 커밋</div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <div className="text-lg font-bold text-zinc-200">{data.stats.totalFileChanges}</div>
            <div className="text-xs text-zinc-500">총 파일 변경</div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <div className="text-lg font-bold text-zinc-200">
              {formatMinutes(data.stats.totalMinutes)}
            </div>
            <div className="text-xs text-zinc-500">총 작업 시간</div>
          </div>
        </div>
      </section>

      {/* 주간 리포트 */}
      <section>
        <WeeklyReport projects={projects} />
      </section>

      {/* 활동 히트맵 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-zinc-200 flex items-center gap-2">
            <span>🌱</span> 활동 히트맵
          </h3>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs text-zinc-300 transition-colors"
          >
            {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {importing ? '가져오는 중...' : '과거 데이터 가져오기'}
          </button>
        </div>
        {importResult && (
          <div className="mb-3 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">
            {importResult.daysImported}일, {importResult.totalCommits}개 커밋 가져옴
          </div>
        )}
        <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 overflow-x-auto">
          <ActivityHeatmap data={data.activity} />
        </div>
      </section>

      {/* 뱃지 */}
      <section>
        <h3 className="text-lg font-bold text-zinc-200 mb-4 flex items-center gap-2">
          <span>🏅</span> 뱃지
        </h3>
        <BadgeDisplay earnedBadges={data.badges} />
      </section>

      {/* 의존성 건강 체크 */}
      {projects.length > 0 && (
        <section>
          <DependencyHealth projects={projects} />
        </section>
      )}
    </div>
  );
}
