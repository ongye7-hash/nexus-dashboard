import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 데이터베이스 파일 경로
const DB_PATH = path.join(process.cwd(), '.nexus-data', 'nexus.db');

// 데이터베이스 디렉토리 생성
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 데이터베이스 연결 (싱글톤)
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeTables();
  }
  return db;
}

// 테이블 초기화
function initializeTables() {
  const database = db!;

  // 프로젝트 메타데이터 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_meta (
      project_path TEXT PRIMARY KEY,
      notes TEXT,
      tags TEXT,
      status TEXT DEFAULT 'development',
      pinned INTEGER DEFAULT 0,
      last_opened TEXT,
      group_id TEXT,
      deploy_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 그룹 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 포트 매핑 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS port_mappings (
      project_path TEXT PRIMARY KEY,
      port INTEGER NOT NULL,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 작업 기록 테이블 (나중에 시간 추적용)
  database.exec(`
    CREATE TABLE IF NOT EXISTS work_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_minutes INTEGER
    )
  `);

  // 일일 활동 테이블 (잔디 히트맵용)
  database.exec(`
    CREATE TABLE IF NOT EXISTS daily_activity (
      date TEXT PRIMARY KEY,
      total_minutes INTEGER DEFAULT 0,
      project_count INTEGER DEFAULT 0,
      commit_count INTEGER DEFAULT 0,
      file_changes INTEGER DEFAULT 0
    )
  `);

  // 사용자 통계 테이블 (스트릭, 뱃지용)
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_stats (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 뱃지 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      category TEXT DEFAULT 'general'
    )
  `);
}

// ============ 프로젝트 메타데이터 ============

export interface ProjectMeta {
  project_path: string;
  notes?: string;
  tags?: string;
  status?: string;
  pinned?: number;
  last_opened?: string;
  group_id?: string;
  deploy_url?: string;
}

export function getProjectMeta(projectPath: string): ProjectMeta | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM project_meta WHERE project_path = ?').get(projectPath) as ProjectMeta | undefined;
}

export function getAllProjectMeta(): ProjectMeta[] {
  const db = getDb();
  return db.prepare('SELECT * FROM project_meta').all() as ProjectMeta[];
}

export function saveProjectMeta(meta: Partial<ProjectMeta> & { project_path: string }) {
  const db = getDb();

  const existing = getProjectMeta(meta.project_path);

  if (existing) {
    const updates: string[] = [];
    const values: any[] = [];

    if (meta.notes !== undefined) { updates.push('notes = ?'); values.push(meta.notes); }
    if (meta.tags !== undefined) { updates.push('tags = ?'); values.push(meta.tags); }
    if (meta.status !== undefined) { updates.push('status = ?'); values.push(meta.status); }
    if (meta.pinned !== undefined) { updates.push('pinned = ?'); values.push(meta.pinned); }
    if (meta.last_opened !== undefined) { updates.push('last_opened = ?'); values.push(meta.last_opened); }
    if (meta.group_id !== undefined) { updates.push('group_id = ?'); values.push(meta.group_id); }
    if (meta.deploy_url !== undefined) { updates.push('deploy_url = ?'); values.push(meta.deploy_url); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(meta.project_path);
      db.prepare(`UPDATE project_meta SET ${updates.join(', ')} WHERE project_path = ?`).run(...values);
    }
  } else {
    db.prepare(`
      INSERT INTO project_meta (project_path, notes, tags, status, pinned, last_opened, group_id, deploy_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meta.project_path,
      meta.notes || null,
      meta.tags || null,
      meta.status || 'development',
      meta.pinned || 0,
      meta.last_opened || null,
      meta.group_id || null,
      meta.deploy_url || null
    );
  }
}

// ============ 그룹 ============

export interface Group {
  id: string;
  name: string;
  color: string;
  icon?: string;
  sort_order: number;
}

export function getAllGroups(): Group[] {
  const db = getDb();
  return db.prepare('SELECT * FROM groups ORDER BY sort_order').all() as Group[];
}

export function saveGroup(group: Omit<Group, 'sort_order'> & { sort_order?: number }) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(group.id);

  if (existing) {
    db.prepare(`
      UPDATE groups SET name = ?, color = ?, icon = ?, sort_order = ? WHERE id = ?
    `).run(group.name, group.color, group.icon || null, group.sort_order || 0, group.id);
  } else {
    db.prepare(`
      INSERT INTO groups (id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)
    `).run(group.id, group.name, group.color, group.icon || null, group.sort_order || 0);
  }
}

export function deleteGroup(groupId: string) {
  const db = getDb();
  // 해당 그룹의 프로젝트들을 미분류로
  db.prepare('UPDATE project_meta SET group_id = NULL WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
}

// ============ 포트 매핑 ============

export interface PortMapping {
  project_path: string;
  port: number;
  started_at: string;
}

export function getPortMappings(): PortMapping[] {
  const db = getDb();
  return db.prepare('SELECT * FROM port_mappings').all() as PortMapping[];
}

export function savePortMapping(projectPath: string, port: number) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO port_mappings (project_path, port, started_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(projectPath, port);
}

export function clearPortMapping(projectPath: string) {
  const db = getDb();
  db.prepare('DELETE FROM port_mappings WHERE project_path = ?').run(projectPath);
}

// ============ 작업 세션 ============

export function startWorkSession(projectPath: string): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO work_sessions (project_path, started_at) VALUES (?, CURRENT_TIMESTAMP)
  `).run(projectPath);
  return result.lastInsertRowid as number;
}

export function endWorkSession(sessionId: number) {
  const db = getDb();
  db.prepare(`
    UPDATE work_sessions
    SET ended_at = CURRENT_TIMESTAMP,
        duration_minutes = CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 24 * 60 AS INTEGER)
    WHERE id = ?
  `).run(sessionId);
}

export function getWorkStats(projectPath: string, days: number = 30) {
  const db = getDb();
  return db.prepare(`
    SELECT
      SUM(duration_minutes) as total_minutes,
      COUNT(*) as session_count,
      date(started_at) as date
    FROM work_sessions
    WHERE project_path = ?
      AND started_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(started_at)
    ORDER BY date DESC
  `).all(projectPath, days);
}

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
  const db = getDb();
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
