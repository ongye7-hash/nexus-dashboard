import { getDb } from './index';

// ============ 일일 활동 (잔디 히트맵) ============

export interface DailyActivity {
  date: string;
  total_minutes: number;
  project_count: number;
  commit_count: number;
  file_changes: number;
}

export function getDailyActivity(days: number = 365): DailyActivity[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM daily_activity
    WHERE date >= date('now', '-' || ? || ' days')
    ORDER BY date ASC
  `).all(days) as DailyActivity[];
}

export function updateDailyActivity(updates: Partial<Omit<DailyActivity, 'date'>>) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const existing = db.prepare('SELECT * FROM daily_activity WHERE date = ?').get(today) as DailyActivity | undefined;

  if (existing) {
    db.prepare(`
      UPDATE daily_activity SET
        total_minutes = total_minutes + ?,
        project_count = ?,
        commit_count = commit_count + ?,
        file_changes = file_changes + ?
      WHERE date = ?
    `).run(
      updates.total_minutes || 0,
      updates.project_count || existing.project_count,
      updates.commit_count || 0,
      updates.file_changes || 0,
      today
    );
  } else {
    db.prepare(`
      INSERT INTO daily_activity (date, total_minutes, project_count, commit_count, file_changes)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      today,
      updates.total_minutes || 0,
      updates.project_count || 0,
      updates.commit_count || 0,
      updates.file_changes || 0
    );
  }
}

export function recordActivity(type: 'project_open' | 'commit' | 'file_change', count: number = 1) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // 오늘 기록이 없으면 생성
  db.prepare(`
    INSERT OR IGNORE INTO daily_activity (date, total_minutes, project_count, commit_count, file_changes)
    VALUES (?, 0, 0, 0, 0)
  `).run(today);

  // 활동 유형에 따라 업데이트
  switch (type) {
    case 'project_open':
      db.prepare('UPDATE daily_activity SET project_count = project_count + ? WHERE date = ?').run(count, today);
      break;
    case 'commit':
      db.prepare('UPDATE daily_activity SET commit_count = commit_count + ? WHERE date = ?').run(count, today);
      break;
    case 'file_change':
      db.prepare('UPDATE daily_activity SET file_changes = file_changes + ? WHERE date = ?').run(count, today);
      break;
  }
}

// ============ 사용자 통계 (스트릭) ============

export function getUserStat(key: string): string | undefined {
  const db = getDb();
  const result = db.prepare('SELECT value FROM user_stats WHERE key = ?').get(key) as { value: string } | undefined;
  return result?.value;
}

export function setUserStat(key: string, value: string) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO user_stats (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(key, value);
}

export function getStreak(): { current: number; longest: number; lastActiveDate: string } {
  const currentStr = getUserStat('current_streak') || '0';
  const longestStr = getUserStat('longest_streak') || '0';
  const lastActive = getUserStat('last_active_date') || '';

  return {
    current: parseInt(currentStr, 10),
    longest: parseInt(longestStr, 10),
    lastActiveDate: lastActive,
  };
}

export function updateStreak() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const streak = getStreak();

  if (streak.lastActiveDate === today) {
    // 오늘 이미 기록됨
    return streak;
  }

  let newCurrent = 1;

  if (streak.lastActiveDate === yesterday) {
    // 어제도 활동함 - 연속 유지
    newCurrent = streak.current + 1;
  }
  // 그 외 (어제 활동 안함) - 스트릭 리셋, 오늘부터 1

  const newLongest = Math.max(streak.longest, newCurrent);

  setUserStat('current_streak', String(newCurrent));
  setUserStat('longest_streak', String(newLongest));
  setUserStat('last_active_date', today);

  return { current: newCurrent, longest: newLongest, lastActiveDate: today };
}

// ============ 뱃지 시스템 ============

export interface Badge {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  earned_at: string;
  category: string;
}

export function getAllBadges(): Badge[] {
  const db = getDb();
  return db.prepare('SELECT * FROM badges ORDER BY earned_at DESC').all() as Badge[];
}

export function hasBadge(badgeId: string): boolean {
  const db = getDb();
  const result = db.prepare('SELECT id FROM badges WHERE id = ?').get(badgeId);
  return !!result;
}

export function awardBadge(badge: Omit<Badge, 'earned_at'>) {
  const db = getDb();
  if (hasBadge(badge.id)) return false; // 이미 있음

  db.prepare(`
    INSERT INTO badges (id, name, description, icon, category)
    VALUES (?, ?, ?, ?, ?)
  `).run(badge.id, badge.name, badge.description || null, badge.icon || null, badge.category);

  return true;
}

// 뱃지 체크 및 자동 부여
export function checkAndAwardBadges() {
  const awarded: Badge[] = [];
  const streak = getStreak();
  const activity = getDailyActivity(365);
  const totalDays = activity.length;
  const totalCommits = activity.reduce((sum, d) => sum + d.commit_count, 0);

  // 스트릭 뱃지들
  if (streak.current >= 7 && awardBadge({ id: 'streak_7', name: '일주일 연속', description: '7일 연속 개발', icon: '🔥', category: 'streak' })) {
    awarded.push({ id: 'streak_7', name: '일주일 연속', description: '7일 연속 개발', icon: '🔥', category: 'streak', earned_at: new Date().toISOString() });
  }
  if (streak.current >= 30 && awardBadge({ id: 'streak_30', name: '한 달 연속', description: '30일 연속 개발', icon: '💪', category: 'streak' })) {
    awarded.push({ id: 'streak_30', name: '한 달 연속', description: '30일 연속 개발', icon: '💪', category: 'streak', earned_at: new Date().toISOString() });
  }
  if (streak.current >= 100 && awardBadge({ id: 'streak_100', name: '백일 연속', description: '100일 연속 개발', icon: '🏆', category: 'streak' })) {
    awarded.push({ id: 'streak_100', name: '백일 연속', description: '100일 연속 개발', icon: '🏆', category: 'streak', earned_at: new Date().toISOString() });
  }

  // 커밋 뱃지들
  if (totalCommits >= 100 && awardBadge({ id: 'commits_100', name: '커밋 100개', description: '총 100개 커밋 달성', icon: '📝', category: 'commits' })) {
    awarded.push({ id: 'commits_100', name: '커밋 100개', description: '총 100개 커밋 달성', icon: '📝', category: 'commits', earned_at: new Date().toISOString() });
  }
  if (totalCommits >= 500 && awardBadge({ id: 'commits_500', name: '커밋 500개', description: '총 500개 커밋 달성', icon: '🚀', category: 'commits' })) {
    awarded.push({ id: 'commits_500', name: '커밋 500개', description: '총 500개 커밋 달성', icon: '🚀', category: 'commits', earned_at: new Date().toISOString() });
  }

  // 활동일 뱃지들
  if (totalDays >= 30 && awardBadge({ id: 'active_30', name: '30일 활동', description: '총 30일 개발 활동', icon: '📅', category: 'activity' })) {
    awarded.push({ id: 'active_30', name: '30일 활동', description: '총 30일 개발 활동', icon: '📅', category: 'activity', earned_at: new Date().toISOString() });
  }
  if (totalDays >= 100 && awardBadge({ id: 'active_100', name: '100일 활동', description: '총 100일 개발 활동', icon: '🎯', category: 'activity' })) {
    awarded.push({ id: 'active_100', name: '100일 활동', description: '총 100일 개발 활동', icon: '🎯', category: 'activity', earned_at: new Date().toISOString() });
  }

  return awarded;
}

// ============ 크로스 프로젝트 인사이트 ============

export function getWeeklyReport(): {
  totalMinutes: number;
  totalCommits: number;
  totalFileChanges: number;
  activeDays: number;
  dailyBreakdown: DailyActivity[];
} {
  const db = getDb();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekStr = oneWeekAgo.toISOString().split('T')[0];

  const days = db.prepare('SELECT * FROM daily_activity WHERE date >= ? ORDER BY date ASC').all(weekStr) as DailyActivity[];

  return {
    totalMinutes: days.reduce((s, d) => s + d.total_minutes, 0),
    totalCommits: days.reduce((s, d) => s + d.commit_count, 0),
    totalFileChanges: days.reduce((s, d) => s + d.file_changes, 0),
    activeDays: days.length,
    dailyBreakdown: days,
  };
}
