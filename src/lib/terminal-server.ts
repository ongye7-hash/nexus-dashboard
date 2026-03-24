import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import * as fs from 'fs';
import * as crypto from 'crypto';

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

const sessions = new Map<string, TerminalSession>();
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

  const wss = new WebSocketServer({ port: PORT });
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
    if (sessions.size >= MAX_SESSIONS) {
      ws.close(4002, 'Too many sessions');
      return;
    }

    const cwd = url.searchParams.get('cwd') || 'C:\\Users\\user\\Desktop';
    const sessionId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Validate cwd exists
    const safeCwd = fs.existsSync(cwd) ? cwd : 'C:\\Users\\user\\Desktop';

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
    sessions.forEach((session) => {
      session.pty.kill();
    });
    wss.close();
  });

  return wss;
}

export { createServer };
