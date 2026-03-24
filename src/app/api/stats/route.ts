import { NextResponse } from 'next/server';
import {
  getDailyActivity,
  getStreak,
  updateStreak,
  getAllBadges,
  checkAndAwardBadges,
  recordActivity,
} from '@/lib/database';

export async function GET() {
  try {
    // 스트릭 업데이트 (오늘 처음 접속 시)
    const streak = updateStreak();

    // 뱃지 체크
    const newBadges = checkAndAwardBadges();

    // 활동 데이터 (1년)
    const activity = getDailyActivity(365);

    // 모든 뱃지
    const badges = getAllBadges();

    // 통계 계산
    const totalDays = activity.length;
    const totalCommits = activity.reduce((sum, d) => sum + d.commit_count, 0);
    const totalMinutes = activity.reduce((sum, d) => sum + d.total_minutes, 0);
    const totalFileChanges = activity.reduce((sum, d) => sum + d.file_changes, 0);

    // 이번 주 통계
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weekStr = oneWeekAgo.toISOString().split('T')[0];
    const thisWeek = activity.filter(d => d.date >= weekStr);
    const weekCommits = thisWeek.reduce((sum, d) => sum + d.commit_count, 0);
    const weekMinutes = thisWeek.reduce((sum, d) => sum + d.total_minutes, 0);

    return NextResponse.json({
      streak,
      badges,
      newBadges,
      activity,
      stats: {
        totalDays,
        totalCommits,
        totalMinutes,
        totalFileChanges,
        weekCommits,
        weekMinutes,
        weekDays: thisWeek.length,
      },
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { action, type, count } = await request.json();

    switch (action) {
      case 'record':
        if (type && ['project_open', 'commit', 'file_change'].includes(type)) {
          recordActivity(type, count || 1);
          updateStreak();
          const newBadges = checkAndAwardBadges();
          return NextResponse.json({ success: true, newBadges });
        }
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to record activity' },
      { status: 500 }
    );
  }
}
