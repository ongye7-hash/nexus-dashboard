'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Square, RotateCcw, Loader2, Server } from 'lucide-react';

interface PM2Process {
  name: string;
  id: number;
  status: string;
  cpu: number;
  memory: number;
  restarts: number;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
}

interface ServicePanelProps {
  serverId: string;
  serverName: string;
}

export default function ServicePanel({ serverId, serverName }: ServicePanelProps) {
  const [pm2, setPm2] = useState<PM2Process[] | null>(null);
  const [docker, setDocker] = useState<DockerContainer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vps/services?id=${serverId}`);
      const data = await res.json();
      setPm2(data.pm2);
      setDocker(data.docker);
    } catch (err) {
      console.warn('서비스 목록 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const handleAction = async (type: 'pm2' | 'docker', action: string, target: string) => {
    const key = `${type}-${action}-${target}`;
    setActionLoading(key);
    try {
      const res = await fetch('/api/vps/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, type, action, target }),
      });
      if (res.ok) {
        // Refresh after action
        setTimeout(fetchServices, 1000);
      }
    } catch (err) {
      console.warn('서비스 제어 실패:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Helper to format memory
  const formatMem = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const statusColor = (status: string) => {
    if (status === 'online' || status === 'running') return 'text-emerald-400';
    if (status === 'stopped' || status === 'exited') return 'text-red-400';
    return 'text-amber-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (!pm2 && !docker) {
    return (
      <div className="text-center py-4 text-xs text-zinc-500">
        PM2 또는 Docker가 설치되지 않았습니다
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PM2 Processes */}
      {pm2 && pm2.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              PM2 프로세스
            </span>
            <button onClick={fetchServices} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1.5">
            {pm2.map(proc => (
              <div key={proc.id} className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${proc.status === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="text-xs text-zinc-200">{proc.name}</span>
                  <span className={`text-[10px] ${statusColor(proc.status)}`}>{proc.status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">{formatMem(proc.memory)}</span>
                  <span className="text-[10px] text-zinc-500">{proc.cpu}%</span>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => handleAction('pm2', 'restart', proc.name)}
                      disabled={actionLoading !== null}
                      className="p-1 text-zinc-500 hover:text-amber-400 transition-colors disabled:opacity-50"
                      title="재시작"
                    >
                      {actionLoading === `pm2-restart-${proc.name}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => handleAction('pm2', proc.status === 'online' ? 'stop' : 'start', proc.name)}
                      disabled={actionLoading !== null}
                      className={`p-1 transition-colors disabled:opacity-50 ${proc.status === 'online' ? 'text-zinc-500 hover:text-red-400' : 'text-zinc-500 hover:text-emerald-400'}`}
                      title={proc.status === 'online' ? '중지' : '시작'}
                    >
                      {proc.status === 'online' ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Docker Containers */}
      {docker && docker.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              Docker 컨테이너
            </span>
          </div>
          <div className="space-y-1.5">
            {docker.map(container => (
              <div key={container.id} className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${container.state === 'running' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="text-xs text-zinc-200">{container.name}</span>
                  <span className="text-[10px] text-zinc-500">{container.image}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] ${statusColor(container.state)}`}>{container.status}</span>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => handleAction('docker', 'restart', container.name)}
                      disabled={actionLoading !== null}
                      className="p-1 text-zinc-500 hover:text-amber-400 transition-colors disabled:opacity-50"
                      title="재시작"
                    >
                      {actionLoading === `docker-restart-${container.name}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => handleAction('docker', container.state === 'running' ? 'stop' : 'start', container.name)}
                      disabled={actionLoading !== null}
                      className={`p-1 transition-colors disabled:opacity-50 ${container.state === 'running' ? 'text-zinc-500 hover:text-red-400' : 'text-zinc-500 hover:text-emerald-400'}`}
                      title={container.state === 'running' ? '중지' : '시작'}
                    >
                      {container.state === 'running' ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
