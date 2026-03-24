'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Project } from '@/lib/types';

interface AuditResult {
  projectName: string;
  projectPath: string;
  hasPackageJson: boolean;
  hasNodeModules: boolean;
  summary: {
    total: number;
    info: number;
    low: number;
    moderate: number;
    high: number;
    critical: number;
  };
  vulnerabilities: Array<{
    name: string;
    severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
    via: string[];
    fixAvailable: boolean;
  }>;
  error?: string;
}

interface DependencyHealthProps {
  projects: Project[];
}

export default function DependencyHealth({ projects }: DependencyHealthProps) {
  const [results, setResults] = useState<AuditResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setResults(null);

    try {
      const nodeProjects = projects.filter(
        p => p.type === 'nextjs' || p.type === 'react' || p.type === 'node'
      );

      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projects: nodeProjects.map(p => ({ name: p.name, path: p.path })),
        }),
      });

      const data = await res.json();
      setResults(data.results);
    } catch (error) {
      console.error('Audit failed:', error);
    } finally {
      setLoading(false);
    }
  }, [projects]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500 bg-red-500/10';
      case 'high': return 'text-orange-500 bg-orange-500/10';
      case 'moderate': return 'text-yellow-500 bg-yellow-500/10';
      case 'low': return 'text-blue-400 bg-blue-400/10';
      default: return 'text-zinc-400 bg-zinc-400/10';
    }
  };

  const getSeverityIcon = (summary: AuditResult['summary']) => {
    if (summary.critical > 0) return <ShieldAlert className="w-5 h-5 text-red-500" />;
    if (summary.high > 0) return <AlertCircle className="w-5 h-5 text-orange-500" />;
    if (summary.moderate > 0) return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    if (summary.total > 0) return <Info className="w-5 h-5 text-blue-400" />;
    return <ShieldCheck className="w-5 h-5 text-green-500" />;
  };

  const totalSummary = results?.reduce(
    (acc, r) => ({
      critical: acc.critical + r.summary.critical,
      high: acc.high + r.summary.high,
      moderate: acc.moderate + r.summary.moderate,
      low: acc.low + r.summary.low,
      total: acc.total + r.summary.total,
    }),
    { critical: 0, high: 0, moderate: 0, low: 0, total: 0 }
  );

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-bold text-zinc-200">의존성 건강 체크</h3>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              검사 중...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" />
              npm audit 실행
            </>
          )}
        </button>
      </div>

      {/* 결과 없을 때 */}
      {!results && !loading && (
        <div className="text-center py-8 text-zinc-500">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>아직 검사하지 않았습니다</p>
          <p className="text-xs mt-1">버튼을 눌러 npm audit를 실행하세요</p>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-emerald-400" />
          <p className="text-zinc-400">프로젝트 의존성 검사 중...</p>
        </div>
      )}

      {/* 결과 요약 */}
      {results && totalSummary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-5 gap-2"
        >
          <div className={`p-3 rounded-lg text-center ${totalSummary.critical > 0 ? 'bg-red-500/20' : 'bg-zinc-800/50'}`}>
            <div className="text-xl font-bold text-red-400">{totalSummary.critical}</div>
            <div className="text-xs text-zinc-500">Critical</div>
          </div>
          <div className={`p-3 rounded-lg text-center ${totalSummary.high > 0 ? 'bg-orange-500/20' : 'bg-zinc-800/50'}`}>
            <div className="text-xl font-bold text-orange-400">{totalSummary.high}</div>
            <div className="text-xs text-zinc-500">High</div>
          </div>
          <div className={`p-3 rounded-lg text-center ${totalSummary.moderate > 0 ? 'bg-yellow-500/20' : 'bg-zinc-800/50'}`}>
            <div className="text-xl font-bold text-yellow-400">{totalSummary.moderate}</div>
            <div className="text-xs text-zinc-500">Moderate</div>
          </div>
          <div className={`p-3 rounded-lg text-center ${totalSummary.low > 0 ? 'bg-blue-500/20' : 'bg-zinc-800/50'}`}>
            <div className="text-xl font-bold text-blue-400">{totalSummary.low}</div>
            <div className="text-xs text-zinc-500">Low</div>
          </div>
          <div className="p-3 rounded-lg text-center bg-zinc-800/50">
            <div className="text-xl font-bold text-zinc-300">{totalSummary.total}</div>
            <div className="text-xs text-zinc-500">Total</div>
          </div>
        </motion.div>
      )}

      {/* 프로젝트별 결과 */}
      {results && (
        <div className="space-y-2">
          {results.map((result, idx) => (
            <motion.div
              key={result.projectPath}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="border border-zinc-800 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpandedProject(
                  expandedProject === result.projectPath ? null : result.projectPath
                )}
                className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getSeverityIcon(result.summary)}
                  <span className="font-medium text-white">{result.projectName}</span>
                  {result.error && (
                    <span className="text-xs text-zinc-500">({result.error})</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {result.summary.total > 0 && (
                    <span className="text-sm text-zinc-400">
                      {result.summary.total} issues
                    </span>
                  )}
                  {expandedProject === result.projectPath ? (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {expandedProject === result.projectPath && result.vulnerabilities.length > 0 && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 pt-0 space-y-2">
                      {result.vulnerabilities.map((vuln, vIdx) => (
                        <div
                          key={vIdx}
                          className="flex items-center justify-between p-2 bg-zinc-800/30 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getSeverityColor(vuln.severity)}`}>
                              {vuln.severity}
                            </span>
                            <span className="text-sm text-zinc-300">{vuln.name}</span>
                          </div>
                          {vuln.fixAvailable && (
                            <span className="text-xs text-green-400">fix available</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
