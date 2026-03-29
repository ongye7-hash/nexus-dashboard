import { getDb } from './index';

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
  is_registered?: number;
  deploy_type?: string;
}

export interface DeployTarget {
  id: string;
  project_path: string;
  type: string;
  name: string;
  config?: string;
  last_deployed_at?: string;
  status?: string;
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
    if (meta.is_registered !== undefined) { updates.push('is_registered = ?'); values.push(meta.is_registered); }
    if (meta.deploy_type !== undefined) { updates.push('deploy_type = ?'); values.push(meta.deploy_type); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(meta.project_path);
      db.prepare(`UPDATE project_meta SET ${updates.join(', ')} WHERE project_path = ?`).run(...values);
    }
  } else {
    db.prepare(`
      INSERT INTO project_meta (project_path, notes, tags, status, pinned, last_opened, group_id, deploy_url, is_registered, deploy_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meta.project_path,
      meta.notes || null,
      meta.tags || null,
      meta.status || 'development',
      meta.pinned || 0,
      meta.last_opened || null,
      meta.group_id || null,
      meta.deploy_url || null,
      meta.is_registered || 0,
      meta.deploy_type || null
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

// ============ 등록 프로젝트 ============

export function getRegisteredProjects(): ProjectMeta[] {
  const db = getDb();
  return db.prepare('SELECT * FROM project_meta WHERE is_registered = 1').all() as ProjectMeta[];
}

// ============ 배포 타겟 ============

export function getDeployTargets(projectPath: string): DeployTarget[] {
  const db = getDb();
  return db.prepare('SELECT * FROM deploy_targets WHERE project_path = ?').all(projectPath) as DeployTarget[];
}

export function saveDeployTarget(target: DeployTarget) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO deploy_targets (id, project_path, type, name, config, last_deployed_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    target.id,
    target.project_path,
    target.type,
    target.name,
    target.config || null,
    target.last_deployed_at || null,
    target.status || 'unknown'
  );
}

export function deleteDeployTarget(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM deploy_targets WHERE id = ?').run(id);
}

export function deleteDeployTargetsByProject(projectPath: string) {
  const db = getDb();
  db.prepare('DELETE FROM deploy_targets WHERE project_path = ?').run(projectPath);
}
