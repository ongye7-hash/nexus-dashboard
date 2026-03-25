'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ProgressSectionProps {}

export default function ProgressSection({}: ProgressSectionProps) {
  const [content, setContent] = useState<string>('');
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch('/api/progress')
      .then(res => res.json())
      .then(data => {
        setExists(data.exists);
        setContent(data.content || '');
      })
      .catch(err => console.warn('progress 로드 실패:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const data = await res.json();
      if (data.success) {
        setExists(true);
        setContent(data.content);
      }
    } catch (err) {
      console.warn('progress 생성 실패:', err);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return null;

  if (!exists) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/30 border border-zinc-700/30"
      >
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <FileText className="w-4 h-4" />
          <span>작업 기록이 없습니다</span>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-xs text-white transition-colors"
        >
          {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          기록 시작
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-[#18181b] border border-[#27272a] overflow-hidden"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-4 py-3 border-b border-[#27272a] hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-white">현재 작업 상태</span>
        </div>
        <span className="text-xs text-zinc-500">{collapsed ? '펼치기' : '접기'}</span>
      </button>
      {!collapsed && (
        <div className="p-4 prose prose-sm prose-invert max-w-none text-xs">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </motion.div>
  );
}
