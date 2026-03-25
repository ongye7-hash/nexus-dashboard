import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/database';
import { decrypt } from '@/lib/crypto';

function getGitHubToken(): string | null {
  const encrypted = getSetting('github_token');
  if (!encrypted) return null;
  try { return decrypt(encrypted); } catch { return null; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get('repo'); // e.g., "owner/repo"

  if (!repo || !repo.includes('/')) {
    return NextResponse.json({ error: '레포 이름이 필요합니다 (owner/repo)' }, { status: 400 });
  }

  // owner/repo 형식만 허용 (path traversal 방지)
  const repoPattern = /^[\w.-]+\/[\w.-]+$/;
  if (!repoPattern.test(repo)) {
    return NextResponse.json({ error: '잘못된 레포 형식입니다' }, { status: 400 });
  }

  const token = getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: 'GitHub 인증이 필요합니다' }, { status: 401 });
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Nexus-Dashboard',
  };

  const result: Record<string, unknown> = { repo };

  // Fetch open issues (max 30, sorted by updated)
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues?state=open&per_page=30&sort=updated`,
      { headers }
    );
    if (res.ok) {
      const issues = await res.json();
      // GitHub API returns PRs as issues too — filter them out
      result.issues = issues
        .filter((i: Record<string, unknown>) => !i.pull_request)
        .map((i: Record<string, unknown>) => ({
          number: i.number,
          title: i.title,
          labels: (i.labels as Array<{ name: string }>).map((l) => l.name),
          assignee: (i.assignee as { login: string } | null)?.login || null,
          created_at: i.created_at,
          updated_at: i.updated_at,
          html_url: i.html_url,
        }));
      result.issueCount = (result.issues as unknown[]).length;
    }
  } catch (err) {
    console.warn('GitHub issues fetch failed:', err);
  }

  // Fetch last workflow run (Actions status)
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=1`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.workflow_runs && data.workflow_runs.length > 0) {
        const run = data.workflow_runs[0];
        result.actionsStatus = {
          status: run.status, // queued, in_progress, completed
          conclusion: run.conclusion, // success, failure, cancelled, null
          name: run.name,
          updated_at: run.updated_at,
          html_url: run.html_url,
        };
      }
    }
    // 404 = no Actions configured, silently skip
  } catch (err) {
    console.warn('GitHub actions fetch failed:', err);
  }

  return NextResponse.json(result);
}

// POST: Import issues as TODOs
export async function POST(request: Request) {
  try {
    const { projectPath, issues, assigneeFilter } = await request.json();

    if (!issues || !Array.isArray(issues) || !projectPath) {
      return NextResponse.json({ error: 'issues 배열과 projectPath가 필요합니다' }, { status: 400 });
    }

    // projectPath 검증
    if (typeof projectPath !== 'string' || projectPath.length === 0) {
      return NextResponse.json({ error: '잘못된 프로젝트 경로입니다' }, { status: 400 });
    }

    const { addProjectTodo } = await import('@/lib/database');
    let imported = 0;

    for (const issue of issues) {
      // Apply assignee filter if provided
      if (assigneeFilter && issue.assignee && issue.assignee !== assigneeFilter) continue;

      // Map labels to priority
      const labels: string[] = issue.labels || [];
      let priority = 'low';
      if (labels.some((l: string) => ['bug', 'critical', 'urgent', 'p0', 'p1'].includes(l.toLowerCase()))) {
        priority = 'high';
      } else if (labels.some((l: string) => ['enhancement', 'feature', 'p2'].includes(l.toLowerCase()))) {
        priority = 'medium';
      }

      const content = `[#${issue.number}] ${issue.title}`;
      addProjectTodo(projectPath, content, priority);
      imported++;
    }

    return NextResponse.json({ success: true, imported });
  } catch (error) {
    console.warn('Issue import failed:', error);
    return NextResponse.json({ error: 'Issue 가져오기 실패' }, { status: 500 });
  }
}
