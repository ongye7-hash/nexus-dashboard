import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import fs from 'fs';
import path from 'path';

// 인증 불필요 경로
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/setup',
  '/api/auth/verify',
]);

const PUBLIC_PREFIXES = [
  '/_next/',
  '/favicon',
  '/icons/',
  '/manifest',
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

// Node.js 런타임이므로 파일시스템 직접 접근 가능
function getJwtSecret(): Uint8Array | null {
  try {
    const secretPath = path.join(process.cwd(), '.nexus-data', 'jwt-secret');
    if (fs.existsSync(secretPath)) {
      return new Uint8Array(Buffer.from(fs.readFileSync(secretPath, 'utf-8').trim(), 'hex'));
    }
  } catch {
    console.warn('[Proxy] JWT secret 읽기 실패');
  }
  return null;
}

// Next.js 16: middleware → proxy로 변경 (Node.js 런타임)
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 공개 경로는 통과
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // JWT secret 로드 (파일에서 직접 읽기)
  const secret = getJwtSecret();
  if (!secret) {
    return redirectToLogin(request);
  }

  // JWT 검증
  const token = request.cookies.get('nexus_token')?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return redirectToLogin(request);
  }
}

function redirectToLogin(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest).*)',
  ],
};
