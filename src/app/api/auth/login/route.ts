import { NextResponse } from 'next/server';
import {
  isPasswordSet,
  verifyPassword,
  createSession,
  recordLoginAttempt,
  isLoginLocked,
  clearLoginAttempts,
} from '@/lib/auth';

export async function POST(request: Request) {
  try {
    if (!isPasswordSet()) {
      return NextResponse.json({ error: '비밀번호가 설정되지 않았습니다' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Rate limiting 체크
    const lockStatus = isLoginLocked(ip);
    if (lockStatus.locked) {
      return NextResponse.json(
        { error: `로그인이 잠겼습니다. ${lockStatus.remainingMinutes}분 후 다시 시도해주세요` },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '비밀번호를 입력해주세요' }, { status: 400 });
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      recordLoginAttempt(ip, false);
      return NextResponse.json({ error: '비밀번호가 일치하지 않습니다' }, { status: 401 });
    }

    // 성공: 세션 생성
    clearLoginAttempts(ip);
    recordLoginAttempt(ip, true);
    const token = await createSession(ip, userAgent);

    const response = NextResponse.json({ success: true });
    response.cookies.set('nexus_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7일
    });

    return response;
  } catch (error) {
    console.warn('[Auth] Login failed:', error);
    return NextResponse.json({ error: '로그인 처리 실패' }, { status: 500 });
  }
}
