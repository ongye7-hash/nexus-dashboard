import { NextResponse } from 'next/server';
import { getWeeklyReport, getRecentSessions, getAllTodosCount, getStreak } from '@/lib/database';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const weeklyReport = getWeeklyReport();
    const recentSessions = getRecentSessions(7);
    const todoCounts = getAllTodosCount();
    const streak = getStreak();

    // Scan projects for cross-project insights
    const desktopPath = path.join('C:', 'Users', process.env.USERNAME || 'user', 'Desktop');
    const alerts: Array<{ type: string; message: string; project?: string; severity: 'info' | 'warning' | 'danger' }> = [];

    // Check for projects with uncommitted changes
    try {
      const dirs = fs.readdirSync(desktopPath, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const fullPath = path.join(desktopPath, dir.name);
        const gitDir = path.join(fullPath, '.git');
        if (!fs.existsSync(gitDir)) continue;

        try {
          const status = execSync('git status --porcelain', { cwd: fullPath, encoding: 'utf-8', timeout: 3000, windowsHide: true }).trim();
          if (status) {
            const changeCount = status.split('\n').filter(Boolean).length;

            // Check last commit date
            let lastCommitDate = '';
            try {
              lastCommitDate = execSync('git log -1 --format=%aI', { cwd: fullPath, encoding: 'utf-8', timeout: 3000, windowsHide: true }).trim();
            } catch {}

            if (lastCommitDate) {
              const daysSinceCommit = Math.floor((Date.now() - new Date(lastCommitDate).getTime()) / 86400000);
              if (daysSinceCommit > 3) {
                alerts.push({
                  type: 'stale_changes',
                  message: `${changeCount}개 변경사항이 ${daysSinceCommit}일째 커밋 안 됨`,
                  project: dir.name,
                  severity: daysSinceCommit > 7 ? 'danger' : 'warning',
                });
              }
            }
          }

          // Check unpushed commits
          try {
            const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: fullPath, encoding: 'utf-8', timeout: 3000, windowsHide: true }).trim();
            const aheadBehind = execSync(`git rev-list --left-right --count ${branch}...origin/${branch}`, { cwd: fullPath, encoding: 'utf-8', timeout: 3000, windowsHide: true }).trim();
            const [ahead] = aheadBehind.split('\t').map(Number);
            if (ahead > 0) {
              alerts.push({
                type: 'unpushed',
                message: `${ahead}개 커밋이 푸시 안 됨`,
                project: dir.name,
                severity: ahead > 5 ? 'warning' : 'info',
              });
            }
          } catch {}
        } catch {}
      }
    } catch {}

    // Streak warning
    if (streak.current > 0) {
      const today = new Date().toISOString().split('T')[0];
      if (streak.lastActiveDate !== today) {
        alerts.push({
          type: 'streak_warning',
          message: `${streak.current}일 스트릭이 오늘 끊길 수 있어요!`,
          severity: 'warning',
        });
      }
    }

    // Pending TODOs
    if (todoCounts.total - todoCounts.completed > 5) {
      alerts.push({
        type: 'pending_todos',
        message: `미완료 TODO가 ${todoCounts.total - todoCounts.completed}개 있어요`,
        severity: 'info',
      });
    }

    return NextResponse.json({
      weeklyReport,
      recentSessions,
      todoCounts,
      streak,
      alerts,
    });
  } catch (error) {
    console.error('Insights API error:', error);
    return NextResponse.json({ error: 'Failed to get insights' }, { status: 500 });
  }
}
