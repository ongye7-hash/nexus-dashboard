import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TOKEN_PATH = path.join(process.cwd(), '.nexus-data', 'terminal-token');

export async function GET() {
  try {
    // 서버가 생성한 토큰 읽기
    const token = fs.existsSync(TOKEN_PATH)
      ? fs.readFileSync(TOKEN_PATH, 'utf-8').trim()
      : null;

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
