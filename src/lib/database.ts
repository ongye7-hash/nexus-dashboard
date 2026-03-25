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

  // 설정 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // GitHub 레포 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS github_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_id INTEGER UNIQUE,
      full_name TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      html_url TEXT NOT NULL,
      default_branch TEXT DEFAULT 'main',
      language TEXT,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      updated_at TEXT,
      pushed_at TEXT,
      local_path TEXT,
      synced_at TEXT,
      is_private INTEGER DEFAULT 0
    )
  `);

  // VPS 서버 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS vps_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'password',
      encrypted_credential TEXT,
      host_key TEXT,
      default_cwd TEXT DEFAULT '/home',
      tags TEXT,
      last_connected_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 프로젝트 TODO 테이블
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      content TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
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

// ============ 프로젝트 TODO ============

export interface ProjectTodo {
  id: number;
  project_path: string;
  content: string;
  completed: number;
  priority: string;
  created_at: string;
  completed_at: string | null;
}

export function getProjectTodos(projectPath: string): ProjectTodo[] {
  const db = getDb();
  return db.prepare('SELECT * FROM project_todos WHERE project_path = ? ORDER BY completed ASC, priority DESC, created_at DESC').all(projectPath) as ProjectTodo[];
}

export function addProjectTodo(projectPath: string, content: string, priority: string = 'medium'): ProjectTodo {
  const db = getDb();
  const result = db.prepare('INSERT INTO project_todos (project_path, content, priority) VALUES (?, ?, ?)').run(projectPath, content, priority);
  return db.prepare('SELECT * FROM project_todos WHERE id = ?').get(result.lastInsertRowid) as ProjectTodo;
}

export function toggleTodo(todoId: number): void {
  const db = getDb();
  const todo = db.prepare('SELECT completed FROM project_todos WHERE id = ?').get(todoId) as { completed: number } | undefined;
  if (todo) {
    const newCompleted = todo.completed ? 0 : 1;
    const completedAt = newCompleted ? new Date().toISOString() : null;
    db.prepare('UPDATE project_todos SET completed = ?, completed_at = ? WHERE id = ?').run(newCompleted, completedAt, todoId);
  }
}

export function deleteTodo(todoId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM project_todos WHERE id = ?').run(todoId);
}

export function getAllTodosCount(): { total: number; completed: number; byProject: Array<{ project_path: string; total: number; pending: number }> } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as count FROM project_todos').get() as { count: number }).count;
  const completed = (db.prepare('SELECT COUNT(*) as count FROM project_todos WHERE completed = 1').get() as { count: number }).count;
  const byProject = db.prepare(`
    SELECT project_path, COUNT(*) as total, SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) as pending
    FROM project_todos GROUP BY project_path
  `).all() as Array<{ project_path: string; total: number; pending: number }>;
  return { total, completed, byProject };
}

// ============ 작업 세션 개선 ============

export function getActiveSession(projectPath: string): { id: number; started_at: string } | undefined {
  const db = getDb();
  return db.prepare('SELECT id, started_at FROM work_sessions WHERE project_path = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(projectPath) as { id: number; started_at: string } | undefined;
}

export function getAllActiveSessions(): Array<{ id: number; project_path: string; started_at: string }> {
  const db = getDb();
  return db.prepare('SELECT id, project_path, started_at FROM work_sessions WHERE ended_at IS NULL').all() as Array<{ id: number; project_path: string; started_at: string }>;
}

export function getRecentSessions(days: number = 7): Array<{ project_path: string; total_minutes: number; session_count: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT project_path, SUM(duration_minutes) as total_minutes, COUNT(*) as session_count
    FROM work_sessions
    WHERE ended_at IS NOT NULL AND started_at >= datetime('now', '-' || ? || ' days')
    GROUP BY project_path ORDER BY total_minutes DESC
  `).all(days) as Array<{ project_path: string; total_minutes: number; session_count: number }>;
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

// ============ 설정 ============

export function getSetting(key: string): string | undefined {
  const db = getDb();
  const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return result?.value;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(key, value);
}

export function deleteSetting(key: string): void {
  const db = getDb();
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

// ============ GitHub 레포 ============

export interface GitHubRepoRecord {
  id: number;
  github_id: number;
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  language: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  updated_at: string | null;
  pushed_at: string | null;
  local_path: string | null;
  synced_at: string | null;
  is_private: number;
}

export function getAllGitHubRepos(): GitHubRepoRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM github_repos ORDER BY pushed_at DESC').all() as GitHubRepoRecord[];
}

export function getGitHubRepoByFullName(fullName: string): GitHubRepoRecord | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM github_repos WHERE full_name = ?').get(fullName) as GitHubRepoRecord | undefined;
}

export function upsertGitHubRepo(repo: Omit<GitHubRepoRecord, 'id' | 'synced_at' | 'local_path'> & { local_path?: string | null }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO github_repos (github_id, full_name, name, description, html_url, default_branch, language, stars, forks, open_issues, updated_at, pushed_at, local_path, synced_at, is_private)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(github_id) DO UPDATE SET
      full_name = excluded.full_name,
      name = excluded.name,
      description = excluded.description,
      html_url = excluded.html_url,
      default_branch = excluded.default_branch,
      language = excluded.language,
      stars = excluded.stars,
      forks = excluded.forks,
      open_issues = excluded.open_issues,
      updated_at = excluded.updated_at,
      pushed_at = excluded.pushed_at,
      local_path = COALESCE(github_repos.local_path, excluded.local_path),
      synced_at = CURRENT_TIMESTAMP,
      is_private = excluded.is_private
  `).run(
    repo.github_id, repo.full_name, repo.name, repo.description || null,
    repo.html_url, repo.default_branch, repo.language || null,
    repo.stars, repo.forks, repo.open_issues,
    repo.updated_at || null, repo.pushed_at || null,
    repo.local_path || null, repo.is_private
  );
}

export function linkGitHubRepoToLocal(fullName: string, localPath: string): void {
  const db = getDb();
  db.prepare('UPDATE github_repos SET local_path = ? WHERE full_name = ?').run(localPath, fullName);
}

export function unlinkGitHubRepo(fullName: string): void {
  const db = getDb();
  db.prepare('UPDATE github_repos SET local_path = NULL WHERE full_name = ?').run(fullName);
}

export function getUnlinkedGitHubRepos(): GitHubRepoRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM github_repos WHERE local_path IS NULL ORDER BY pushed_at DESC').all() as GitHubRepoRecord[];
}

// ============ VPS 서버 ============

export interface VPSServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: string;
  encrypted_credential: string | null;
  host_key: string | null;
  default_cwd: string;
  tags: string | null;
  last_connected_at: string | null;
  created_at: string;
}

export function getAllVPSServers(): VPSServer[] {
  const db = getDb();
  return db.prepare('SELECT * FROM vps_servers ORDER BY last_connected_at DESC NULLS LAST, created_at DESC').all() as VPSServer[];
}

export function getVPSServer(id: string): VPSServer | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM vps_servers WHERE id = ?').get(id) as VPSServer | undefined;
}

export function saveVPSServer(server: Omit<VPSServer, 'created_at'>): void {
  const db = getDb();
  const existing = getVPSServer(server.id);
  if (existing) {
    db.prepare(`
      UPDATE vps_servers SET name=?, host=?, port=?, username=?, auth_type=?, encrypted_credential=?, host_key=?, default_cwd=?, tags=?
      WHERE id=?
    `).run(server.name, server.host, server.port, server.username, server.auth_type, server.encrypted_credential, server.host_key, server.default_cwd, server.tags, server.id);
  } else {
    db.prepare(`
      INSERT INTO vps_servers (id, name, host, port, username, auth_type, encrypted_credential, host_key, default_cwd, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(server.id, server.name, server.host, server.port, server.username, server.auth_type, server.encrypted_credential, server.host_key, server.default_cwd, server.tags);
  }
}

export function deleteVPSServer(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM vps_servers WHERE id = ?').run(id);
}

export function updateVPSLastConnected(id: string): void {
  const db = getDb();
  db.prepare('UPDATE vps_servers SET last_connected_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function saveVPSHostKey(id: string, hostKey: string): void {
  const db = getDb();
  db.prepare('UPDATE vps_servers SET host_key = ? WHERE id = ?').run(hostKey, id);
}

// ============ 고아 레코드 정리 ============

export function cleanupOrphanedRecords(existingPaths: string[]): void {
  if (existingPaths.length === 0) return;
  const db = getDb();
  const placeholders = existingPaths.map(() => '?').join(',');
  db.prepare(`DELETE FROM project_todos WHERE project_path NOT IN (${placeholders})`).run(...existingPaths);
  db.prepare(`DELETE FROM work_sessions WHERE project_path NOT IN (${placeholders}) AND ended_at IS NOT NULL`).run(...existingPaths);
}
