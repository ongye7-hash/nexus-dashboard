import { NextResponse } from 'next/server';
import { getAllVPSServers, getVPSServer } from '@/lib/database';
import { decrypt } from '@/lib/crypto';
// ssh2는 동적 import (Turbopack 호환)

function sshExec(conn: any, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err: any, stream: any) => {
      if (err) return reject(err);
      let output = '';
      stream.on('data', (data: Buffer) => { output += data.toString(); });
      stream.stderr.on('data', (data: Buffer) => { output += data.toString(); });
      stream.on('close', () => resolve(output.trim()));
    });
  });
}

interface ServerLike {
  host: string;
  port: number;
  username: string;
  auth_type: string;
  encrypted_credential: string | null;
}

async function connectSSH(server: ServerLike): Promise<any> {
  const { Client } = await import('ssh2');
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const done = (fn: () => void) => { if (settled) return; settled = true; fn(); };

    const timeout = setTimeout(() => {
      done(() => { conn.destroy(); reject(new Error('Connection timeout')); });
    }, 8000);

    conn.on('ready', () => {
      clearTimeout(timeout);
      done(() => resolve(conn));
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      done(() => reject(err));
    });

    const config: Record<string, unknown> = {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: 8000,
      keepaliveInterval: 10000,
    };

    if (server.auth_type === 'password' && server.encrypted_credential) {
      config.password = decrypt(server.encrypted_credential);
    } else if (server.auth_type === 'key_file' && server.encrypted_credential) {
      const keyPath = decrypt(server.encrypted_credential);
      const fs = require('fs');
      const path = require('path');
      const resolved = path.resolve(keyPath);
      const sshDir = path.resolve(process.env.HOME || 'C:\\Users\\user', '.ssh');
      // .ssh 폴더 내 파일만 허용 (임의 파일 읽기 방지)
      if (resolved.startsWith(sshDir) && fs.existsSync(resolved)) {
        config.privateKey = fs.readFileSync(resolved);
      }
    } else if (server.auth_type === 'key_content' && server.encrypted_credential) {
      config.privateKey = decrypt(server.encrypted_credential);
    }

    conn.connect(config);
  });
}

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
