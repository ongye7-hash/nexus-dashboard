import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const sessions = db.prepare(
      `SELECT id, title, project_path, model, created_at, updated_at
       FROM chat_sessions
       ORDER BY updated_at DESC
       LIMIT 100`
    ).all();

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Sessions list error:', error);
    return NextResponse.json({ error: '세션 목록 조회 실패' }, { status: 500 });
  }
}
