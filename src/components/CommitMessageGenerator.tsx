'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  GitCommit,
  RefreshCw,
  Cpu,
  Wand2,
} from 'lucide-react';

interface CommitMessageGeneratorProps {
  projectPath: string;
  onUseMessage?: (message: string) => void;
  className?: string;
}

export default function CommitMessageGenerator({
  projectPath,
  onUseMessage,
  className = '',
}: CommitMessageGeneratorProps) {
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatedBy, setGeneratedBy] = useState<'ai' | 'rule' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async (useAI = true) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/commit-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, useAI }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setMessage('');
      } else if (data.message) {
        setMessage(data.message);
        setGeneratedBy(data.generatedBy);
      } else {
        setError('커밋할 변경사항이 없습니다');
      }
    } catch (err) {
      setError('생성 실패');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 생성 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => generate(true)}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-all"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          AI 커밋 메시지 생성
        </button>
        <button
          onClick={() => generate(false)}
          disabled={loading}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm text-zinc-300 transition-colors"
          title="규칙 기반 생성"
        >
          <Wand2 className="w-4 h-4" />
        </button>
      </div>

      {/* 에러 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 생성된 메시지 */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <div className="flex items-center gap-1">
                {generatedBy === 'ai' ? (
                  <>
                    <Cpu className="w-3 h-3 text-purple-400" />
                    <span>AI 생성</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3 h-3 text-blue-400" />
                    <span>규칙 기반</span>
                  </>
                )}
              </div>
              <button
                onClick={() => generate(generatedBy === 'ai')}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            <div className="relative">
              <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 font-mono text-sm text-white">
                <GitCommit className="inline w-4 h-4 mr-2 text-green-400" />
                {message}
              </div>
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            {onUseMessage && (
              <button
                onClick={() => onUseMessage(message)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium text-white transition-colors"
              >
                <GitCommit className="w-4 h-4" />
                이 메시지로 커밋하기
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
