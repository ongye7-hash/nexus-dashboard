import { NextResponse } from 'next/server';
import { getAllVPSServers, getVPSServer, saveVPSServer, deleteVPSServer } from '@/lib/database';
import { encrypt } from '@/lib/crypto';
// ssh2는 동적 import (Turbopack 호환)

export async function GET() {
  try {
    const servers = getAllVPSServers();
    // Remove encrypted credentials from response
    const safe = servers.map(s => ({
      ...s,
      encrypted_credential: s.encrypted_credential ? '***' : null,
    }));
    return NextResponse.json({ servers: safe });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get servers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'add':
      case 'update': {
        const { id, name, host, port, username, authType, credential, defaultCwd, tags } = body;
        if (!name || !host || !username) {
          return NextResponse.json({ error: '이름, 호스트, 사용자명은 필수입니다' }, { status: 400 });
        }
        const serverId = id || `vps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const encryptedCred = credential ? encrypt(credential) : null;

        saveVPSServer({
          id: serverId,
          name,
          host,
          port: port || 22,
          username,
          auth_type: authType || 'password',
          encrypted_credential: encryptedCred,
          host_key: null,
          default_cwd: defaultCwd || '/home',
          tags: tags ? JSON.stringify(tags) : null,
          last_connected_at: null,
        });

        return NextResponse.json({ success: true, id: serverId });
      }

      case 'delete': {
        const { id } = body;
        if (!id) return NextResponse.json({ error: 'ID 필요' }, { status: 400 });
        deleteVPSServer(id);
        return NextResponse.json({ success: true });
      }

      case 'test': {
        const { id, host, port, username, authType, credential } = body;

        // If id provided, get from DB
        let testHost = host;
        let testPort = port || 22;
        let testUsername = username;
        let testCredential = credential;
        let testAuthType = authType || 'password';

        if (id && !host) {
          const server = getVPSServer(id);
          if (!server) return NextResponse.json({ error: '서버를 찾을 수 없습니다' }, { status: 404 });
          testHost = server.host;
          testPort = server.port;
          testUsername = server.username;
          testAuthType = server.auth_type;
          if (server.encrypted_credential) {
            const { decrypt } = await import('@/lib/crypto');
            testCredential = decrypt(server.encrypted_credential);
          }
        }

        if (!testHost || !testUsername) {
          return NextResponse.json({ error: '호스트와 사용자명이 필요합니다' }, { status: 400 });
        }

        // Test SSH connection
        return new Promise<Response>(async (resolve) => {
          const { Client } = await import('ssh2');
          const conn = new Client();
          const timeout = setTimeout(() => {
            conn.end();
            resolve(NextResponse.json({ success: false, error: '연결 시간 초과 (10초)' }, { status: 408 }));
          }, 10000);

          conn.on('ready', () => {
            clearTimeout(timeout);
            // Get server info
            conn.exec('uname -a && hostname', (err, stream) => {
              if (err) {
                conn.end();
                resolve(NextResponse.json({ success: true, info: 'Connected (info unavailable)' }));
                return;
              }
              let output = '';
              stream.on('data', (data: Buffer) => { output += data.toString(); });
              stream.on('close', () => {
                conn.end();
                resolve(NextResponse.json({ success: true, info: output.trim() }));
              });
            });
          });

          conn.on('error', (err) => {
            clearTimeout(timeout);
            resolve(NextResponse.json({ success: false, error: err.message }, { status: 400 }));
          });

          const connectConfig: Record<string, unknown> = {
            host: testHost,
            port: testPort,
            username: testUsername,
            readyTimeout: 10000,
            keepaliveInterval: 10000,
          };

          if (testAuthType === 'password') {
            connectConfig.password = testCredential;
          } else if (testAuthType === 'key_file') {
            const fs = require('fs');
            const pathMod = require('path');
            const resolved = pathMod.resolve(testCredential || '');
            const sshDir = pathMod.resolve(process.env.HOME || 'C:\\Users\\user', '.ssh');
            // .ssh 폴더 내 파일만 허용 (임의 파일 읽기 방지)
            if (resolved.startsWith(sshDir) && fs.existsSync(resolved)) {
              connectConfig.privateKey = fs.readFileSync(resolved);
            } else {
              resolve(NextResponse.json({ error: 'SSH 키 파일은 ~/.ssh 폴더 내에 있어야 합니다' }, { status: 400 }));
              return;
            }
          } else if (testAuthType === 'key_content') {
            connectConfig.privateKey = testCredential;
          }

          conn.connect(connectConfig);
        });
      }

      default:
        return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 });
    }
  } catch (error) {
    console.error('VPS API error:', error);
    return NextResponse.json({ error: 'VPS 작업 실패' }, { status: 500 });
  }
}
