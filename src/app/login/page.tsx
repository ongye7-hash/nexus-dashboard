'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, Shield, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // 초기 상태 확인
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/verify');
        const data = await res.json();

        if (data.authenticated) {
          router.replace('/');
          return;
        }
        setNeedsSetup(data.needsSetup);
      } catch {
        console.warn('[Login] Auth check failed');
      } finally {
        setChecking(false);
      }
    }
    checkAuth();
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('비밀번호를 입력해주세요');
      return;
    }

    if (needsSetup) {
      if (password.length < 8) {
        setError('비밀번호는 최소 8자 이상이어야 합니다');
        return;
      }
      if (password !== confirmPassword) {
        setError('비밀번호가 일치하지 않습니다');
        return;
      }
    }

    setLoading(true);

    try {
      // setup API가 비밀번호 설정 + JWT 발급을 한 번에 처리
      const endpoint = needsSetup ? '/api/auth/setup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (needsSetup ? '설정 실패' : '로그인 실패'));
        setLoading(false);
        return;
      }

      router.replace('/');
    } catch {
      setError('서버에 연결할 수 없습니다');
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* 로고 영역 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
            <Shield className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Nexus Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {needsSetup ? '처음 사용을 위해 비밀번호를 설정해주세요' : '비밀번호를 입력해주세요'}
          </p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={needsSetup ? '새 비밀번호 (8자 이상)' : '비밀번호'}
              className="w-full pl-10 pr-10 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
              autoFocus
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {needsSetup && (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 확인"
                className="w-full pl-10 pr-10 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : needsSetup ? (
              '비밀번호 설정 및 시작'
            ) : (
              '로그인'
            )}
          </button>
        </form>

        {/* 하단 정보 */}
        <p className="text-center text-xs text-zinc-600 mt-6">
          {needsSetup
            ? '이 비밀번호로 대시보드에 접근합니다'
            : '5회 실패 시 15분간 잠금됩니다'}
        </p>
      </div>
    </div>
  );
}
