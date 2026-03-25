import { NextResponse } from 'next/server';
import { verifyToken, revokeSession } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('nexus_token')?.value;

    if (token) {
      const payload = await verifyToken(token);
      if (payload?.sid && typeof payload.sid === 'string') {
        revokeSession(payload.sid);
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set('nexus_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.warn('[Auth] Logout failed:', error);
    return NextResponse.json({ error: '로그아웃 실패' }, { status: 500 });
  }
}
