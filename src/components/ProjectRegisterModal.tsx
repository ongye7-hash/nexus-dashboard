'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  Loader2,
  Globe,
  Server,
  Cloud,
  FileCode,
  ExternalLink,
} from 'lucide-react';

interface ProjectRegisterModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialValues?: {
    name?: string;
    projectPath?: string;
    deployType?: string;
    deployUrl?: string;
    tags?: string;
    notes?: string;
  };
}

const DEPLOY_TYPES = [
  { id: 'vercel', label: 'Vercel', icon: Cloud, color: 'text-white' },
  { id: 'docker', label: 'Docker', icon: Server, color: 'text-blue-400' },
  { id: 'pm2', label: 'PM2', icon: FileCode, color: 'text-green-400' },
  { id: 'static', label: 'Static', icon: Globe, color: 'text-amber-400' },
  { id: 'external', label: 'External', icon: ExternalLink, color: 'text-purple-400' },
];

export function ProjectRegisterModal({ open, onClose, onSuccess, initialValues }: ProjectRegisterModalProps) {
  const [name, setName] = useState('');
  const [deployType, setDeployType] = useState('docker');
  const [projectPath, setProjectPath] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달 열릴 때 초기값 적용
  useEffect(() => {
    if (open) {
      setName(initialValues?.name || '');
      setDeployType(initialValues?.deployType || 'docker');
      setProjectPath(initialValues?.projectPath || '');
      setDeployUrl(initialValues?.deployUrl || '');
      setTags(initialValues?.tags || '');
      setNotes(initialValues?.notes || '');
      setError(null);
    }
  }, [open, initialValues]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('프로젝트 이름을 입력하세요'); return; }
    if (!projectPath.trim()) { setError('경로를 입력하세요'); return; }

    setSaving(true);
    setError(null);

    // external 배포 방식이면 경로를 external://도메인으로 변환
    let finalPath = projectPath.trim();
    if (deployType === 'external') {
      const domain = finalPath.replace(/^(https?:\/\/|external:\/\/)/, '').replace(/\/+$/, '');
      finalPath = `external://${domain}`;
    }

    try {
      const res = await fetch('/api/projects/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          projectPath: finalPath,
          deployType,
          deployUrl: deployUrl.trim() || undefined,
          tags: tags.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        setError(data.error || '등록에 실패했습니다');
      }
    } catch (err) {
      console.error('프로젝트 등록 실패:', err);
      setError('프로젝트 등록에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const pathPlaceholder = deployType === 'external'
    ? '도메인 (예: example.com)'
    : 'C:\\Users\\user\\Desktop\\프로젝트명 또는 /root/프로젝트명';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50"
          >
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden">
              {/* 헤더 */}
              <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
                <h3 className="text-base font-semibold text-white">프로젝트 등록</h3>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 폼 */}
              <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* 이름 */}
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">프로젝트 이름 *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="My Project"
                    className="w-full px-3 py-2 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* 배포 방식 */}
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">배포 방식 *</label>
                  <div className="grid grid-cols-5 gap-2">
                    {DEPLOY_TYPES.map(dt => {
                      const Icon = dt.icon;
                      const isActive = deployType === dt.id;
                      return (
                        <button
                          key={dt.id}
                          onClick={() => setDeployType(dt.id)}
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                            isActive
                              ? 'border-indigo-500 bg-indigo-500/10 text-white'
                              : 'border-[#27272a] text-zinc-500 hover:border-[#3f3f46] hover:text-zinc-300'
                          }`}
                        >
                          <Icon className={`w-4 h-4 ${isActive ? dt.color : ''}`} />
                          {dt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 경로 */}
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">
                    {deployType === 'external' ? '도메인' : '프로젝트 경로'} *
                  </label>
                  <input
                    type="text"
                    value={projectPath}
                    onChange={e => setProjectPath(e.target.value)}
                    placeholder={pathPlaceholder}
                    className="w-full px-3 py-2 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500 font-mono"
                  />
                  {deployType === 'external' && (
                    <p className="mt-1 text-[10px] text-zinc-600">자동으로 external:// 접두사가 추가됩니다</p>
                  )}
                </div>

                {/* 배포 URL */}
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">배포 URL</label>
                  <input
                    type="text"
                    value={deployUrl}
                    onChange={e => setDeployUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* 태그 */}
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">태그</label>
                  <input
                    type="text"
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                    placeholder="React, Docker, 자동화 (쉼표 구분)"
                    className="w-full px-3 py-2 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* 메모 */}
                <div>
                  <label className="block text-sm text-zinc-300 mb-1.5">메모</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="프로젝트에 대한 설명..."
                    rows={3}
                    className="w-full px-3 py-2 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                {/* 에러 */}
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}
              </div>

              {/* 하단 버튼 */}
              <div className="p-4 border-t border-[#27272a]">
                <button
                  onClick={handleSubmit}
                  disabled={saving || !name.trim() || !projectPath.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {saving ? '등록 중...' : '프로젝트 등록'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
