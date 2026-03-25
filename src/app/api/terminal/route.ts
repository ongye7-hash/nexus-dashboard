import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';

function getWsUrl(requestHeaders: Headers): string {
  // 배포 환경: nginx 뒤에서는 wss://도메인/ws/terminal 경로 사용
  const host = requestHeaders.get('host') || 'localhost:8507';
  const proto = requestHeaders.get('x-forwarded-proto');
  const isSecure = proto === 'https';

  if (isSecure || process.env.NODE_ENV === 'production') {
    // 프로덕션: nginx가 /ws/terminal → 8508으로 프록시
    return `${isSecure ? 'wss' : 'ws'}://${host}/ws/terminal`;
  }

  // 로컬 개발: 직접 연결
  return 'ws://localhost:8508';
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('nexus_token')?.value || null;
    const requestHeaders = await headers();
    const wsUrl = getWsUrl(requestHeaders);

    return NextResponse.json({
      wsUrl,
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
