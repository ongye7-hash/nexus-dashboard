import { NextResponse } from 'next/server';
import { getVPSServer } from '@/lib/database';
import { connectSSH, sshExec } from '@/lib/ssh';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get('id');

  if (!serverId) {
    return NextResponse.json({ error: '서버 ID가 필요합니다' }, { status: 400 });
  }

  const server = getVPSServer(serverId);
  if (!server) {
    return NextResponse.json({ error: '서버를 찾을 수 없습니다' }, { status: 404 });
  }

  let conn: any;
  try {
    conn = await connectSSH(server);
  } catch (error) {
    console.warn('VPS 연결 실패:', error);
    return NextResponse.json({ error: 'SSH 연결 실패' }, { status: 500 });
  }

  const result: any = { pm2: null, docker: null };

  try {
    // PM2 list
    try {
      const pm2Output = await sshExec(conn, 'pm2 jlist 2>/dev/null', 5000);
      if (pm2Output && pm2Output.startsWith('[')) {
        const processes = JSON.parse(pm2Output);
        result.pm2 = processes.map((p: any) => ({
          name: p.name,
          id: p.pm_id,
          status: p.pm2_env?.status || 'unknown',
          cpu: p.monit?.cpu || 0,
          memory: p.monit?.memory || 0,
          uptime: p.pm2_env?.pm_uptime || 0,
          restarts: p.pm2_env?.restart_time || 0,
        }));
      }
    } catch { /* pm2 미설치 — 스킵 */ }

    // Docker ps
    try {
      const dockerOutput = await sshExec(conn, 'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}" 2>/dev/null', 5000);
      if (dockerOutput) {
        result.docker = dockerOutput.split('\n').filter(Boolean).map(line => {
          const [id, name, image, status, state] = line.split('|');
          return { id: id?.slice(0, 12), name, image, status, state };
        });
      }
    } catch { /* docker 미설치 — 스킵 */ }
  } finally {
    conn.end();
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    const { serverId, type, action, target } = await request.json();

    if (!serverId || !type || !action || !target) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다' }, { status: 400 });
    }

    // Validate action
    const allowedActions = ['restart', 'stop', 'start'];
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ error: '허용되지 않은 액션입니다' }, { status: 403 });
    }

    // Validate target (no shell metacharacters)
    if (/[;&|`$(){}]/.test(target)) {
      return NextResponse.json({ error: '유효하지 않은 대상입니다' }, { status: 400 });
    }

    const server = getVPSServer(serverId);
    if (!server) {
      return NextResponse.json({ error: '서버를 찾을 수 없습니다' }, { status: 404 });
    }

    let conn: any;
    try {
      conn = await connectSSH(server);
    } catch (error) {
      console.warn('VPS 연결 실패:', error);
      return NextResponse.json({ error: 'SSH 연결 실패' }, { status: 500 });
    }

    try {
      let command = '';
      if (type === 'pm2') {
        command = `pm2 ${action} '${target.replace(/'/g, "'\\''")}'`;
      } else if (type === 'docker') {
        command = `docker ${action} '${target.replace(/'/g, "'\\''")}'`;
      } else {
        return NextResponse.json({ error: '알 수 없는 서비스 타입' }, { status: 400 });
      }

      const output = await sshExec(conn, command, 10000);
      return NextResponse.json({ success: true, output });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '명령 실행 실패';
      return NextResponse.json({ error: msg }, { status: 500 });
    } finally {
      conn.end();
    }
  } catch (error) {
    console.warn('VPS services error:', error);
    return NextResponse.json({ error: '서비스 제어 실패' }, { status: 500 });
  }
}
