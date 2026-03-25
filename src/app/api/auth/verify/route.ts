import { NextResponse } from 'next/server';
import { verifyToken, isSessionRevoked, isPasswordSet } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    // 비밀번호 미설정 → 초기 설정 필요
    if (!isPasswordSet()) {
      return NextResponse.json({ authenticated: false, needsSetup: true });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get('nexus_token')?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false, needsSetup: false });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ authenticated: false, needsSetup: false });
    }

    // DB에서 세션 폐기 여부 확인
    const sessionId = payload.sid as string;
    if (!sessionId || isSessionRevoked(sessionId)) {
      return NextResponse.json({ authenticated: false, needsSetup: false });
    }

    return NextResponse.json({ authenticated: true, needsSetup: false });
  } catch (error) {
    console.warn('[Auth] Verify failed:', error);
    return NextResponse.json({ authenticated: false, needsSetup: false });
  }
}
