import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), '.nexus-data', 'logs');
const MAX_LOG_DAYS = 30;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
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

export function logToFile(level: string, ...args: unknown[]) {
  try {
    ensureLogDir();
    const logPath = getLogPath();
    const message = formatMessage(level, ...args);
    fs.appendFileSync(logPath, message, 'utf-8');
  } catch {
    // 로그 저장 실패 — 무한 재귀 방지를 위해 무시
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

// Intercept console.warn and console.error to also log to file
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

  // Clean old logs on startup
  cleanOldLogs();

  console.log('[Logger] 파일 로깅 시작');
}
