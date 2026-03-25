import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import * as fs from 'fs';
import * as crypto from 'crypto';
// ssh2는 handleSSHConnection 안에서 동적 import (Turbopack 호환)

const PORT = 8508;

// 서버 시작 시 랜덤 토큰 생성 (외부 접근 방지)
const AUTH_TOKEN = crypto.randomBytes(32).toString('hex');

// 토큰을 파일로 저장 (API 라우트에서 읽어서 클라이언트에 전달)
const TOKEN_PATH = require('path').join(process.cwd(), '.nexus-data', 'terminal-token');

// 허용된 origin 목록 (localhost만)
const ALLOWED_ORIGINS = [
  'http://localhost:8507',
  'http://127.0.0.1:8507',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

interface TerminalSession {
  pty: pty.IPty;
  ws: WebSocket;
}

interface SSHSession {
  ssh: any;
  stream: any; // ssh2 ClientChannel
  ws: WebSocket;
}

const sessions = new Map<string, TerminalSession>();
const sshSessions = new Map<string, SSHSession>();
// 동시 세션 제한
const MAX_SESSIONS = 5;

let serverInstance: WebSocketServer | null = null;

function createServer() {
  if (serverInstance) {
    return serverInstance;
  }

  // 토큰 파일 저장
  try {
    const dir = require('path').dirname(TOKEN_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_PATH, AUTH_TOKEN, 'utf-8');
  } catch (e) {
    console.error('Failed to write terminal token:', e);
  }

  const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
  serverInstance = wss;
  console.log(`Terminal WebSocket server running on ws://localhost:${PORT}`);

  wss.on('connection', (ws: WebSocket, req) => {
    // Origin 검증
    const origin = req.headers.origin || '';
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      ws.close(4003, 'Forbidden origin');
      return;
    }

    const url = new URL(req.url || '', `http://localhost:${PORT}`);

    // 토큰 검증
    const clientToken = url.searchParams.get('token');
    if (clientToken !== AUTH_TOKEN) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    // 동시 세션 제한
    if (sessions.size + sshSessions.size >= MAX_SESSIONS) {
      ws.close(4002, 'Too many sessions');
      return;
    }

    const sessionId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // SSH mode detection
    const mode = url.searchParams.get('mode') || 'local';

    if (mode === 'ssh') {
      const serverId = url.searchParams.get('serverId');
      if (!serverId) {
        ws.close(4004, 'serverId required for SSH mode');
        return;
      }

      handleSSHConnection(ws, serverId, url, sessionId);
      return;
    }

    // --- Local PTY mode ---
    const cwd = url.searchParams.get('cwd') || 'C:\\Users\\user\\Desktop';

    // Validate cwd exists
    let safeCwd = 'C:\\Users\\user\\Desktop';
    try {
      const { validateProjectPath } = require('./path-validator');
      const validation = validateProjectPath(cwd);
      safeCwd = validation.isValid && validation.sanitizedPath ? validation.sanitizedPath : safeCwd;
    } catch {
      safeCwd = fs.existsSync(cwd) ? cwd : safeCwd;
    }

    // Create PTY process
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: safeCwd,
      env: process.env as Record<string, string>,
    });

    sessions.set(sessionId, { pty: ptyProcess, ws });

    // Send session ID to client
    ws.send(JSON.stringify({ type: 'session', id: sessionId }));

    // PTY -> WebSocket (terminal output)
    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
      }
      sessions.delete(sessionId);
    });

    // WebSocket -> PTY (user input)
    ws.on('message', (msg: Buffer | string) => {
      try {
        const message = JSON.parse(msg.toString());
        switch (message.type) {
          case 'input':
            ptyProcess.write(message.data);
            break;
          case 'resize':
            if (message.cols && message.rows) {
              ptyProcess.resize(message.cols, message.rows);
            }
            break;
          case 'command':
            // Run a specific command (e.g., "claude" for Claude Code)
            ptyProcess.write(message.data + '\r');
            break;
        }
      } catch {
        // Raw input fallback
        ptyProcess.write(msg.toString());
      }
    });

    ws.on('close', () => {
      ptyProcess.kill();
      sessions.delete(sessionId);
    });

    ws.on('error', () => {
      ptyProcess.kill();
      sessions.delete(sessionId);
    });
  });

  // Cleanup on process exit
  process.on('exit', () => {
    for (const [, session] of sessions) {
      session.pty.kill();
    }
    for (const [, session] of sshSessions) {
      session.ssh.end();
    }
    wss.close();
  });

  return wss;
}

async function handleSSHConnection(ws: WebSocket, serverId: string, url: URL, sessionId: string) {
  try {
    // Dynamic import to avoid circular deps
    const { getVPSServer, updateVPSLastConnected, saveVPSHostKey } = await import('./database');
    const { decrypt } = await import('./crypto');

    const server = getVPSServer(serverId);
    if (!server) {
      ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
      ws.close(4004, 'Server not found');
      return;
    }

    const cwd = url.searchParams.get('cwd') || server.default_cwd || '/home';
    const tmuxSession = url.searchParams.get('tmux');

    const { Client: SSHClient } = await import('ssh2');
    const sshClient = new SSHClient();

    // Connection config
    const config: any = {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: 15000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
    };

    // Decrypt and set credentials
    if (server.encrypted_credential) {
      const credential = decrypt(server.encrypted_credential);
      if (server.auth_type === 'password') {
        config.password = credential;
      } else if (server.auth_type === 'key_file') {
        const pathMod = require('path');
        const resolved = pathMod.resolve(credential);
        const sshDir = pathMod.resolve(process.env.HOME || 'C:\\Users\\user', '.ssh');
        if (resolved.startsWith(sshDir) && fs.existsSync(resolved)) {
          config.privateKey = fs.readFileSync(resolved);
        }
      } else if (server.auth_type === 'key_content') {
        config.privateKey = credential;
      }
    }

    // Host key verification (TOFU - 경쟁 조건 방지를 위해 매번 DB 재조회)
    config.hostVerifier = (key: Buffer) => {
      const keyHex = key.toString('hex');
      // DB에서 최신 호스트 키를 동기적으로 재조회 (better-sqlite3는 동기)
      const freshServer = getVPSServer(serverId);
      if (freshServer?.host_key) {
        return freshServer.host_key === keyHex;
      }
      // 최초 연결: 원자적으로 저장
      saveVPSHostKey(serverId, keyHex);
      return true;
    };

    sshClient.on('ready', () => {
      ws.send(JSON.stringify({ type: 'session', id: sessionId, mode: 'ssh', server: server.name }));
      updateVPSLastConnected(serverId);

      // Open interactive shell
      sshClient.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'error', message: `Shell error: ${err.message}` }));
          ws.close();
          return;
        }

        sshSessions.set(sessionId, { ssh: sshClient, stream, ws });

        // SSH -> WebSocket
        stream.on('data', (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
          }
        });

        stream.stderr.on('data', (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
          }
        });

        stream.on('close', () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'exit', code: 0 }));
          }
          sshClient.end();
          sshSessions.delete(sessionId);
        });

        // WebSocket -> SSH
        ws.on('message', (msg: Buffer | string) => {
          try {
            const message = JSON.parse(msg.toString());
            switch (message.type) {
              case 'input':
                stream.write(message.data);
                break;
              case 'resize':
                if (message.cols && message.rows) {
                  stream.setWindow(message.rows, message.cols, 0, 0);
                }
                break;
              case 'command':
                stream.write(message.data + '\n');
                break;
            }
          } catch {
            stream.write(msg.toString());
          }
        });

        // Shell escape 함수 (커맨드 인젝션 방지)
        const shellEscape = (str: string): string => `'${str.replace(/'/g, "'\\''")}'`;

        // Auto-cd to cwd (이스케이프 적용)
        if (cwd && cwd !== '/home') {
          setTimeout(() => stream.write(`cd ${shellEscape(cwd)}\n`), 300);
        }

        // Auto-attach/create tmux session (이름 검증 + 이스케이프)
        if (tmuxSession) {
          if (/^[a-zA-Z0-9_-]{1,50}$/.test(tmuxSession)) {
            setTimeout(() => stream.write(`tmux new-session -A -s ${shellEscape(tmuxSession)}\n`), 500);
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid tmux session name (영문/숫자/_-만 허용, 50자 이내)' }));
          }
        }
      });
    });

    sshClient.on('error', (err) => {
      ws.send(JSON.stringify({ type: 'error', message: `SSH error: ${err.message}` }));
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      sshSessions.delete(sessionId);
    });

    sshClient.on('close', () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', code: 0 }));
        ws.close();
      }
      sshSessions.delete(sessionId);
    });

    ws.on('close', () => {
      sshClient.end();
      sshSessions.delete(sessionId);
    });

    ws.on('error', () => {
      sshClient.end();
      sshSessions.delete(sessionId);
    });

    sshClient.connect(config);

  } catch (err: any) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
    ws.close();
  }
}

export { createServer };
