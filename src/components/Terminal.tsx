'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as TerminalIcon, X, Maximize2, Minimize2, RotateCcw } from 'lucide-react';

// Dynamic import for xterm to avoid SSR issues
let XTerminal: typeof import('@xterm/xterm').Terminal;
let FitAddon: typeof import('@xterm/addon-fit').FitAddon;

interface TerminalProps {
  cwd?: string;
  autoCommand?: string;
  onClose?: () => void;
  className?: string;
}

export default function TerminalEmbed({ cwd, autoCommand, onClose, className = '' }: TerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<any>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!termRef.current) return;

    // Dynamically import xterm (avoid SSR)
    if (!XTerminal) {
      const xtermModule = await import('@xterm/xterm');
      XTerminal = xtermModule.Terminal;
      const fitModule = await import('@xterm/addon-fit');
      FitAddon = fitModule.FitAddon;
      // Import CSS
      await import('@xterm/xterm/css/xterm.css');
    }

    // Create terminal instance
    const term = new XTerminal({
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#6366f1',
        cursorAccent: '#09090b',
        selectionBackground: '#6366f140',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#71717a',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // 터미널 서버 토큰 가져오기
    let token = '';
    try {
      const tokenRes = await fetch('/api/terminal');
      const tokenData = await tokenRes.json();
      token = tokenData.token || '';
      if (!token) {
        setError('터미널 서버가 아직 준비되지 않았습니다');
        return;
      }
    } catch {
      setError('터미널 서버에 연결할 수 없습니다');
      return;
    }

    // Connect WebSocket (토큰 포함)
    const wsUrl = `ws://localhost:8508?cwd=${encodeURIComponent(cwd || 'C:\\Users\\user\\Desktop')}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      term.focus();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'session':
            setSessionId(msg.id);
            break;
          case 'output':
            term.write(msg.data);
            break;
          case 'exit':
            term.write('\r\n\x1b[90m[프로세스 종료됨]\x1b[0m\r\n');
            setConnected(false);
            break;
        }
      } catch {
        // Raw data
        term.write(event.data);
      }
    };

    ws.onerror = () => {
      setError('터미널 서버에 연결할 수 없습니다');
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    // Terminal input -> WebSocket
    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Auto-run command after connection
    if (autoCommand) {
      ws.addEventListener('open', () => {
        // Small delay to let shell initialize
        setTimeout(() => {
          ws.send(JSON.stringify({ type: 'command', data: autoCommand }));
        }, 500);
      });
    }

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(termRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [cwd, autoCommand]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.then((fn) => fn?.());
      // Also cleanup refs
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      xtermRef.current?.dispose();
    };
  }, [connect]);

  // Reconnect handler
  const handleReconnect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    xtermRef.current?.dispose();
    setError(null);
    setConnected(false);
    // Small delay then reconnect
    setTimeout(() => connect(), 300);
  };

  return (
    <div className={`flex flex-col bg-[#09090b] rounded-xl border border-[#27272a] overflow-hidden ${
      maximized ? 'fixed inset-4 z-50' : ''
    } ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#18181b] border-b border-[#27272a]">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-zinc-300">터미널</span>
          {cwd && (
            <span className="text-xs text-zinc-500 truncate max-w-[200px]">
              {cwd.split('\\').pop()}
            </span>
          )}
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReconnect}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
            title="재연결"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMaximized(!maximized)}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
            title={maximized ? '축소' : '확대'}
          >
            {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              title="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal body */}
      <div className="flex-1 min-h-[300px] relative">
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[#09090b]/90">
            <TerminalIcon className="w-8 h-8 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 mb-3">{error}</p>
            <button
              onClick={handleReconnect}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white transition-colors"
            >
              다시 연결
            </button>
          </div>
        )}
        <div ref={termRef} className="h-full w-full" style={{ padding: '8px' }} />
      </div>
    </div>
  );
}
