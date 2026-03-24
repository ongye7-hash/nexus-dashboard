'use client';

import { useState, useEffect, useCallback } from 'react';

interface DailyActivity {
  date: string;
  commit_count: number;
  file_changes: number;
  total_minutes: number;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earned_at: string | null;
}

interface Stats {
  totalDays: number;
  totalCommits: number;
  totalMinutes: number;
  totalFileChanges: number;
  weekCommits: number;
  weekMinutes: number;
  weekDays: number;
}

interface StatsData {
  streak: {
    current: number;
    longest: number;
    lastActiveDate: string;
  };
  badges: Badge[];
  newBadges: Badge[];
  activity: DailyActivity[];
  stats: Stats;
}

export function useStats() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const json = await res.json();
      setData(json);
      setError(null);

      // 새로 획득한 뱃지가 있으면 알림
      if (json.newBadges && json.newBadges.length > 0) {
        json.newBadges.forEach((badge: Badge) => {
          // toast 알림 표시 (toast 시스템이 있다면)
          console.log('🏆 새 뱃지 획득:', badge.name);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // 활동 기록
  const recordActivity = useCallback(async (
    type: 'project_open' | 'commit' | 'file_change',
    count: number = 1
  ) => {
    try {
      const res = await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record', type, count })
      });

      if (!res.ok) throw new Error('Failed to record activity');

      const json = await res.json();

      // 새 뱃지 획득 시 알림
      if (json.newBadges && json.newBadges.length > 0) {
        json.newBadges.forEach((badge: Badge) => {
          console.log('🏆 새 뱃지 획득:', badge.name);
        });
      }

      // 데이터 새로고침
      fetchStats();

      return json;
    } catch (err) {
      console.error('Failed to record activity:', err);
      throw err;
    }
  }, [fetchStats]);

  useEffect(() => {
    fetchStats();

    // 5분마다 자동 새로고침
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    data,
    loading,
    error,
    refetch: fetchStats,
    recordActivity
  };
}
