'use client';

import { useState, useCallback, useEffect } from 'react';

interface AIStatus {
  online: boolean;
  models: string[];
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
    } catch (err) {
      setStatus({ online: false, models: [], defaultModel: '' });
      return null;
    }
  }, []);

  // 초기 상태 확인
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // 프로젝트 요약
  const summarizeProject = useCallback(async (
    projectPath: string,
    model?: string
  ): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'summarize',
          projectPath,
          model,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to summarize');
      }

      return data.summary;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // README 생성
  const generateReadme = useCallback(async (
    projectPath: string,
    model?: string
  ): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateReadme',
          projectPath,
          model,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate README');
      }

      return data.readme;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // 코드 설명
  const explainCode = useCallback(async (
    filePath: string,
    lineStart: number,
    lineEnd?: number,
    model?: string
  ): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'explainCode',
          filePath,
          lineStart,
          lineEnd,
          model,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to explain code');
      }

      return data.explanation;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // 개선점 제안
  const suggestImprovements = useCallback(async (
    projectPath: string,
    model?: string
  ): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggestImprovements',
          projectPath,
          model,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get suggestions');
      }

      return data.suggestions;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

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
