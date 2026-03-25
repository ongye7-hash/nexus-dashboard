'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Sparkles,
  FileText,
  Lightbulb,
  Copy,
  Check,
  Loader2,
  WifiOff,
  ChevronDown,
  Download,
  Terminal,
  Save,
  RefreshCw,
} from 'lucide-react';
import { useAI } from '@/hooks/useAI';
import ReactMarkdown from 'react-markdown';

interface AIAssistantProps {
  projectPath: string;
  projectName: string;
  onClose?: () => void;
  onOpenTerminal?: (command: string) => void;
}

type AIAction = 'summarize' | 'generateReadme' | 'suggestImprovements';

interface ModelInfo {
  id: string;
  label: string;
  cost: string;
  speed: string;
}

export default function AIAssistant({
  projectPath,
  projectName,
  onClose,
  onOpenTerminal,
}: AIAssistantProps) {
  const {
    status,
    loading,
    error,
    isOnline,
    summarizeProject,
    generateReadme,
    suggestImprovements,
    checkStatus,
  } = useAI();

  const [result, setResult] = useState<string | null>(null);
  const [currentAction, setCurrentAction] = useState<AIAction | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isCached, setIsCached] = useState(false);

  // API 키 입력 상태
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // 저장 상태
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleAction = async (action: AIAction) => {
    setCurrentAction(action);
    setResult(null);
    setIsCached(false);

    let response: string | null = null;
    const model = selectedModel || undefined;

    switch (action) {
      case 'summarize':
        response = await summarizeProject(projectPath, model);
        break;
      case 'generateReadme':
        response = await generateReadme(projectPath, model);
        break;
      case 'suggestImprovements':
        response = await suggestImprovements(projectPath, model);
        break;
    }

    if (response) {
      setResult(response);
    }
  };

  // 캐시 무시하고 다시 분석
  const handleRefresh = async () => {
    if (!currentAction) return;
    setResult(null);
    setIsCached(false);

    const model = selectedModel || undefined;
    // noCache 플래그를 전달하기 위해 직접 fetch
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: currentAction,
          projectPath,
          model,
          noCache: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const key = currentAction === 'summarize' ? 'summary'
          : currentAction === 'generateReadme' ? 'readme'
          : 'suggestions';
        setResult(data[key]);
      }
    } catch {}
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadReadme = () => {
    if (result && currentAction === 'generateReadme') {
      const blob = new Blob([result], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'README.md';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // README를 프로젝트에 바로 저장
  const handleSaveReadmeToProject = async () => {
    if (!result || currentAction !== 'generateReadme') return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveReadme', projectPath, content: result }),
      });
      if (res.ok) {
        setSaveMessage('README.md가 프로젝트에 저장되었습니다');
      } else {
        setSaveMessage('저장에 실패했습니다');
      }
    } catch {
      setSaveMessage('저장에 실패했습니다');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // 리뷰 결과를 파일로 저장 후 Claude Code로 적용
  const handleApplyWithClaudeCode = async () => {
    if (!result || !onOpenTerminal) return;
    setSaving(true);
    try {
      // 리뷰 결과를 서버에 임시 파일로 저장
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveReview', content: result, projectName }),
      });
      const data = await res.json();
      if (res.ok && data.filePath) {
        // Claude Code를 대화형으로 열고, 리뷰 파일을 읽어서 적용하라고 지시
        const reviewPath = data.filePath.replace(/\\/g, '/');
        onOpenTerminal(`claude`);
        // 잠시 후 리뷰 적용 명령 전달 (Claude Code가 시작된 후)
        setTimeout(() => {
          onOpenTerminal(`cat "${reviewPath}" 파일의 코드 리뷰 내용을 이 프로젝트에 적용해줘`);
        }, 3000);
      }
    } catch {
      // fallback: 클립보드 복사 후 Claude Code 열기
      navigator.clipboard.writeText(result);
      onOpenTerminal('claude');
      setSaveMessage('리뷰 내용이 클립보드에 복사되었습니다. Claude Code에서 붙여넣기하세요.');
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  // 모델 목록 (status에서 가져오거나 기본값)
  const models: ModelInfo[] = status?.models || [
    { id: 'claude-opus-4-6', label: 'Opus 4.6 (최고 성능)', cost: '$$$$', speed: '느림' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (균형)', cost: '$$', speed: '보통' },
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (빠름)', cost: '$', speed: '빠름' },
  ];

  const actions = [
    {
      id: 'summarize' as AIAction,
      label: '프로젝트 요약',
      icon: FileText,
      description: '코드를 분석하여 프로젝트 요약을 생성합니다',
    },
    {
      id: 'generateReadme' as AIAction,
      label: 'README 생성',
      icon: Sparkles,
      description: '프로젝트에 맞는 README.md를 자동 생성합니다',
    },
    {
      id: 'suggestImprovements' as AIAction,
      label: '코드 리뷰',
      icon: Lightbulb,
      description: '코드 품질, 구조, 성능, 보안 관점에서 리뷰합니다',
    },
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-white">AI 어시스턴트</span>
          {isOnline ? (
            <span className="px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-400 rounded-full">
              Claude 연결됨
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 rounded-full">
              API 키 필요
            </span>
          )}
        </div>

        {/* 모델 선택 (한글 라벨) */}
        {isOnline && models.length > 0 && (
          <div className="relative">
            <select
              value={selectedModel || (status?.defaultModel || 'claude-opus-4-6')}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 pr-8 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          </div>
        )}
      </div>

      {/* API 키 미설정 — 바로 입력 가능 */}
      {!isOnline && (
        <div className="p-4">
          <p className="text-sm text-zinc-400 mb-3">Claude API 키를 입력하면 AI 기능을 사용할 수 있습니다.</p>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => { setApiKeyInput(e.target.value); setKeyError(null); }}
              placeholder="sk-ant-..."
              className="flex-1 h-9 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 outline-none focus:border-purple-500"
            />
            <button
              onClick={async () => {
                if (!apiKeyInput.trim()) return;
                setSavingKey(true);
                setKeyError(null);
                try {
                  const res = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'saveApiKey', apiKey: apiKeyInput.trim() }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setApiKeyInput('');
                    checkStatus();
                  } else {
                    setKeyError(data.error || '저장 실패');
                  }
                } catch {
                  setKeyError('저장 실패');
                } finally {
                  setSavingKey(false);
                }
              }}
              disabled={savingKey || !apiKeyInput.trim()}
              className="h-9 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
            >
              {savingKey ? '확인 중...' : '연결'}
            </button>
          </div>
          {keyError && <p className="text-xs text-red-400 mt-2">{keyError}</p>}
          <p className="text-xs text-zinc-500 mt-2">
            키는 AES-256-GCM으로 암호화되어 로컬에만 저장됩니다.
          </p>
        </div>
      )}

      {/* 액션 버튼들 */}
      {isOnline && !result && !loading && (
        <div className="p-4 space-y-2">
          <p className="text-sm text-zinc-500 mb-3">
            <span className="text-zinc-300 font-medium">{projectName}</span> 프로젝트
          </p>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleAction(action.id)}
                disabled={loading}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600 transition-all disabled:opacity-50"
              >
                <Icon className="w-5 h-5 text-zinc-400" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-white">{action.label}</div>
                  <div className="text-xs text-zinc-500">{action.description}</div>
                </div>
                <span className="text-[10px] text-zinc-600">Claude</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 로딩 상태 */}
      {loading && (
        <div className="p-6 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-purple-400 animate-spin" />
          <p className="text-zinc-400">
            {currentAction === 'summarize' && '프로젝트를 분석하고 있습니다...'}
            {currentAction === 'generateReadme' && 'README를 생성하고 있습니다...'}
            {currentAction === 'suggestImprovements' && '코드를 리뷰하고 있습니다...'}
          </p>
          <p className="text-xs text-zinc-500 mt-1">Opus 모델은 30초~1분 정도 걸릴 수 있습니다</p>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="m-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* 결과 */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4"
          >
            {/* 결과 헤더 */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setResult(null); setIsCached(false); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ← 다른 작업
                </button>
                {isCached && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">캐시됨</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* 다시 분석 */}
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
                  title="캐시 무시하고 다시 분석"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>

                {/* 코드 리뷰: Claude Code로 적용 */}
                {currentAction === 'suggestImprovements' && onOpenTerminal && (
                  <button
                    onClick={handleApplyWithClaudeCode}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-xs text-white transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    {saving ? '준비 중...' : 'Claude Code로 적용'}
                  </button>
                )}

                {/* README: 프로젝트에 저장 */}
                {currentAction === 'generateReadme' && (
                  <>
                    <button
                      onClick={handleSaveReadmeToProject}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs text-white transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? '저장 중...' : '프로젝트에 저장'}
                    </button>
                    <button
                      onClick={handleDownloadReadme}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                {/* 복사 */}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* 저장 메시지 */}
            {saveMessage && (
              <div className="mb-3 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">
                {saveMessage}
              </div>
            )}

            {/* 결과 내용 */}
            <div className="prose prose-sm prose-invert max-w-none bg-zinc-800/50 rounded-lg p-4 max-h-96 overflow-y-auto">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
