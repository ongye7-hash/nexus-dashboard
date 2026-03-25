import { NextResponse } from 'next/server';
import { getVPSServer, updateVPSLastConnected } from '@/lib/database';
import { connectSSH, sshExec } from '@/lib/ssh';

// Allowed deploy commands (whitelist)
const ALLOWED_COMMANDS = [
  'git pull',
  'git pull origin main',
  'git pull origin master',
  'npm install',
  'npm run build',
  'pm2 restart',
  'pm2 reload',
  'systemctl restart',
  'docker-compose up -d',
  'docker compose up -d',
];

function isCommandAllowed(cmd: string): boolean {
  return ALLOWED_COMMANDS.some(allowed => cmd.startsWith(allowed));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serverId, remotePath, commands } = body;

    if (!serverId || typeof serverId !== 'string') {
      return NextResponse.json({ error: '서버 ID가 필요합니다' }, { status: 400 });
    }
    if (!remotePath || typeof remotePath !== 'string') {
      return NextResponse.json({ error: '원격 경로가 필요합니다' }, { status: 400 });
    }
    if (!commands || !Array.isArray(commands) || commands.length === 0) {
      return NextResponse.json({ error: '명령 목록이 필요합니다' }, { status: 400 });
    }

    // Validate all commands are strings
    for (const cmd of commands) {
      if (typeof cmd !== 'string') {
        return NextResponse.json({ error: '명령은 문자열이어야 합니다' }, { status: 400 });
      }
      if (!isCommandAllowed(cmd)) {
        return NextResponse.json({ error: `허용되지 않은 명령: ${cmd}` }, { status: 403 });
      }
    }

    // Validate remotePath (prevent path traversal)
    if (remotePath.includes('..') || !remotePath.startsWith('/')) {
      return NextResponse.json({ error: '유효하지 않은 경로입니다' }, { status: 400 });
    }

    const server = getVPSServer(serverId);
    if (!server) {
      return NextResponse.json({ error: '서버를 찾을 수 없습니다' }, { status: 404 });
    }

    const conn = await connectSSH(server);
    updateVPSLastConnected(serverId);

    const results: Array<{ command: string; output: string; success: boolean }> = [];

    for (const cmd of commands) {
      try {
        const output = await sshExec(conn, `cd "${remotePath}" && ${cmd}`);
        results.push({ command: cmd, output, success: true });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '명령 실행 실패';
        results.push({ command: cmd, output: msg, success: false });
        // Stop on first failure
        break;
      }
    }

    conn.end();

    const allSuccess = results.every(r => r.success);
    return NextResponse.json({
      success: allSuccess,
      results,
      message: allSuccess ? '배포 완료' : '배포 중 오류 발생',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '배포 실패';
    console.warn('VPS deploy failed:', message);
    return NextResponse.json({ error: `배포 실패: ${message}` }, { status: 500 });
  }
}
