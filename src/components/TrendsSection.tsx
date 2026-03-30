'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  ExternalLink,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Flame,
} from 'lucide-react';

interface TrendItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  source_url: string | null;
  tags: string | null;
  relevance: string | null;
  score: number;
  published_at: string | null;
  created_at: string;
}

interface RelevanceEntry {
  project: string;
  reason: string;
  score: number;
}

const SOURCE_COLORS: Record<string, string> = {
  hackernews: 'bg-orange-500/20 text-orange-400',
  reddit: 'bg-red-500/20 text-red-400',
  rss: 'bg-blue-500/20 text-blue-400',
  github: 'bg-purple-500/20 text-purple-400',
};

function parseRelevance(raw: string | null): RelevanceEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export default function TrendsSection() {
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const res = await fetch(`/api/trends?date=${today}&minScore=0&limit=20`);
        const data = await res.json();
        setTrends(data.trends || []);
      } catch (error) {
        console.error('트렌드 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchTrends();
  }, []);

  if (loading) return null;

  const visibleTrends = expanded ? trends : trends.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-[#18181b] border border-[#27272a] rounded-xl p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-5 h-5 text-orange-400" />
        <h3 className="text-sm font-semibold text-white">오늘의 트렌드</h3>
        <span className="text-xs text-zinc-500">{trends.length}개</span>
      </div>

      {trends.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <TrendingUp className="w-8 h-8 text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-500">오늘의 트렌드가 아직 없습니다</p>
          <p className="text-xs text-zinc-600 mt-1">n8n 워크플로우가 트렌드를 수집하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleTrends.map((trend, i) => {
            const relevance = parseRelevance(trend.relevance);
            const sourceColor = SOURCE_COLORS[trend.source.toLowerCase()] || 'bg-zinc-500/20 text-zinc-400';

            return (
              <motion.div
                key={trend.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-3 bg-[#0f0f10] border border-[#27272a] rounded-lg hover:border-[#3f3f46] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded bg-orange-500/10 text-orange-400 text-xs font-bold flex-shrink-0 mt-0.5">
                    {trend.score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {trend.source_url && /^https?:\/\//i.test(trend.source_url) ? (
                        <a
                          href={trend.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-white hover:text-indigo-400 transition-colors truncate flex items-center gap-1"
                        >
                          {trend.title}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-sm font-medium text-white truncate">{trend.title}</span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{trend.summary}</p>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 text-[10px] rounded ${sourceColor}`}>
                        {trend.source}
                      </span>

                      {trend.tags && trend.tags.split(',').slice(0, 3).map(tag => (
                        <span key={tag.trim()} className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-500 rounded">
                          #{tag.trim()}
                        </span>
                      ))}

                      {relevance.filter(r => r.score >= 6).map(r => (
                        <span key={r.project} className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-indigo-500/10 text-indigo-400 rounded">
                          <Lightbulb className="w-2.5 h-2.5" />
                          {r.project}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {trends.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? '접기' : `${trends.length - 5}개 더 보기`}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
