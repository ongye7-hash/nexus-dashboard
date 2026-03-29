import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const db = getDb();

    // 24시간 이상 된 pending 레코드 자동 timeout 처리
    db.prepare("UPDATE tool_approvals SET status = 'timeout', resolved_at = datetime('now') WHERE status = 'pending' AND created_at < datetime('now', '-1 day')").run();

    const body = await request.json();
    const { approvalId, decision } = body;

    if (!approvalId || typeof approvalId !== 'string') {
      return NextResponse.json({ error: 'approvalId가 필요합니다' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(decision)) {
      return NextResponse.json({ error: 'decision은 approve 또는 reject만 가능합니다' }, { status: 400 });
    }

    // pending 상태인 approval만 처리
    const approval = db.prepare(
      'SELECT id, status FROM tool_approvals WHERE id = ?'
    ).get(approvalId) as { id: string; status: string } | undefined;

    if (!approval) {
      return NextResponse.json({ error: '승인 요청을 찾을 수 없습니다' }, { status: 404 });
    }

    if (approval.status !== 'pending') {
      return NextResponse.json({ error: `이미 처리된 요청입니다 (${approval.status})` }, { status: 409 });
    }

    const status = decision === 'approve' ? 'approved' : 'rejected';
    db.prepare(
      'UPDATE tool_approvals SET status = ?, resolved_at = datetime(\'now\') WHERE id = ?'
    ).run(status, approvalId);

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error('Approval API error:', error);
    return NextResponse.json({ error: '승인 처리 실패' }, { status: 500 });
  }
}
