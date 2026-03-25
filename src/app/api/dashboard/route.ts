import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import path from 'path';
import {
  getAllProjectMeta, getAllGroups, getPortMappings,
  getDailyActivity, updateStreak, getAllBadges, checkAndAwardBadges,
  getAllActiveSessions, getRecentSessions,
} from '@/lib/database';

export async function GET() {
  try {
    // 1. Streak update (same as /api/stats)
    const streak = updateStreak();
    const newBadges = checkAndAwardBadges();
    const badges = getAllBadges();

    // 2. Activity data (last 7 days for yesterday recap)
    const activity = getDailyActivity(7);

    // 3. Projects metadata
    const projects = getAllProjectMeta();

    // 4. Groups
    const groups = getAllGroups();

    // 5. Active work sessions
    const activeSessions = getAllActiveSessions();
    const recentSessions = getRecentSessions(7);

    // 6. Running processes (simplified — just check common ports)
    const processes: Array<{
      port: number;
      pid: number;
      name?: string;
      projectName?: string;
      projectPath?: string;
    }> = [];
    try {
      const output = execFileSync('netstat', ['-ano'], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      }).toString();

      const devPorts = [
        3000, 3001, 3002, 5173, 5174, 8000, 8080,
        8500, 8501, 8502, 8503, 8504, 8505, 8506, 8507, 8508, 8509, 8510,
        4000, 4200, 9000,
      ];
      const portMappings = getPortMappings();
      const portToProject: Record<number, { path: string; name: string }> = {};
      for (const m of portMappings) {
        portToProject[m.port] = { path: m.project_path, name: path.basename(m.project_path) };
      }

      const lines = output.split('\n').filter(l => l.includes('LISTENING'));
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const portMatch = parts[1].match(/:(\d+)$/);
        if (!portMatch) continue;
        const port = parseInt(portMatch[1], 10);
        const pid = parseInt(parts[4], 10);
        if (!Number.isInteger(pid) || pid <= 0) continue;
        if (devPorts.includes(port) && !processes.some(p => p.port === port)) {
          const info = portToProject[port];
          processes.push({ port, pid, projectName: info?.name, projectPath: info?.path });
        }
      }
    } catch {
      /* 프로세스 조회 실패 — 빈 배열 */
    }

    return NextResponse.json({
      projects,
      streak,
      newBadges,
      badges,
      activity,
      groups,
      activeSessions,
      recentSessions,
      processes,
    });
  } catch (error) {
    console.warn('Dashboard API error:', error);
    return NextResponse.json({ error: 'Dashboard data load failed' }, { status: 500 });
  }
}
