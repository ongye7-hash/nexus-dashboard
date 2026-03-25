import { NextResponse } from 'next/server';
import { verifyToken, getActiveSessions, revokeSession, isSessionRevoked } from '@/lib/auth';
import { cookies } from 'next/headers';

async function requireAuth(): Promise<{ sessionId: string } | NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get('nexus_token')?.value;
  if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload?.sid || typeof payload.sid !== 'string') {
    return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 401 });
  }

  if (isSessionRevoked(payload.sid)) {
    return NextResponse.json({ error: '세션이 만료되었습니다' }, { status: 401 });
  }

  return { sessionId: payload.sid };
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const sessions = getActiveSessions().map(s => ({
      id: s.id,
      created_at: s.created_at,
      expires_at: s.expires_at,
      ip_address: s.ip_address,
      user_agent: s.user_agent,
      is_current: s.id === auth.sessionId,
    }));

    return NextResponse.json({ sessions });
  } catch (error) {
    console.warn('[Auth] Sessions list failed:', error);
    return NextResponse.json({ error: '세션 목록 조회 실패' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: '세션 ID를 지정해주세요' }, { status: 400 });
    }

    // 자기 자신의 세션은 삭제 불가 (logout 사용)
    if (sessionId === auth.sessionId) {
      return NextResponse.json({ error: '현재 세션은 로그아웃으로 종료해주세요' }, { status: 400 });
    }

    revokeSession(sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.warn('[Auth] Session revoke failed:', error);
    return NextResponse.json({ error: '세션 종료 실패' }, { status: 500 });
  }
}
