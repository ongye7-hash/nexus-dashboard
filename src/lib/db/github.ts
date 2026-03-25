import { getDb } from './index';

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
