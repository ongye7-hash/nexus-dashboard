'use client';

import { useState, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Folder,
  FolderOpen,
  Code2,
  Play,
  Globe,
  Terminal,
  FileText,
  Clock,
  GitBranch,
  Package,
  ExternalLink,
  Copy,
  Check,
  Edit3,
  Save,
  Tag,
  Braces,
  FileCode,
  MessageSquare,
  Plus,
  FolderTree,
  Layers,
  ChevronDown,
  Monitor,
} from 'lucide-react';
import { Project, ProjectStatus, ProjectGroup, PROJECT_TYPE_COLORS, STATUS_COLORS, STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/types';
import { FileTree } from './FileTree';
import { ReadmeViewer } from './ReadmeViewer';
import { LivePreview } from './LivePreview';
import { GitInfo } from './GitInfo';
import ProjectTodos from './ProjectTodos';
import AIAssistant from './AIAssistant';

interface ProjectModalProps {
  project: Project | null;
  onClose: () => void;
  onOpenFolder: (project: Project) => void;
  onOpenVSCode: (project: Project) => void;
  onRunProject: (project: Project) => void;
  onOpenTerminal: (project: Project) => void;
  onUpdateMemo?: (projectName: string, memo: string) => void;
  onUpdateTags?: (projectName: string, tags: string[]) => void;
  onUpdateStatus?: (projectName: string, status: ProjectStatus) => void;
  onUpdateDeployUrl?: (projectName: string, deployUrl: string) => void;
  groups?: ProjectGroup[];
  onUpdateGroup?: (projectName: string, groupId: string | undefined) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  nextjs: <Braces className="w-5 h-5" />,
  react: <Code2 className="w-5 h-5" />,
  vue: <Code2 className="w-5 h-5" />,
  html: <Globe className="w-5 h-5" />,
  python: <FileCode className="w-5 h-5" />,
  node: <Braces className="w-5 h-5" />,
  unknown: <Folder className="w-5 h-5" />,
};

const TAG_COLORS = [
  'bg-red-500/20 text-red-400 border-red-500/30',
  'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-green-500/20 text-green-400 border-green-500/30',
  'bg-teal-500/20 text-teal-400 border-teal-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-pink-500/20 text-pink-400 border-pink-500/30',
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'development', label: '개발중' },
  { value: 'active', label: '활성' },
  { value: 'deployed', label: '배포됨' },
  { value: 'archived', label: '보관됨' },
];

export function ProjectModal({
  project,
  onClose,
  onOpenFolder,
  onOpenVSCode,
  onRunProject,
  onOpenTerminal,
  onUpdateMemo,
  onUpdateTags,
  onUpdateStatus,
  onUpdateDeployUrl,
  groups = [],
  onUpdateGroup,
}: ProjectModalProps) {
  const [copied, setCopied] = useState(false);
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<ProjectStatus>('development');
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [deployUrl, setDeployUrl] = useState('');
  const [currentGroup, setCurrentGroup] = useState<string | undefined>(undefined);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);

  useEffect(() => {
    if (project) {
      setMemo(project.description || '');
      setTags(project.tags || []);
      setCurrentStatus(project.status);
      setDeployUrl(project.deployUrl || '');
      setCurrentGroup(project.group);
      setIsEditingMemo(false);
      setIsAddingTag(false);
      setIsEditingUrl(false);
      setIsGroupDropdownOpen(false);
      setShowLivePreview(false);
      setNewTag('');
    }
  }, [project]);

  if (!project) return null;

  const typeColor = PROJECT_TYPE_COLORS[project.type];
  const statusColor = STATUS_COLORS[project.status];
  const statusLabel = STATUS_LABELS[project.status];
  const typeLabel = PROJECT_TYPE_LABELS[project.type];

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(project.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveMemo = async () => {
    setSaving(true);
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          updates: { description: memo },
        }),
      });
      setIsEditingMemo(false);
      if (onUpdateMemo) {
        onUpdateMemo(project.name, memo);
      }
    } catch (error) {
      console.error('메모 저장 실패:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = async () => {
    const trimmedTag = newTag.trim();
    if (!trimmedTag || tags.includes(trimmedTag)) {
      setNewTag('');
      setIsAddingTag(false);
      return;
    }

    const newTags = [...tags, trimmedTag];
    setTags(newTags);
    setNewTag('');
    setIsAddingTag(false);

    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          updates: { tags: newTags },
        }),
      });
      if (onUpdateTags) {
        onUpdateTags(project.name, newTags);
      }
    } catch (error) {
      console.error('태그 저장 실패:', error);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const newTags = tags.filter((t) => t !== tagToRemove);
    setTags(newTags);

    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          updates: { tags: newTags },
        }),
      });
      if (onUpdateTags) {
        onUpdateTags(project.name, newTags);
      }
    } catch (error) {
      console.error('태그 삭제 실패:', error);
    }
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Escape') {
      setNewTag('');
      setIsAddingTag(false);
    }
  };

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    setCurrentStatus(newStatus);
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          updates: { status: newStatus },
        }),
      });
      if (onUpdateStatus) {
        onUpdateStatus(project.name, newStatus);
      }
    } catch (error) {
      console.error('상태 변경 실패:', error);
    }
  };

  const handleSaveDeployUrl = async () => {
    setIsEditingUrl(false);
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          updates: { deployUrl: deployUrl || null },
        }),
      });
      if (onUpdateDeployUrl) {
        onUpdateDeployUrl(project.name, deployUrl);
      }
    } catch (error) {
      console.error('배포 URL 저장 실패:', error);
    }
  };

  const handleGroupChange = async (groupId: string | undefined) => {
    setCurrentGroup(groupId);
    setIsGroupDropdownOpen(false);
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          updates: { group: groupId || null },
        }),
      });
      if (onUpdateGroup) {
        onUpdateGroup(project.name, groupId);
      }
    } catch (error) {
      console.error('그룹 변경 실패:', error);
    }
  };

  const currentGroupData = groups.find((g) => g.id === currentGroup);

  const actions = [
    {
      id: 'folder',
      label: '폴더 열기',
      description: 'Windows 탐색기',
      icon: FolderOpen,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      onClick: () => onOpenFolder(project),
    },
    {
      id: 'vscode',
      label: 'VSCode',
      description: '코드 편집기',
      icon: Code2,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      onClick: () => onOpenVSCode(project),
    },
    {
      id: 'run',
      label: '실행',
      description: 'npm run dev',
      icon: Play,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      onClick: () => onRunProject(project),
      disabled: !project.hasPackageJson,
    },
    {
      id: 'terminal',
      label: '터미널',
      description: '명령 프롬프트',
      icon: Terminal,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      onClick: () => onOpenTerminal(project),
    },
  ];

  return (
    <AnimatePresence>
      {project && (
        <>
          {/* 배경 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* 모달 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-auto sm:w-full sm:max-w-lg z-50 max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-y-auto"
          >
            <div className="bg-[#18181b] border border-[#27272a] rounded-2xl shadow-2xl overflow-hidden">
              {/* 헤더 */}
              <div className="relative p-4 sm:p-6 border-b border-[#27272a]">
                {/* 닫기 버튼 */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* 프로젝트 정보 */}
                <div className="flex items-start gap-4">
                  <div
                    className="flex items-center justify-center w-14 h-14 rounded-xl"
                    style={{ backgroundColor: `${typeColor}20` }}
                  >
                    <span style={{ color: typeColor }}>{TYPE_ICONS[project.type]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold text-white truncate pr-8">
                      {project.name}
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1">{typeLabel}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {/* 상태 선택 */}
                      <div className="relative group/status">
                        <button
                          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium hover:ring-2 hover:ring-offset-1 hover:ring-offset-[#18181b] transition-all"
                          style={{ backgroundColor: `${STATUS_COLORS[currentStatus]}20`, color: STATUS_COLORS[currentStatus], '--tw-ring-color': STATUS_COLORS[currentStatus] } as React.CSSProperties}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[currentStatus] }} />
                          {STATUS_LABELS[currentStatus]}
                        </button>
                        <div className="absolute top-full left-0 mt-1 py-1 bg-[#27272a] border border-[#3f3f46] rounded-lg shadow-xl opacity-0 invisible group-hover/status:opacity-100 group-hover/status:visible transition-all z-10 min-w-[100px]">
                          {STATUS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => handleStatusChange(option.value)}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-700 transition-colors ${
                                currentStatus === option.value ? 'text-white' : 'text-zinc-400'
                              }`}
                            >
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: STATUS_COLORS[option.value] }}
                              />
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 그룹 선택 */}
                      {groups.length > 0 && (
                        <div className="relative">
                          <button
                            onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                              currentGroupData
                                ? 'border-transparent hover:ring-2 hover:ring-offset-1 hover:ring-offset-[#18181b]'
                                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                            }`}
                            style={currentGroupData ? {
                              backgroundColor: `${currentGroupData.color}20`,
                              color: currentGroupData.color,
                              '--tw-ring-color': currentGroupData.color,
                            } as React.CSSProperties : {}}
                          >
                            {currentGroupData ? (
                              <>
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentGroupData.color }} />
                                {currentGroupData.name}
                              </>
                            ) : (
                              <>
                                <Layers className="w-3 h-3" />
                                그룹 없음
                              </>
                            )}
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          {isGroupDropdownOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setIsGroupDropdownOpen(false)}
                              />
                              <div className="absolute top-full left-0 mt-1 py-1 bg-[#27272a] border border-[#3f3f46] rounded-lg shadow-xl z-20 min-w-[140px]">
                                <button
                                  onClick={() => handleGroupChange(undefined)}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-700 transition-colors ${
                                    !currentGroup ? 'text-white' : 'text-zinc-400'
                                  }`}
                                >
                                  <Layers className="w-3 h-3 text-zinc-500" />
                                  그룹 없음
                                </button>
                                {groups.map((group) => (
                                  <button
                                    key={group.id}
                                    onClick={() => handleGroupChange(group.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-700 transition-colors ${
                                      currentGroup === group.id ? 'text-white' : 'text-zinc-400'
                                    }`}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: group.color }}
                                    />
                                    {group.name}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="w-3.5 h-3.5" />
                        {project.lastModifiedRelative}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 기술 스택 */}
                {project.techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {project.techStack.map((tech) => (
                      <span
                        key={tech}
                        className="px-2.5 py-1 text-xs font-medium text-zinc-300 bg-zinc-800 rounded-lg"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                )}

                {/* 태그 */}
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <Tag className="w-4 h-4 text-zinc-500" />
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border ${getTagColor(tag)}`}
                    >
                      #{tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-white ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {isAddingTag ? (
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={() => {
                        if (newTag.trim()) handleAddTag();
                        else setIsAddingTag(false);
                      }}
                      placeholder="태그 입력"
                      className="px-2 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-zinc-300 outline-none focus:border-indigo-500 w-20"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => setIsAddingTag(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-300 border border-dashed border-zinc-700 hover:border-zinc-500 rounded-md transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      태그 추가
                    </button>
                  )}
                </div>

                {/* 경로 */}
                <div className="flex items-center gap-2 mt-4 p-3 bg-[#0f0f10] rounded-lg">
                  <Folder className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <span className="text-sm text-zinc-400 truncate flex-1 font-mono">
                    {project.path}
                  </span>
                  <button
                    onClick={handleCopyPath}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
                    title="경로 복사"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* 메타 정보 */}
                <div className="flex items-center gap-4 mt-4 text-sm text-zinc-500">
                  {project.hasGit && (
                    <span className="flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4" />
                      Git 연결됨
                    </span>
                  )}
                  {project.hasPackageJson && (
                    <span className="flex items-center gap-1.5">
                      <Package className="w-4 h-4" />
                      npm 프로젝트
                    </span>
                  )}
                </div>
              </div>

              {/* 파일 트리 & README */}
              <div className="p-4 border-b border-[#27272a]">
                <div className="flex items-center gap-2 mb-3">
                  <FolderTree className="w-4 h-4 text-zinc-500" />
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    파일 구조
                  </span>
                </div>
                <div className="bg-[#0f0f10] rounded-lg p-2">
                  <FileTree projectPath={project.path} />
                </div>

                {/* README */}
                <div className="mt-3">
                  <ReadmeViewer projectPath={project.path} />
                </div>

                {/* Git 정보 */}
                {project.hasGit && (
                  <div className="mt-3">
                    <GitInfo projectPath={project.path} />
                  </div>
                )}
              </div>

              {/* 메모 섹션 */}
              <div className="p-4 border-b border-[#27272a]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-zinc-500" />
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      메모
                    </span>
                  </div>
                  {!isEditingMemo ? (
                    <button
                      onClick={() => setIsEditingMemo(true)}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      수정
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveMemo}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? '저장 중...' : '저장'}
                    </button>
                  )}
                </div>
                {isEditingMemo ? (
                  <textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="이 프로젝트에 대한 메모를 작성하세요..."
                    className="w-full h-24 p-3 bg-[#0f0f10] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500 resize-none"
                    autoFocus
                  />
                ) : (
                  <div className="p-3 bg-[#0f0f10] rounded-lg min-h-[60px]">
                    {memo ? (
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap">{memo}</p>
                    ) : (
                      <p className="text-sm text-zinc-600 italic">메모가 없습니다</p>
                    )}
                  </div>
                )}
              </div>

              {/* TODO 섹션 */}
              <div className="p-4 border-b border-[#27272a]">
                <ProjectTodos projectPath={project.path} projectName={project.name} />
              </div>

              {/* AI 어시스턴트 섹션 */}
              <div className="p-4 border-b border-[#27272a]">
                <AIAssistant projectPath={project.path} projectName={project.name} />
              </div>

              {/* 액션 버튼들 */}
              <div className="p-4">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 px-1">
                  빠른 실행
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        onClick={action.onClick}
                        disabled={action.disabled}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border border-[#27272a] transition-all ${
                          action.disabled
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-[#27272a] hover:border-[#3f3f46] cursor-pointer'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${action.bgColor}`}>
                          <Icon className={`w-5 h-5 ${action.color}`} />
                        </div>
                        <span className="text-xs font-medium text-zinc-300">{action.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* 배포 URL */}
                <div className="mt-4 p-3 bg-[#0f0f10] rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      배포 URL
                    </span>
                    {!isEditingUrl && (
                      <button
                        onClick={() => setIsEditingUrl(true)}
                        className="text-xs text-zinc-400 hover:text-white transition-colors"
                      >
                        {deployUrl ? '수정' : '추가'}
                      </button>
                    )}
                  </div>
                  {isEditingUrl ? (
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={deployUrl}
                        onChange={(e) => setDeployUrl(e.target.value)}
                        placeholder="https://example.vercel.app"
                        className="flex-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveDeployUrl();
                          if (e.key === 'Escape') {
                            setDeployUrl(project.deployUrl || '');
                            setIsEditingUrl(false);
                          }
                        }}
                      />
                      <button
                        onClick={handleSaveDeployUrl}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white font-medium transition-colors"
                      >
                        저장
                      </button>
                    </div>
                  ) : deployUrl ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <a
                          href={deployUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 p-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-colors"
                        >
                          <Globe className="w-4 h-4" />
                          사이트 열기
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => setShowLivePreview(!showLivePreview)}
                          className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                            showLivePreview
                              ? 'bg-zinc-700 text-white'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          <Monitor className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 라이브 프리뷰 */}
                      {showLivePreview && (
                        <div className="mt-3">
                          <LivePreview
                            url={deployUrl}
                            projectName={project.name}
                            onClose={() => setShowLivePreview(false)}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-600 italic">배포 URL이 설정되지 않았습니다</p>
                  )}
                </div>
              </div>

              {/* 하단 안내 - 모바일에서 숨김 */}
              <div className="hidden sm:block px-6 py-3 border-t border-[#27272a] bg-[#0f0f10]">
                <p className="text-xs text-zinc-600 text-center">
                  <kbd className="kbd">ESC</kbd> 닫기
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
