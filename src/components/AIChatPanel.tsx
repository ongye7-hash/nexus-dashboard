'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Send,
  Plus,
  Trash2,
  Loader2,
  Bot,
  User,
  ChevronLeft,
  X,
  FolderOpen,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatSession {
  id: string;
  title: string;
  project_path: string | null;
  model: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface RegisteredProject {
  path: string;
  name: string;
  deployType?: string;
  tags?: string;
  notes?: string;
  deployUrl?: string;
}

export function AIChatPanel() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [activeTools, setActiveTools] = useState<Array<{ name: string; status: string }>>([]);
  const [showSessions, setShowSessions] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [registeredProjects, setRegisteredProjects] = useState<RegisteredProject[]>([]);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef(0);
  const nextId = () => ++messageIdRef.current;

  // 세션 목록 로드
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/chat/sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error('세션 로드 실패:', error);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  // 등록된 프로젝트 목록 로드
  const fetchRegisteredProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects?registered=true');
      const data = await res.json();
      setRegisteredProjects(data.projects || []);
    } catch (error) {
      console.error('등록된 프로젝트 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchRegisteredProjects();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSessions, fetchRegisteredProjects]);

  // 세션 메시지 로드
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/ai/chat/sessions/${sessionId}`);
      const data = await res.json();
      // tool_use/tool_result JSON 메시지는 UI에 표시하지 않음
      const filtered = (data.messages || []).filter((m: ChatMessage) => {
        try {
          const parsed = JSON.parse(m.content);
          if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].type === 'tool_use' || parsed[0].type === 'tool_result')) {
            return false;
          }
        } catch { /* plain text — 표시 */ }
        return true;
      });
      setMessages(filtered);
      setActiveSessionId(sessionId);
      setSelectedProjectPath(data.session?.project_path || null);
      setShowSessions(false);
    } catch (error) {
      console.error('세션 로드 실패:', error);
    }
  }, []);

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  // 새 대화 시작
  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setStreamText('');
    setSelectedProjectPath(null);
    setShowSessions(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // 세션 삭제
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/ai/chat/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('세션 삭제 실패:', error);
    }
  };

  // 메시지 전송
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const userMessage: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setStreaming(true);
    setStreamText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message: trimmed,
          projectPath: selectedProjectPath,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '요청 실패' }));
        setMessages(prev => [...prev, {
          id: nextId(),
          role: 'assistant',
          content: `**오류:** ${err.error || '알 수 없는 오류'}`,
          created_at: new Date().toISOString(),
        }]);
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const parsed = JSON.parse(line.slice(6));

            if (parsed.type === 'session' && parsed.sessionId) {
              setActiveSessionId(parsed.sessionId);
              // 세션 목록 새로고침
              fetchSessions();
            }

            if (parsed.type === 'tool_call') {
              setActiveTools(prev => {
                const existing = prev.findIndex(t => t.name === parsed.name);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = { name: parsed.name, status: parsed.status };
                  return updated;
                }
                return [...prev, { name: parsed.name, status: parsed.status }];
              });
            }

            if (parsed.type === 'delta' && parsed.text) {
              setActiveTools([]); // 텍스트 응답 시작 → 도구 상태 클리어
              accumulated += parsed.text;
              setStreamText(accumulated);
            }

            if (parsed.type === 'done') {
              setActiveTools([]);
              setStreaming(false);
              // 스트리밍 완료 → 메시지 배열에 추가
              if (accumulated) {
                setMessages(prev => [...prev, {
                  id: nextId(),
                  role: 'assistant',
                  content: accumulated,
                  created_at: new Date().toISOString(),
                }]);
              }
              setStreamText('');
            }

            if (parsed.type === 'error') {
              setMessages(prev => [...prev, {
                id: nextId(),
                role: 'assistant',
                content: `**오류:** ${parsed.message}`,
                created_at: new Date().toISOString(),
              }]);
              setStreamText('');
            }
          } catch {
            // SSE 파싱 실패 — 건너뜀
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('채팅 오류:', error);
        setMessages(prev => [...prev, {
          id: nextId(),
          role: 'assistant',
          content: '**오류:** 네트워크 오류가 발생했습니다.',
          created_at: new Date().toISOString(),
        }]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  // Enter 전송, Shift+Enter 줄바꿈
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 스트리밍 중단
  const handleStop = () => {
    abortRef.current?.abort();
    if (streamText) {
      setMessages(prev => [...prev, {
        id: nextId(),
        role: 'assistant',
        content: streamText + '\n\n*(중단됨)*',
        created_at: new Date().toISOString(),
      }]);
      setStreamText('');
    }
    setStreaming(false);
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return '방금';
      if (diffMin < 60) return `${diffMin}분 전`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}시간 전`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 7) return `${diffDay}일 전`;
      return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#09090b]">
      {/* 세션 사이드바 */}
      <AnimatePresence>
        {showSessions && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-r border-[#1f1f23] flex flex-col overflow-hidden flex-shrink-0"
          >
            <div className="flex items-center justify-between p-4 border-b border-[#1f1f23]">
              <h2 className="text-sm font-medium text-white">대화 목록</h2>
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                새 대화
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingSessions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <MessageSquare className="w-8 h-8 text-zinc-600 mb-3" />
                  <p className="text-sm text-zinc-500">아직 대화가 없습니다</p>
                  <p className="text-xs text-zinc-600 mt-1">새 대화를 시작해보세요</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {sessions.map(session => (
                    <button
                      key={session.id}
                      onClick={() => loadSession(session.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group ${
                        activeSessionId === session.id
                          ? 'bg-zinc-800 text-white'
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{session.title}</p>
                        <p className="text-xs text-zinc-600 mt-0.5">{formatTime(session.updated_at)}</p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 채팅 영역 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 채팅 헤더 */}
        <div className="flex items-center gap-3 h-12 px-4 border-b border-[#1f1f23] flex-shrink-0">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title={showSessions ? '목록 닫기' : '목록 열기'}
          >
            {showSessions ? <X className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4 rotate-180" />}
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-400" />
            <span className="text-sm text-white font-medium">
              {activeSessionId
                ? sessions.find(s => s.id === activeSessionId)?.title || 'AI 채팅'
                : 'AI 채팅'
              }
            </span>
          </div>
          {/* 프로젝트 선택 드롭다운 */}
          <div className="ml-auto flex items-center gap-2">
            {registeredProjects.length > 0 && (
              <div className="flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  value={selectedProjectPath || ''}
                  onChange={e => setSelectedProjectPath(e.target.value || null)}
                  disabled={!!activeSessionId}
                  className="h-7 px-2 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-zinc-300 outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed max-w-[200px]"
                  title={activeSessionId ? '기존 대화의 프로젝트는 변경할 수 없습니다' : '프로젝트 선택'}
                >
                  <option value="">전체 프로젝트</option>
                  {registeredProjects.map(p => (
                    <option key={p.path} value={p.path}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            {!activeSessionId && !showSessions && (
              <button
                onClick={() => setShowSessions(true)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                대화 목록
              </button>
            )}
          </div>
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {messages.length === 0 && !streamText && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Nexus AI</h3>
              <p className="text-sm text-zinc-500 max-w-md">
                프로젝트 관리, 개발 질문, 코드 리뷰 등 무엇이든 물어보세요.
              </p>
              <div className="flex flex-wrap gap-2 mt-6 max-w-lg justify-center">
                {['프로젝트 현황 요약해줘', '최근 커밋 분석해줘', 'Next.js 배포 체크리스트'].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-indigo-400" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#18181b] border border-[#27272a] text-zinc-200'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-[#0f0f10] [&_pre]:border [&_pre]:border-[#27272a] [&_pre]:rounded-lg [&_code]:text-indigo-300 [&_p]:leading-relaxed">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-zinc-300" />
                </div>
              )}
            </div>
          ))}

          {/* 스트리밍 중인 응답 */}
          {streamText && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-[#18181b] border border-[#27272a] text-zinc-200">
                <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-[#0f0f10] [&_pre]:border [&_pre]:border-[#27272a] [&_pre]:rounded-lg [&_code]:text-indigo-300 [&_p]:leading-relaxed">
                  <ReactMarkdown>{streamText}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* 도구 실행 상태 */}
          {activeTools.length > 0 && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="space-y-2">
                {activeTools.map(tool => (
                  <div
                    key={tool.name}
                    className="flex items-center gap-2 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-xs"
                  >
                    {tool.status === 'running' ? (
                      <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    ) : (
                      <span className="text-green-400">&#10003;</span>
                    )}
                    <span className="text-zinc-300 font-mono">{tool.name}</span>
                    <span className="text-zinc-500">
                      {tool.status === 'running' ? '실행 중...' : '완료'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 로딩 인디케이터 */}
          {streaming && !streamText && activeTools.length === 0 && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-center gap-2 px-4 py-3 bg-[#18181b] border border-[#27272a] rounded-2xl">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-zinc-500">생각 중...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 입력 영역 */}
        <div className="border-t border-[#1f1f23] p-4">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지를 입력하세요..."
                rows={1}
                className="w-full resize-none bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500 transition-colors max-h-32 overflow-y-auto"
                style={{ minHeight: '44px' }}
                disabled={streaming}
              />
            </div>
            {streaming ? (
              <button
                onClick={handleStop}
                className="flex items-center justify-center w-11 h-11 bg-red-600 hover:bg-red-500 rounded-xl text-white transition-colors flex-shrink-0"
                title="중단"
              >
                <X className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex items-center justify-center w-11 h-11 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-xl text-white transition-colors flex-shrink-0"
                title="전송 (Enter)"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>
          <p className="text-center text-[10px] text-zinc-600 mt-2">
            Enter로 전송 · Shift+Enter로 줄바꿈
          </p>
        </div>
      </div>
    </div>
  );
}
