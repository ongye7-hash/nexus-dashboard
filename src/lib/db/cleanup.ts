import { getDb } from './index';

// ============ 고아 레코드 정리 ============

export function cleanupOrphanedRecords(existingPaths: string[]): void {
  if (existingPaths.length === 0) return;
  const db = getDb();
  const placeholders = existingPaths.map(() => '?').join(',');
  db.prepare(`DELETE FROM project_todos WHERE project_path NOT IN (${placeholders})`).run(...existingPaths);
  db.prepare(`DELETE FROM work_sessions WHERE project_path NOT IN (${placeholders}) AND ended_at IS NOT NULL`).run(...existingPaths);
}
