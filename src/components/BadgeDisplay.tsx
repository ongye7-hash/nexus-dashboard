'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earned_at: string | null;
}

// 기본 뱃지 목록 (획득 가능한 모든 뱃지)
const ALL_BADGES: Omit<Badge, 'earned_at'>[] = [
  { id: 'first_project', name: '첫 발걸음', description: '첫 프로젝트 열기', icon: '👶', rarity: 'common' },
  { id: 'explorer', name: '탐험가', description: '10개 프로젝트 열기', icon: '🧭', rarity: 'common' },
  { id: 'architect', name: '건축가', description: '50개 프로젝트 열기', icon: '🏛️', rarity: 'rare' },
  { id: 'first_commit', name: '첫 커밋', description: '첫 번째 커밋', icon: '✍️', rarity: 'common' },
  { id: 'committer', name: '커미터', description: '100번 커밋', icon: '📝', rarity: 'rare' },
  { id: 'commit_machine', name: '커밋 머신', description: '1000번 커밋', icon: '🤖', rarity: 'epic' },
  { id: 'streak_3', name: '워밍업', description: '3일 연속 작업', icon: '🌱', rarity: 'common' },
  { id: 'streak_7', name: '주간 챔피언', description: '7일 연속 작업', icon: '🏃', rarity: 'rare' },
  { id: 'streak_14', name: '투 위크 워리어', description: '14일 연속 작업', icon: '⚔️', rarity: 'rare' },
  { id: 'streak_30', name: '월간 마스터', description: '30일 연속 작업', icon: '🏆', rarity: 'epic' },
  { id: 'streak_100', name: '전설의 개발자', description: '100일 연속 작업', icon: '👑', rarity: 'legendary' },
  { id: 'night_owl', name: '올빼미', description: '자정 이후 작업', icon: '🦉', rarity: 'common' },
  { id: 'early_bird', name: '얼리버드', description: '오전 6시 이전 작업', icon: '🐦', rarity: 'common' },
  { id: 'weekend_warrior', name: '주말 전사', description: '주말에 작업', icon: '💪', rarity: 'common' },
  { id: 'file_master', name: '파일 마스터', description: '1000개 파일 변경', icon: '📁', rarity: 'rare' },
  { id: 'code_veteran', name: '코드 베테랑', description: '10000개 파일 변경', icon: '🎖️', rarity: 'epic' },
];

interface BadgeDisplayProps {
  earnedBadges: Badge[];
  className?: string;
}

export default function BadgeDisplay({ earnedBadges, className = '' }: BadgeDisplayProps) {
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);

  const earnedIds = new Set(earnedBadges.map(b => b.id));

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'legendary': return 'from-yellow-400 via-orange-400 to-red-400';
      case 'epic': return 'from-purple-400 to-pink-400';
      case 'rare': return 'from-blue-400 to-cyan-400';
      default: return 'from-zinc-400 to-zinc-500';
    }
  };

  const getRarityBg = (rarity: string) => {
    switch (rarity) {
      case 'legendary': return 'bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/50';
      case 'epic': return 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/50';
      case 'rare': return 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/50';
      default: return 'bg-zinc-800/50 border-zinc-700';
    }
  };

  const getRarityLabel = (rarity: string) => {
    switch (rarity) {
      case 'legendary': return '전설';
      case 'epic': return '에픽';
      case 'rare': return '희귀';
      default: return '일반';
    }
  };

  return (
    <div className={className}>
      {/* 획득한 뱃지 */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-zinc-400 mb-2">
          획득한 뱃지 ({earnedBadges.length}/{ALL_BADGES.length})
        </h4>
        <div className="flex flex-wrap gap-2">
          {ALL_BADGES.map((badge) => {
            const earned = earnedIds.has(badge.id);
            const fullBadge = earned
              ? earnedBadges.find(b => b.id === badge.id)!
              : { ...badge, earned_at: null };

            return (
              <motion.button
                key={badge.id}
                whileHover={{ scale: earned ? 1.1 : 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedBadge(fullBadge)}
                className={`relative w-12 h-12 rounded-xl flex items-center justify-center text-2xl
                  border transition-all cursor-pointer
                  ${earned ? getRarityBg(badge.rarity) : 'bg-zinc-900/50 border-zinc-800'}
                  ${!earned && 'opacity-40 grayscale'}`}
              >
                {badge.icon}
                {earned && badge.rarity !== 'common' && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                    className={`absolute inset-0 rounded-xl bg-gradient-to-r ${getRarityColor(badge.rarity)} opacity-20`}
                    style={{ filter: 'blur(4px)' }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 뱃지 상세 모달 */}
      <AnimatePresence>
        {selectedBadge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedBadge(null)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={`relative p-6 rounded-2xl border max-w-sm w-full
                ${getRarityBg(selectedBadge.rarity)}`}
            >
              {/* 레어도 표시 */}
              <div className={`absolute top-4 right-4 px-2 py-1 rounded-full text-xs font-bold
                bg-gradient-to-r ${getRarityColor(selectedBadge.rarity)} text-black`}>
                {getRarityLabel(selectedBadge.rarity)}
              </div>

              {/* 아이콘 */}
              <div className="text-6xl text-center mb-4">
                {selectedBadge.icon}
              </div>

              {/* 이름 & 설명 */}
              <h3 className={`text-xl font-bold text-center mb-2
                bg-gradient-to-r ${getRarityColor(selectedBadge.rarity)} bg-clip-text text-transparent`}>
                {selectedBadge.name}
              </h3>
              <p className="text-zinc-400 text-center text-sm mb-4">
                {selectedBadge.description}
              </p>

              {/* 획득 상태 */}
              {selectedBadge.earned_at ? (
                <div className="text-center text-xs text-emerald-400">
                  ✅ {new Date(selectedBadge.earned_at).toLocaleDateString('ko-KR')}에 획득
                </div>
              ) : (
                <div className="text-center text-xs text-zinc-500">
                  🔒 아직 획득하지 않음
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
