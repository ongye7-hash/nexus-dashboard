import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '세션 ID가 필요합니다' }, { status: 400 });
    }

    const db = getDb();

    const session = db.prepare(
      'SELECT id, title, project_path, model, created_at, updated_at FROM chat_sessions WHERE id = ?'
    ).get(id);

    if (!session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    }

    const messages = db.prepare(
      'SELECT id, role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC'
    ).all(id);

    return NextResponse.json({ session, messages });
  } catch (error) {
    console.error('Session detail error:', error);
    return NextResponse.json({ error: '세션 조회 실패' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '세션 ID가 필요합니다' }, { status: 400 });
    }

    const db = getDb();

    // 메시지 먼저 삭제 후 세션 삭제
    db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(id);
    const result = db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Session delete error:', error);
    return NextResponse.json({ error: '세션 삭제 실패' }, { status: 500 });
  }
}
