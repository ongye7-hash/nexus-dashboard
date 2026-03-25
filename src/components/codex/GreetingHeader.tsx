'use client';

import { motion } from 'framer-motion';
import {
  Sun, Moon, Sunrise, Sunset, Flame, FolderOpen, Radio, RefreshCw, Clock,
} from 'lucide-react';

interface YesterdayRecap {
  commits: number;
  projects: number;
  minutes: number;
}

interface StreakInfo {
  current: number;
  longest: number;
  lastActiveDate: string;
}

interface GreetingHeaderProps {
  projectCount: number;
  runningCount: number;
  streak: StreakInfo | null;
  yesterdayRecap: YesterdayRecap | null;
  onOpenMorningRoutine: () => void;
}

export default function GreetingHeader({
  projectCount,
  runningCount,
  streak,
  yesterdayRecap,
  onOpenMorningRoutine,
}: GreetingHeaderProps) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { text: '좋은 아침이야', icon: Sunrise, period: 'morning' };
    if (hour >= 12 && hour < 17) return { text: '오후도 화이팅', icon: Sun, period: 'afternoon' };
    if (hour >= 17 && hour < 21) return { text: '저녁 개발 시작', icon: Sunset, period: 'evening' };
    return { text: '야간 코딩 모드', icon: Moon, period: 'night' };
  };

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  return (
    <>
      {/* 인사말 + 스트릭 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-transparent border border-indigo-500/20 p-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${
              greeting.period === 'morning' ? 'bg-amber-500/20' :
              greeting.period === 'afternoon' ? 'bg-yellow-500/20' :
              greeting.period === 'evening' ? 'bg-orange-500/20' :
              'bg-indigo-500/20'
            }`}>
              <GreetingIcon className={`w-6 h-6 ${
                greeting.period === 'morning' ? 'text-amber-400' :
                greeting.period === 'afternoon' ? 'text-yellow-400' :
                greeting.period === 'evening' ? 'text-orange-400' :
                'text-indigo-400'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">{greeting.text}</h1>
                {streak && streak.current > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/15 border border-orange-500/30 rounded-full">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-bold text-orange-400">Day {streak.current}</span>
                  </div>
                )}
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-zinc-400">
                <FolderOpen className="w-4 h-4" />
                <span>{projectCount}개 프로젝트</span>
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <Radio className="w-4 h-4 animate-pulse" />
                <span>{runningCount}개 실행 중</span>
              </div>
            </div>
            <button
              onClick={onOpenMorningRoutine}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium text-white transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Morning Routine
            </button>
          </div>
        </div>

        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -right-5 -bottom-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
      </motion.div>

      {/* 어제 요약 */}
      {yesterdayRecap && (yesterdayRecap.commits > 0 || yesterdayRecap.projects > 0 || yesterdayRecap.minutes > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/5 border border-indigo-500/15"
        >
          <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-sm text-zinc-300">
            어제: 커밋 <span className="font-semibold text-indigo-400">{yesterdayRecap.commits}</span>개,{' '}
            <span className="font-semibold text-indigo-400">{yesterdayRecap.projects}</span>개 프로젝트 작업,{' '}
            <span className="font-semibold text-indigo-400">{yesterdayRecap.minutes}</span>분 코딩
          </span>
        </motion.div>
      )}
    </>
  );
}
