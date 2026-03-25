import { getDb } from './index';

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
