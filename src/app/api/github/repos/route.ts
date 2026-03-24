import { NextResponse } from 'next/server';
import { getSetting, getAllGitHubRepos, upsertGitHubRepo, linkGitHubRepoToLocal, unlinkGitHubRepo } from '@/lib/database';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DESKTOP_PATH = 'C:\\Users\\user\\Desktop';

// Detect local projects' GitHub remote URLs
function getLocalGitHubMappings(): Record<string, string> {
  const mappings: Record<string, string> = {}; // full_name -> local_path

  try {
    const items = fs.readdirSync(DESKTOP_PATH, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const fullPath = path.join(DESKTOP_PATH, item.name);
      const gitDir = path.join(fullPath, '.git');
      if (!fs.existsSync(gitDir)) continue;

      try {
        const remoteUrl = execSync('git remote get-url origin', {
          cwd: fullPath, encoding: 'utf-8', timeout: 3000, windowsHide: true,
        }).trim();

        // Extract owner/repo from GitHub URL
        const match = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
        if (match) {
          const fullName = `${match[1]}/${match[2]}`;
          mappings[fullName.toLowerCase()] = fullPath;
        }
      } catch {
        // ignore repos without origin remote
      }
    }
  } catch {
    // ignore errors reading desktop
  }

  return mappings;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

    const token = getSetting('github_token');
    if (!token) {
      return NextResponse.json({ error: 'GitHub not authenticated' }, { status: 401 });
    }

    if (refresh) {
      // Fetch from GitHub API (paginated)
      const allRepos: any[] = [];
      let page = 1;
      const perPage = 100;

      const MAX_PAGES = 50; // 최대 5000개 레포 상한
      while (page <= MAX_PAGES) {
        const res = await fetch(
          `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=pushed&affiliation=owner`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Nexus-Dashboard',
            },
          }
        );

        if (!res.ok) {
          return NextResponse.json({ error: 'Failed to fetch repos' }, { status: res.status });
        }

        const repos = await res.json();
        if (!Array.isArray(repos) || repos.length === 0) break;
        allRepos.push(...repos);
        if (repos.length < perPage) break;
        page++;
      }

      // Detect local GitHub mappings
      const localMappings = getLocalGitHubMappings();

      // Upsert all repos to DB
      for (const repo of allRepos) {
        const fullNameLower = repo.full_name.toLowerCase();
        const localPath = localMappings[fullNameLower] || null;

        upsertGitHubRepo({
          github_id: repo.id,
          full_name: repo.full_name,
          name: repo.name,
          description: repo.description,
          html_url: repo.html_url,
          default_branch: repo.default_branch || 'main',
          language: repo.language,
          stars: repo.stargazers_count || 0,
          forks: repo.forks_count || 0,
          open_issues: repo.open_issues_count || 0,
          updated_at: repo.updated_at,
          pushed_at: repo.pushed_at,
          is_private: repo.private ? 1 : 0,
          local_path: localPath,
        });
      }
    }

    // Return cached repos from DB
    const repos = getAllGitHubRepos();
    return NextResponse.json({ repos, total: repos.length });
  } catch (error) {
    console.error('GitHub repos error:', error);
    return NextResponse.json({ error: 'Failed to get repos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, fullName, localPath } = await request.json();

    switch (action) {
      case 'link': {
        if (!fullName || !localPath) {
          return NextResponse.json({ error: 'fullName and localPath required' }, { status: 400 });
        }
        linkGitHubRepoToLocal(fullName, localPath);
        return NextResponse.json({ success: true });
      }
      case 'unlink': {
        if (!fullName) return NextResponse.json({ error: 'fullName required' }, { status: 400 });
        unlinkGitHubRepo(fullName);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
  }
}
