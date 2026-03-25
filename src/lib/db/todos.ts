import { getDb } from './index';

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
