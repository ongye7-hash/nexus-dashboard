'use client';

import { useEffect, useState, useCallback } from 'react';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Folder,
  Play,
  ExternalLink,
  Code2,
  Terminal,
  Settings,
  RefreshCw,
  Plus,
  Filter,
  SortAsc,
  Tag,
  Hash,
  Star,
  Bot,
  Sparkles,
  FileText,
  Lightbulb,
} from 'lucide-react';
import { Project } from '@/lib/types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onRunProject: (project: Project) => void;
  onRefresh: () => void;
  onOpenAI?: (project: Project, action: 'summarize' | 'generateReadme' | 'suggestImprovements') => void;
  onFilterType?: () => void;
  onSortChange?: () => void;
  onOpenTerminal?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  projects,
  onSelectProject,
  onRunProject,
  onRefresh,
  onOpenAI,
  onFilterType,
  onSortChange,
  onOpenTerminal,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  // 고급 검색 로직
  const getFilteredProjects = () => {
    const query = search.toLowerCase().trim();

    if (!query) return projects;

    // 태그 검색: #태그명
    if (query.startsWith('#')) {
      const tagQuery = query.slice(1);
      return projects.filter((p) =>
        p.tags?.some((t) => t.toLowerCase().includes(tagQuery))
      );
    }

    // 기술 스택 검색: @기술명
    if (query.startsWith('@')) {
      const techQuery = query.slice(1);
      return projects.filter((p) =>
        p.techStack.some((t) => t.toLowerCase().includes(techQuery))
      );
    }

    // 즐겨찾기 검색: *
    if (query === '*' || query === 'pinned' || query === '즐겨찾기') {
      return projects.filter((p) => p.pinned);
    }

    // 일반 검색: 이름, 메모, 태그, 기술스택 모두 검색
    return projects.filter((p) =>
      p.name.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query) ||
      p.tags?.some((t) => t.toLowerCase().includes(query)) ||
      p.techStack.some((t) => t.toLowerCase().includes(query)) ||
      p.framework?.toLowerCase().includes(query)
    );
  };

  const filteredProjects = getFilteredProjects();

  // 검색 모드 표시
  const getSearchMode = () => {
    const query = search.trim();
    if (query.startsWith('#')) return { icon: Tag, label: '태그 검색', color: 'text-purple-400' };
    if (query.startsWith('@')) return { icon: Code2, label: '기술스택 검색', color: 'text-blue-400' };
    if (query === '*' || query === 'pinned' || query === '즐겨찾기') return { icon: Star, label: '즐겨찾기', color: 'text-amber-400' };
    return null;
  };

  const searchMode = getSearchMode();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 배경 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => onOpenChange(false)}
          />

          {/* 커맨드 팔레트 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed top-4 sm:top-[15%] left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 w-auto sm:w-full sm:max-w-2xl z-50"
          >
            <Command
              className="bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden"
              loop
            >
              {/* 검색 입력 */}
              <div className="flex items-center gap-3 px-4 border-b border-[#27272a]">
                {searchMode ? (
                  <searchMode.icon className={`w-5 h-5 ${searchMode.color}`} />
                ) : (
                  <Search className="w-5 h-5 text-zinc-500" />
                )}
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="검색... (#태그 @기술스택 * 즐겨찾기)"
                  className="flex-1 h-14 bg-transparent text-[15px] text-white placeholder:text-zinc-500 outline-none"
                />
                {searchMode && (
                  <span className={`text-xs px-2 py-0.5 rounded-full bg-zinc-800 ${searchMode.color}`}>
                    {searchMode.label}
                  </span>
                )}
                <kbd className="kbd hidden sm:inline-block">ESC</kbd>
              </div>

              {/* 결과 목록 */}
              <Command.List className="max-h-[400px] overflow-y-auto p-2">
                <Command.Empty className="py-12 text-center text-sm text-zinc-500">
                  검색 결과가 없습니다.
                </Command.Empty>

                {/* AI 기능 (선택된 프로젝트가 있을 때만 표시) */}
                {onOpenAI && filteredProjects.length === 1 && (
                  <Command.Group heading="AI 어시스턴트" className="mb-2">
                    <Command.Item
                      onSelect={() => {
                        onOpenAI(filteredProjects[0], 'summarize');
                        onOpenChange(false);
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-purple-500/10 data-[selected=true]:text-purple-300"
                    >
                      <FileText className="w-4 h-4 text-purple-400" />
                      <span>프로젝트 요약 (AI)</span>
                      <span className="ml-auto text-xs text-purple-400/60">Claude</span>
                    </Command.Item>
                    <Command.Item
                      onSelect={() => {
                        onOpenAI(filteredProjects[0], 'generateReadme');
                        onOpenChange(false);
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-purple-500/10 data-[selected=true]:text-purple-300"
                    >
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>README 자동 생성 (AI)</span>
                      <span className="ml-auto text-xs text-purple-400/60">Claude</span>
                    </Command.Item>
                    <Command.Item
                      onSelect={() => {
                        onOpenAI(filteredProjects[0], 'suggestImprovements');
                        onOpenChange(false);
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-purple-500/10 data-[selected=true]:text-purple-300"
                    >
                      <Lightbulb className="w-4 h-4 text-purple-400" />
                      <span>개선점 제안 (AI)</span>
                      <span className="ml-auto text-xs text-purple-400/60">Claude</span>
                    </Command.Item>
                  </Command.Group>
                )}

                {/* 빠른 실행 */}
                <Command.Group heading="빠른 실행" className="mb-2">
                  <Command.Item
                    onSelect={onRefresh}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-white"
                  >
                    <RefreshCw className="w-4 h-4 text-zinc-500" />
                    <span>프로젝트 새로고침</span>
                    <span className="ml-auto text-xs text-zinc-600 hidden sm:block">
                      <kbd className="kbd">R</kbd>
                    </span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => { onFilterType?.(); onOpenChange(false); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-white"
                  >
                    <Filter className="w-4 h-4 text-zinc-500" />
                    <span>타입별 필터</span>
                    <span className="ml-auto text-xs text-zinc-600 hidden sm:block">
                      <kbd className="kbd">F</kbd>
                    </span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => { onSortChange?.(); onOpenChange(false); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-white"
                  >
                    <SortAsc className="w-4 h-4 text-zinc-500" />
                    <span>정렬 변경</span>
                    <span className="ml-auto text-xs text-zinc-600 hidden sm:block">
                      <kbd className="kbd">S</kbd>
                    </span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => { onOpenTerminal?.(); onOpenChange(false); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-300 cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-white"
                  >
                    <Terminal className="w-4 h-4 text-zinc-500" />
                    <span>터미널 열기</span>
                    <span className="ml-auto text-xs text-zinc-600 hidden sm:block">
                      <kbd className="kbd">T</kbd>
                    </span>
                  </Command.Item>
                </Command.Group>

                {/* 프로젝트 목록 */}
                {filteredProjects.length > 0 && (
                  <Command.Group heading={`프로젝트 (${filteredProjects.length})`}>
                    {filteredProjects.slice(0, 10).map((project) => (
                      <Command.Item
                        key={project.id}
                        value={`${project.name} ${project.tags?.join(' ') || ''} ${project.techStack.join(' ')}`}
                        onSelect={() => {
                          onSelectProject(project);
                          onOpenChange(false);
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer data-[selected=true]:bg-zinc-800"
                      >
                        {project.pinned ? (
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        ) : (
                          <Folder className="w-4 h-4 text-zinc-500" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-200">{project.name}</span>
                            {project.framework && (
                              <span className="text-xs text-zinc-500">
                                {project.framework}
                              </span>
                            )}
                          </div>
                          {/* 태그/기술스택 표시 */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {project.tags?.slice(0, 2).map((tag) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                #{tag}
                              </span>
                            ))}
                            {project.techStack.slice(0, 2).map((tech) => (
                              <span key={tech} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                                {tech}
                              </span>
                            ))}
                            {project.description && (
                              <span className="text-[10px] text-zinc-600 truncate max-w-[150px]">
                                📝 {project.description}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-600">
                          {project.lastModifiedRelative}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>

              {/* 하단 안내 */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#27272a] text-xs text-zinc-500">
                <div className="hidden sm:flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="kbd">#</kbd>
                    <span className="text-purple-400">태그</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="kbd">@</kbd>
                    <span className="text-blue-400">기술</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="kbd">*</kbd>
                    <span className="text-amber-400">즐겨찾기</span>
                  </span>
                </div>
                <span className="text-zinc-600">
                  {filteredProjects.length}/{projects.length} 프로젝트
                </span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
