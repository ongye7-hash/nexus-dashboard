import { NextResponse } from 'next/server';
import { getAllVPSServers, getVPSServer } from '@/lib/database';
import { connectSSH, sshExec } from '@/lib/ssh';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get('id');

  try {
    if (serverId) {
      // Single server status
      const server = getVPSServer(serverId);
      if (!server) return NextResponse.json({ error: '서버를 찾을 수 없습니다' }, { status: 404 });

      try {
        const conn = await connectSSH(server);

        // Run status commands in parallel
        const [cpuRaw, memRaw, diskRaw, tmuxRaw, uptimeRaw] = await Promise.all([
          sshExec(conn, "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").catch(() => '0'),
          sshExec(conn, "free -m | awk 'NR==2{printf \"%s/%s\", $3, $2}'").catch(() => '0/0'),
          sshExec(conn, "df -h / | awk 'NR==2{printf \"%s/%s\", $3, $2}'").catch(() => '0/0'),
          sshExec(conn, "tmux list-sessions -F '#{session_name}:#{session_windows}:#{?session_attached,attached,detached}' 2>/dev/null || echo ''").catch(() => ''),
          sshExec(conn, "uptime -p 2>/dev/null || uptime").catch(() => ''),
        ]);

        conn.end();

        // Parse tmux sessions
        const tmuxSessions = tmuxRaw.split('\n').filter(Boolean).map(line => {
          const [name, windows, status] = line.split(':');
          return { name, windows: parseInt(windows) || 1, attached: status === 'attached' };
        });

        // Parse memory
        const memParts = memRaw.split('/');
        const memUsed = parseInt(memParts[0]) || 0;
        const memTotal = parseInt(memParts[1]) || 1;

        return NextResponse.json({
          online: true,
          cpu: parseFloat(cpuRaw) || 0,
          memory: { used: memUsed, total: memTotal, percent: Math.round((memUsed / memTotal) * 100) },
          disk: diskRaw,
          tmuxSessions,
          uptime: uptimeRaw,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ online: false, error: message });
      }
    }

    // All servers status (동시 연결 3개로 제한)
    const servers = getAllVPSServers();
    const CHUNK_SIZE = 3;
    const statuses: Array<{ id: string; online: boolean }> = [];

    for (let i = 0; i < servers.length; i += CHUNK_SIZE) {
      const chunk = servers.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map(async (server) => {
          try {
            const conn = await connectSSH(server);
            conn.end();
            return { id: server.id, online: true };
          } catch { /* SSH 연결 실패 — 오프라인 처리 */
            return { id: server.id, online: false };
          }
        })
      );
      for (const r of results) {
        statuses.push(r.status === 'fulfilled' ? r.value : { id: 'unknown', online: false });
      }
    }

    return NextResponse.json({ statuses });
  } catch (error) {
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
  }
}
