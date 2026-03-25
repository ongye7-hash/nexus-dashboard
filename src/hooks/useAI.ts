'use client';

import { useState, useCallback, useEffect } from 'react';

interface ModelInfo {
  id: string;
  label: string;
  cost: string;
  speed: string;
}

interface AIStatus {
  online: boolean;
  provider: string;
  models: ModelInfo[];
  defaultModel: string;
}

export function useAI() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Claude API 상태 확인
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ai?action=status');
      const data = await res.json();
      setStatus(data);
      return data;
    } catch {
      setStatus({ online: false, provider: 'claude', models: [], defaultModel: '' });
      return null;
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const callAI = useCallback(async (
    action: string,
    params: Record<string, unknown>
  ): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'AI 요청 실패');
      }

      return data.summary || data.readme || data.explanation || data.suggestions || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 요청에 실패했습니다';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const summarizeProject = useCallback(async (projectPath: string, model?: string) => {
    return callAI('summarize', { projectPath, model });
  }, [callAI]);

  const generateReadme = useCallback(async (projectPath: string, model?: string) => {
    return callAI('generateReadme', { projectPath, model });
  }, [callAI]);

  const explainCode = useCallback(async (
    filePath: string, lineStart: number, lineEnd?: number, model?: string
  ) => {
    return callAI('explainCode', { filePath, lineStart, lineEnd, model });
  }, [callAI]);

  const suggestImprovements = useCallback(async (projectPath: string, model?: string) => {
    return callAI('suggestImprovements', { projectPath, model });
  }, [callAI]);

  return {
    status,
    loading,
    error,
    checkStatus,
    summarizeProject,
    generateReadme,
    explainCode,
    suggestImprovements,
    isOnline: status?.online ?? false,
  };
}
