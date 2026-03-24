'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface DailyActivity {
  date: string;
  commit_count: number;
  file_changes: number;
  total_minutes: number;
}

interface ActivityHeatmapProps {
  data: DailyActivity[];
  className?: string;
}

export default function ActivityHeatmap({ data, className = '' }: ActivityHeatmapProps) {
  const { weeks, maxActivity, monthLabels } = useMemo(() => {
    // 53주 (약 1년) 데이터 준비
    const today = new Date();
    const weeks: (DailyActivity | null)[][] = [];
    const dateMap = new Map(data.map(d => [d.date, d]));

    // 오늘이 속한 주의 토요일부터 시작해서 53주 전까지
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364);

    // 시작일을 일요일로 맞추기
    startDate.setDate(startDate.getDate() - startDate.getDay());

    let currentDate = new Date(startDate);
    let currentWeek: (DailyActivity | null)[] = [];

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const activity = dateMap.get(dateStr) || null;
      currentWeek.push(activity);

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    // 최대 활동량 계산
    const maxActivity = Math.max(
      ...data.map(d => d.commit_count + d.file_changes),
      1
    );

    // 월 레이블
    const monthLabels: { label: string; weekIndex: number }[] = [];
    const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    let lastMonth = -1;

    weeks.forEach((week, weekIndex) => {
      const firstValidDay = week.find(d => d !== null);
      if (firstValidDay) {
        const month = new Date(firstValidDay.date).getMonth();
        if (month !== lastMonth) {
          monthLabels.push({ label: months[month], weekIndex });
          lastMonth = month;
        }
      } else {
        // 데이터가 없는 주는 첫 번째 날짜 계산
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + weekIndex * 7);
        const month = weekStart.getMonth();
        if (month !== lastMonth) {
          monthLabels.push({ label: months[month], weekIndex });
          lastMonth = month;
        }
      }
    });

    return { weeks, maxActivity, monthLabels };
  }, [data]);

  const getColor = (activity: DailyActivity | null) => {
    if (!activity) return 'bg-zinc-800/50';

    const total = activity.commit_count + activity.file_changes;
    if (total === 0) return 'bg-zinc-800/50';

    const intensity = Math.min(total / maxActivity, 1);

    if (intensity < 0.25) return 'bg-emerald-900/70';
    if (intensity < 0.5) return 'bg-emerald-700/80';
    if (intensity < 0.75) return 'bg-emerald-500/90';
    return 'bg-emerald-400';
  };

  const getTooltip = (activity: DailyActivity | null, weekIndex: number, dayIndex: number) => {
    const date = new Date();
    date.setDate(date.getDate() - 364 + weekIndex * 7 + dayIndex - date.getDay());
    const dateStr = date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });

    if (!activity || (activity.commit_count === 0 && activity.file_changes === 0)) {
      return `${dateStr}\n활동 없음`;
    }

    const lines = [dateStr];
    if (activity.commit_count > 0) lines.push(`커밋: ${activity.commit_count}회`);
    if (activity.file_changes > 0) lines.push(`파일 변경: ${activity.file_changes}개`);
    if (activity.total_minutes > 0) {
      const hours = Math.floor(activity.total_minutes / 60);
      const mins = activity.total_minutes % 60;
      lines.push(`작업 시간: ${hours > 0 ? `${hours}시간 ` : ''}${mins}분`);
    }
    return lines.join('\n');
  };

  const days = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className={`${className}`}>
      {/* 월 레이블 */}
      <div className="flex mb-1 ml-8 text-xs text-zinc-500">
        {monthLabels.map(({ label, weekIndex }, idx) => (
          <span
            key={idx}
            className="absolute"
            style={{ left: `${weekIndex * 14 + 32}px` }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="flex mt-6">
        {/* 요일 레이블 */}
        <div className="flex flex-col gap-[3px] mr-2 text-xs text-zinc-500">
          {days.map((day, idx) => (
            <div key={day} className="h-[12px] flex items-center">
              {idx % 2 === 1 ? day : ''}
            </div>
          ))}
        </div>

        {/* 히트맵 그리드 */}
        <div className="flex gap-[3px]">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {week.map((activity, dayIndex) => (
                <motion.div
                  key={dayIndex}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: (weekIndex * 7 + dayIndex) * 0.001,
                    duration: 0.2
                  }}
                  className={`w-[12px] h-[12px] rounded-sm ${getColor(activity)}
                    hover:ring-1 hover:ring-white/30 cursor-pointer transition-all`}
                  title={getTooltip(activity, weekIndex, dayIndex)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 범례 */}
      <div className="flex items-center justify-end mt-3 gap-1 text-xs text-zinc-500">
        <span>Less</span>
        <div className="w-[12px] h-[12px] rounded-sm bg-zinc-800/50" />
        <div className="w-[12px] h-[12px] rounded-sm bg-emerald-900/70" />
        <div className="w-[12px] h-[12px] rounded-sm bg-emerald-700/80" />
        <div className="w-[12px] h-[12px] rounded-sm bg-emerald-500/90" />
        <div className="w-[12px] h-[12px] rounded-sm bg-emerald-400" />
        <span>More</span>
      </div>
    </div>
  );
}
