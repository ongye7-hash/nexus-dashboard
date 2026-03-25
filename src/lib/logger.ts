import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), '.nexus-data', 'logs');
const MAX_LOG_DAYS = 30;

// 디렉토리 존재 여부 캐시 (매번 stat 호출 방지)
let _logDirReady = false;

function ensureLogDir() {
  if (_logDirReady) return;
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  _logDirReady = true;
}

function getLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `nexus-${date}.log`);
}

function formatMessage(level: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  return `[${timestamp}] [${level}] ${message}\n`;
}

// 재진입 방지 플래그 (console.warn → logToFile → 내부 에러 → console.warn 무한 루프 차단)
let _logging = false;

// 비동기 쓰기 버퍼 (동기 I/O 대신 버퍼링)
let _buffer: string[] = [];
let _flushTimer: NodeJS.Timeout | null = null;

function flushBuffer() {
  if (_buffer.length === 0) return;
  try {
    ensureLogDir();
    const logPath = getLogPath();
    const content = _buffer.join('');
    _buffer = [];
    fs.appendFileSync(logPath, content, 'utf-8');
  } catch {
    _buffer = []; // 실패 시 버퍼 비우기
  }
}

export function logToFile(level: string, ...args: unknown[]) {
  if (_logging) return; // 재진입 방지
  _logging = true;
  try {
    const message = formatMessage(level, ...args);
    _buffer.push(message);

    // 500ms 이내에 flush (디바운스)
    if (!_flushTimer) {
      _flushTimer = setTimeout(() => {
        _flushTimer = null;
        flushBuffer();
      }, 500);
    }
  } catch {
    // 로그 실패 — 무시
  } finally {
    _logging = false;
  }
}

export function cleanOldLogs() {
  try {
    ensureLogDir();
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('nexus-') && f.endsWith('.log'))
      .sort()
      .reverse();

    for (let i = MAX_LOG_DAYS; i < files.length; i++) {
      fs.unlinkSync(path.join(LOG_DIR, files[i]));
    }
  } catch {
    // 로그 정리 실패 — 무시
  }
}

export function setupFileLogging() {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args);
    logToFile('WARN', ...args);
  };

  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);
    logToFile('ERROR', ...args);
  };

  cleanOldLogs();
  console.log('[Logger] 파일 로깅 시작');
}
