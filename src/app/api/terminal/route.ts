import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    // 클라이언트의 JWT를 WebSocket 인증 토큰으로 전달
    // (WebSocket은 쿠키를 자동 전송하지 않으므로 URL 파라미터로 전달)
    const cookieStore = await cookies();
    const token = cookieStore.get('nexus_token')?.value || null;

    return NextResponse.json({
      wsUrl: 'ws://localhost:8508',
      token,
      status: token ? 'available' : 'unavailable',
    });
  } catch (error) {
    console.warn('터미널 토큰 읽기 실패:', error);
    return NextResponse.json({
      wsUrl: 'ws://localhost:8508',
      token: null,
      status: 'unavailable',
    });
  }
}
