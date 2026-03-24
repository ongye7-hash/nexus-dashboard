'use client';

import { motion } from 'framer-motion';

interface StreakDisplayProps {
  current: number;
  longest: number;
  className?: string;
}

export default function StreakDisplay({ current, longest, className = '' }: StreakDisplayProps) {
  const getFlameColor = () => {
    if (current >= 30) return 'from-purple-500 to-pink-500';
    if (current >= 14) return 'from-orange-500 to-red-500';
    if (current >= 7) return 'from-yellow-500 to-orange-500';
    if (current >= 3) return 'from-yellow-400 to-yellow-500';
    return 'from-zinc-500 to-zinc-400';
  };

  const getFlameSize = () => {
    if (current >= 30) return 'text-5xl';
    if (current >= 14) return 'text-4xl';
    if (current >= 7) return 'text-3xl';
    return 'text-2xl';
  };

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* 불꽃 아이콘 */}
      <motion.div
        animate={{
          scale: current > 0 ? [1, 1.1, 1] : 1,
          rotate: current > 0 ? [0, -5, 5, 0] : 0
        }}
        transition={{
          duration: 1.5,
          repeat: current > 0 ? Infinity : 0,
          repeatType: "reverse"
        }}
        className={`${getFlameSize()}`}
      >
        <span
          className={`bg-gradient-to-t ${getFlameColor()} bg-clip-text text-transparent`}
          style={{ textShadow: current >= 7 ? '0 0 20px rgba(251, 146, 60, 0.5)' : 'none' }}
        >
          🔥
        </span>
      </motion.div>

      {/* 숫자 */}
      <div className="flex flex-col">
        <div className="flex items-baseline gap-2">
          <motion.span
            key={current}
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-3xl font-black bg-gradient-to-r ${getFlameColor()} bg-clip-text text-transparent`}
          >
            {current}
          </motion.span>
          <span className="text-sm text-zinc-400">일 연속</span>
        </div>
        <div className="text-xs text-zinc-500">
          최장 기록: {longest}일
        </div>
      </div>

      {/* 마일스톤 표시 */}
      {current > 0 && (
        <div className="flex gap-1 ml-4">
          {[3, 7, 14, 30, 100].map(milestone => (
            <motion.div
              key={milestone}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${current >= milestone
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-500'
                }`}
            >
              {milestone}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
