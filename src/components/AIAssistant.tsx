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
} from 'lucide-react';
import { useAI } from '@/hooks/useAI';
import ReactMarkdown from 'react-markdown';

interface AIAssistantProps {
  projectPath: string;
  projectName: string;
  onClose?: () => void;
}

type AIAction = 'summarize' | 'generateReadme' | 'suggestImprovements';

export default function AIAssistant({
  projectPath,
  projectName,
  onClose,
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

  const handleAction = async (action: AIAction) => {
    setCurrentAction(action);
    setResult(null);

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
      label: '개선점 제안',
      icon: Lightbulb,
      description: '코드 품질 및 구조 개선점을 제안합니다',
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
              Ollama 연결됨
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 rounded-full">
              오프라인
            </span>
          )}
        </div>

        {/* 모델 선택 */}
        {isOnline && status?.models && status.models.length > 0 && (
          <div className="relative">
            <select
              value={selectedModel || status.defaultModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 pr-8 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            >
              {status.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          </div>
        )}
      </div>

      {/* 오프라인 상태 */}
      {!isOnline && (
        <div className="p-6 text-center">
          <WifiOff className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
          <p className="text-zinc-400 mb-2">Ollama가 실행되지 않고 있습니다</p>
          <p className="text-sm text-zinc-500 mb-4">
            터미널에서 <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">ollama serve</code> 명령어를 실행하세요
          </p>
          <button
            onClick={checkStatus}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors"
          >
            다시 확인
          </button>
        </div>
      )}

      {/* 액션 버튼들 */}
      {isOnline && !result && (
        <div className="p-4 space-y-2">
          <p className="text-sm text-zinc-500 mb-3">
            {projectName} 프로젝트에 대해 무엇을 도와드릴까요?
          </p>
          {actions.map((action) => {
            const Icon = action.icon;
            const isActive = loading && currentAction === action.id;

            return (
              <button
                key={action.id}
                onClick={() => handleAction(action.id)}
                disabled={loading}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                  isActive
                    ? 'bg-purple-500/10 border-purple-500/50'
                    : 'bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600'
                } disabled:opacity-50`}
              >
                {isActive ? (
                  <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5 text-zinc-400" />
                )}
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-white">{action.label}</div>
                  <div className="text-xs text-zinc-500">{action.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 로딩 상태 */}
      {loading && (
        <div className="p-6 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-purple-400 animate-spin" />
          <p className="text-zinc-400">AI가 분석 중입니다...</p>
          <p className="text-xs text-zinc-500 mt-1">잠시만 기다려주세요</p>
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
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setResult(null)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                ← 다른 작업 선택
              </button>
              <div className="flex items-center gap-2">
                {currentAction === 'generateReadme' && (
                  <button
                    onClick={handleDownloadReadme}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    다운로드
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      복사
                    </>
                  )}
                </button>
              </div>
            </div>

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
