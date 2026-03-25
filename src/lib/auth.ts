import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from './db/index';
import { getSetting, setSetting } from './db/github';

// JWT 서명 키 (설치별 고유, 변경 시 모든 세션 무효화)
const JWT_SECRET_PATH = path.join(process.cwd(), '.nexus-data', 'jwt-secret');
const SESSION_EXPIRY_DAYS = 7;
const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// --- JWT Secret 관리 ---

/** JWT secret을 파일에서 로드하고 process.env에 동기화 (middleware Edge Runtime용) */
function getJwtSecret(): Uint8Array {
  const dir = path.dirname(JWT_SECRET_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let hexSecret: string;

  if (fs.existsSync(JWT_SECRET_PATH)) {
    hexSecret = fs.readFileSync(JWT_SECRET_PATH, 'utf-8').trim();
  } else {
    const secret = crypto.randomBytes(64);
    hexSecret = secret.toString('hex');
    fs.writeFileSync(JWT_SECRET_PATH, hexSecret, { encoding: 'utf-8', mode: 0o600 });
  }

  // middleware(Edge)에서 process.env로 읽을 수 있도록 동기화
  process.env.NEXUS_JWT_SECRET = hexSecret;
  return new Uint8Array(Buffer.from(hexSecret, 'hex'));
}

/** 서버 부팅 시 JWT secret을 process.env에 로드 */
export function loadJwtSecret(): void {
  getJwtSecret();
}

/** 모든 세션 즉시 무효화 (JWT secret 갱신) */
export function rotateJwtSecret(): void {
  const secret = crypto.randomBytes(64);
  const hexSecret = secret.toString('hex');
  fs.writeFileSync(JWT_SECRET_PATH, hexSecret, { encoding: 'utf-8', mode: 0o600 });
  process.env.NEXUS_JWT_SECRET = hexSecret;
}

// --- 비밀번호 관리 ---

/** 비밀번호 설정 여부 확인 */
export function isPasswordSet(): boolean {
  return !!getSetting('auth_password_hash');
}

/** 최초 비밀번호 설정 */
export async function setupPassword(password: string): Promise<void> {
  if (isPasswordSet()) throw new Error('비밀번호가 이미 설정되어 있습니다');
  if (password.length < 8) throw new Error('비밀번호는 최소 8자 이상이어야 합니다');

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  setSetting('auth_password_hash', hash);
}

/** 비밀번호 검증 */
export async function verifyPassword(password: string): Promise<boolean> {
  const hash = getSetting('auth_password_hash');
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

/** 비밀번호 변경 (기존 비밀번호 확인 필요) */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const valid = await verifyPassword(currentPassword);
  if (!valid) throw new Error('현재 비밀번호가 일치하지 않습니다');
  if (newPassword.length < 8) throw new Error('새 비밀번호는 최소 8자 이상이어야 합니다');

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  setSetting('auth_password_hash', hash);

  // 비밀번호 변경 시 모든 기존 세션 무효화
  rotateJwtSecret();
}

// --- JWT + 세션 관리 ---

export interface AuthSession {
  id: string;
  created_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  is_revoked: number;
}

/** JWT 토큰 생성 + 세션 기록 */
export async function createSession(ipAddress: string, userAgent: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const token = await new SignJWT({ sub: 'nexus-user', sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret());

  // jti 해시만 저장 (원본 토큰 저장 안 함)
  const tokenHash = crypto.createHash('sha256').update(jti).digest('hex');

  const db = getDb();
  db.prepare(`
    INSERT INTO auth_sessions (id, token_hash, created_at, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    tokenHash,
    new Date().toISOString(),
    expiresAt.toISOString(),
    ipAddress,
    userAgent.slice(0, 256)  // UA 길이 제한
  );

  return token;
}

/** JWT 검증 (Edge 호환 — DB 조회 없음) */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload;
  } catch {
    return null;
  }
}

/** 세션 폐기 여부 확인 (Node.js API 라우트 전용) */
export function isSessionRevoked(sessionId: string): boolean {
  const db = getDb();
  const session = db.prepare('SELECT is_revoked FROM auth_sessions WHERE id = ?').get(sessionId) as { is_revoked: number } | undefined;
  if (!session) return true;
  return session.is_revoked === 1;
}

/** 특정 세션 강제 종료 */
export function revokeSession(sessionId: string): void {
  const db = getDb();
  db.prepare('UPDATE auth_sessions SET is_revoked = 1 WHERE id = ?').run(sessionId);
}

/** 모든 세션 강제 종료 */
export function revokeAllSessions(): void {
  const db = getDb();
  db.prepare('UPDATE auth_sessions SET is_revoked = 1 WHERE is_revoked = 0').run();
}

/** 활성 세션 목록 조회 */
export function getActiveSessions(): AuthSession[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, created_at, expires_at, ip_address, user_agent, is_revoked
    FROM auth_sessions
    WHERE is_revoked = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `).all() as AuthSession[];
}

/** 만료된 세션 정리 */
export function cleanExpiredSessions(): void {
  const db = getDb();
  db.prepare("DELETE FROM auth_sessions WHERE expires_at < datetime('now') OR is_revoked = 1").run();
}

// --- Rate Limiting ---

/** 로그인 시도 기록 */
export function recordLoginAttempt(ipAddress: string, success: boolean): void {
  const db = getDb();
  db.prepare('INSERT INTO login_attempts (ip_address, attempted_at, success) VALUES (?, ?, ?)')
    .run(ipAddress, new Date().toISOString(), success ? 1 : 0);

  // 오래된 기록 정리 (24시간 이전)
  db.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
}

/** 로그인 잠금 상태 확인 */
export function isLoginLocked(ipAddress: string): { locked: boolean; remainingMinutes: number } {
  const db = getDb();
  const cutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000).toISOString();

  const result = db.prepare(`
    SELECT COUNT(*) as count, MAX(attempted_at) as last_attempt
    FROM login_attempts
    WHERE ip_address = ? AND success = 0 AND attempted_at > ?
  `).get(ipAddress, cutoff) as { count: number; last_attempt: string | null };

  if (result.count >= MAX_LOGIN_ATTEMPTS) {
    const lastAttempt = new Date(result.last_attempt!);
    const unlockAt = new Date(lastAttempt.getTime() + LOCKOUT_MINUTES * 60 * 1000);
    const remaining = Math.ceil((unlockAt.getTime() - Date.now()) / 60000);
    return { locked: true, remainingMinutes: Math.max(0, remaining) };
  }

  return { locked: false, remainingMinutes: 0 };
}

/** 성공 시 해당 IP의 실패 기록 초기화 */
export function clearLoginAttempts(ipAddress: string): void {
  const db = getDb();
  db.prepare('DELETE FROM login_attempts WHERE ip_address = ?').run(ipAddress);
}
