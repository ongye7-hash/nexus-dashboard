import { NextResponse } from 'next/server';
import { isPasswordSet, setupPassword, createSession } from '@/lib/auth';

export async function GET() {
  try {
    return NextResponse.json({ isSetup: isPasswordSet() });
  } catch (error) {
    console.warn('[Auth] Setup check failed:', error);
    return NextResponse.json({ error: '상태 확인 실패' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (isPasswordSet()) {
      return NextResponse.json({ error: '비밀번호가 이미 설정되어 있습니다' }, { status: 400 });
    }

    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '비밀번호를 입력해주세요' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: '비밀번호는 최소 8자 이상이어야 합니다' }, { status: 400 });
    }

    // 비밀번호 설정 + 즉시 로그인 (2단계를 1단계로 합침)
    await setupPassword(password);

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const token = await createSession(ip, userAgent);

    const response = NextResponse.json({ success: true });
    response.cookies.set('nexus_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.warn('[Auth] Setup failed:', error);
    const message = error instanceof Error ? error.message : '비밀번호 설정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
