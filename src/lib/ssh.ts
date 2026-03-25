import { decrypt } from '@/lib/crypto';

export interface ServerLike {
  host: string;
  port: number;
  username: string;
  auth_type: string;
  encrypted_credential: string | null;
}

export function sshExec(conn: any, command: string): Promise<string> {
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

export async function connectSSH(server: ServerLike): Promise<any> {
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

    conn.on('error', (err: Error) => {
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
