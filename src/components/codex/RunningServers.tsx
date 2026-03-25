'use client';

import { motion } from 'framer-motion';
import { Radio, ExternalLink, StopCircle } from 'lucide-react';

interface RunningProcess {
  port: number;
  pid: number;
  name?: string;
  projectPath?: string;
  projectName?: string;
}

interface RunningServersProps {
  processes: RunningProcess[];
  onKillProcess: (pid: number, port: number, name?: string, projectPath?: string) => void;
}

export default function RunningServers({ processes, onKillProcess }: RunningServersProps) {
  if (processes.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-xl bg-[#18181b] border border-[#27272a] overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a]">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-green-400 animate-pulse" />
          <span className="text-sm font-medium text-white">실행 중인 서버</span>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {processes.map((process) => {
            const isCurrentDashboard = process.port === 8507;
            const displayName = process.projectName || process.name || `포트 ${process.port}`;

            return (
              <div
                key={process.port}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  isCurrentDashboard
                    ? 'bg-indigo-500/10 border-indigo-500/30'
                    : 'bg-zinc-800/50 border-zinc-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    isCurrentDashboard ? 'bg-indigo-400' : 'bg-green-400'
                  } animate-pulse`} />
                  <div>
                    <p className="text-sm font-medium text-white">
                      {isCurrentDashboard ? 'Nexus Dashboard' : displayName}
                    </p>
                    <p className="text-xs text-zinc-500">localhost:{process.port}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`http://localhost:${process.port}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {!isCurrentDashboard && (
                    <button
                      onClick={() => onKillProcess(process.pid, process.port, displayName, process.projectPath)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="프로세스 종료"
                    >
                      <StopCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
