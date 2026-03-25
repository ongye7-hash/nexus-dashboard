import { NextResponse } from 'next/server';
import { getVPSServer } from '@/lib/database';
import { connectSSH, sshExec } from '@/lib/ssh';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get('id');

  if (!serverId || typeof serverId !== 'string') {
    return NextResponse.json({ error: '서버 ID가 필요합니다' }, { status: 400 });
  }

  const server = getVPSServer(serverId);
  if (!server) {
    return NextResponse.json({ error: '서버를 찾을 수 없습니다' }, { status: 404 });
  }

  try {
    const conn = await connectSSH(server);

    try {
      // 경로 새니타이징 (쉘 메타문자 제거)
      const cwd = (server.default_cwd || '/home').replace(/[^a-zA-Z0-9/_.-]/g, '');
      const lsOutput = await sshExec(conn, `ls -d '${cwd}'/*/ 2>/dev/null | head -30`);

      const projects = [];
      const dirs = lsOutput.split('\n').filter(Boolean);

      for (const dir of dirs) {
        const name = dir.replace(/\/$/, '').split('/').pop() || '';
        if (!name || name.startsWith('.')) continue;

        // 경로를 single-quote로 감싸서 인젝션 방지
        const safeDir = dir.replace(/'/g, "'\\''");

        const checkResult = await sshExec(conn,
          `cd '${safeDir}' && ls package.json .git requirements.txt pyproject.toml index.html 2>/dev/null | head -5`
        );
        if (!checkResult) continue;

        const hasGit = checkResult.includes('.git');
        const hasPackageJson = checkResult.includes('package.json');

        let gitBranch = '';
        let lastCommit = '';
        let uncommittedCount = 0;

        if (hasGit) {
          gitBranch = await sshExec(conn, `cd '${safeDir}' && git rev-parse --abbrev-ref HEAD 2>/dev/null`).catch(() => '');
          lastCommit = await sshExec(conn, `cd '${safeDir}' && git log -1 --format="%s (%ar)" 2>/dev/null`).catch(() => '');
          const statusOutput = await sshExec(conn, `cd '${safeDir}' && git status --porcelain 2>/dev/null | wc -l`).catch(() => '0');
          uncommittedCount = parseInt(statusOutput) || 0;
        }

        let framework = '';
        if (hasPackageJson) {
          const pkgCheck = await sshExec(conn, `cd '${safeDir}' && cat package.json 2>/dev/null | head -50`).catch(() => '');
          if (pkgCheck.includes('"next"')) framework = 'Next.js';
          else if (pkgCheck.includes('"react"')) framework = 'React';
          else if (pkgCheck.includes('"vue"')) framework = 'Vue';
          else if (pkgCheck.includes('"express"')) framework = 'Express';
          else framework = 'Node.js';
        } else if (checkResult.includes('requirements.txt') || checkResult.includes('pyproject.toml')) {
          framework = 'Python';
        }

        projects.push({
          name,
          path: dir.replace(/\/$/, ''),
          framework,
          hasGit,
          hasPackageJson,
          gitBranch,
          lastCommit,
          uncommittedCount,
        });
      }

      return NextResponse.json({ projects, serverId, serverName: server.name });
    } finally {
      conn.end();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'SSH 연결 실패';
    console.warn('VPS project scan failed:', message);
    return NextResponse.json({ error: `VPS 프로젝트 스캔 실패: ${message}` }, { status: 500 });
  }
}
