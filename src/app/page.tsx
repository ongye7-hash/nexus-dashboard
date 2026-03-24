'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Grid3X3,
  List,
  SortAsc,
  Clock,
  Zap,
  TrendingUp,
  FolderOpen,
  ExternalLink,
  Terminal,
  Code2,
  Menu,
  X,
  Sunrise,
  BarChart3,
} from 'lucide-react';
import { Project, ProjectStatus, ProjectGroup, STATUS_LABELS, STATUS_COLORS } from '@/lib/types';
import { ProjectCard } from '@/components/ProjectCard';
import { CommandPalette } from '@/components/CommandPalette';
import { Sidebar } from '@/components/Sidebar';
import { ProjectModal } from '@/components/ProjectModal';
import { GroupManager } from '@/components/GroupManager';
import { MorningCodex } from '@/components/MorningCodex';
import { CodeSearch } from '@/components/CodeSearch';
import { useToast } from '@/components/Toast';
import StatsPanel from '@/components/StatsPanel';
import EasterEggEffects from '@/components/EasterEggEffects';
import { useEasterEggs } from '@/hooks/useEasterEggs';

type ViewMode = 'codex' | 'grid' | 'list' | 'stats';
type SortMode = 'recent' | 'lastOpened' | 'name' | 'type';

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('codex');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [activeFilter, setActiveFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [codeSearchOpen, setCodeSearchOpen] = useState(false);
  const { showToast } = useToast();
  const easterEggs = useEasterEggs();

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('프로젝트 로드 실패:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups');
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (error) {
      console.error('그룹 로드 실패:', error);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchGroups();
  }, [fetchProjects, fetchGroups]);

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: 모달/팔레트 닫기
      if (e.key === 'Escape') {
        if (selectedProject) {
          setSelectedProject(null);
        } else if (sidebarOpen) {
          setSidebarOpen(false);
        } else {
          setCommandOpen(false);
        }
        return;
      }

      // 모달이나 팔레트가 열려있으면 다른 단축키 무시
      if (selectedProject || commandOpen || groupManagerOpen) return;

      // Cmd/Ctrl + K: 커맨드 팔레트
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }

      // Ctrl + Shift + F: 코드 검색
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setCodeSearchOpen(true);
        return;
      }

      // /: 커맨드 팔레트 (vim 스타일)
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }

      // R: 새로고침
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        handleRefresh();
      }
      // C: Codex 뷰
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey) {
        setViewMode('codex');
      }
      // G: 그리드 뷰
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
        setViewMode('grid');
      }
      // L: 리스트 뷰
      if (e.key === 'l' && !e.metaKey && !e.ctrlKey) {
        setViewMode('list');
      }
      // T: 통계 뷰
      if (e.key === 't' && !e.metaKey && !e.ctrlKey) {
        setViewMode('stats');
      }

      // 숫자 키: 빠른 필터
      if (e.key === '1' && !e.metaKey && !e.ctrlKey) {
        setActiveFilter('all');
      }
      if (e.key === '2' && !e.metaKey && !e.ctrlKey) {
        setActiveFilter('pinned');
      }
      if (e.key === '3' && !e.metaKey && !e.ctrlKey) {
        setActiveFilter('recent');
      }
      if (e.key === '4' && !e.metaKey && !e.ctrlKey) {
        setActiveFilter('active');
      }
      if (e.key === '5' && !e.metaKey && !e.ctrlKey) {
        setActiveFilter('deployed');
      }

      // S: 정렬 모드 순환
      if (e.key === 's' && !e.metaKey && !e.ctrlKey) {
        setSortMode((prev) => {
          const modes: SortMode[] = ['recent', 'lastOpened', 'name', 'type'];
          const currentIndex = modes.indexOf(prev);
          return modes[(currentIndex + 1) % modes.length];
        });
      }

      // P: 즐겨찾기 필터 토글
      if (e.key === 'p' && !e.metaKey && !e.ctrlKey) {
        setActiveFilter((prev) => prev === 'pinned' ? 'all' : 'pinned');
      }

      // A: 전체 프로젝트
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey) {
        setActiveFilter('all');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandOpen, selectedProject, sidebarOpen, groupManagerOpen]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchProjects();
  };

  // 액션 실행 함수 (lastOpened 업데이트 포함)
  const executeAction = async (action: string, path: string, successMessage: string, projectName?: string) => {
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, path }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(successMessage, 'success');

        // lastOpened 업데이트
        if (projectName) {
          const now = new Date().toISOString();
          setProjects((prev) =>
            prev.map((p) =>
              p.name === projectName ? { ...p, lastOpened: now } : p
            )
          );
          // 백엔드에도 저장
          fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectName,
              updates: { lastOpened: now },
            }),
          }).catch(console.error);
          // 활동 기록 (히트맵 데이터)
          fetch('/api/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'record', type: 'project_open' }),
          }).catch(console.error);
        }
      } else {
        showToast(data.error || '실행에 실패했습니다', 'error');
      }
    } catch (error) {
      showToast('액션 실행에 실패했습니다', 'error');
    }
  };

  const handleOpenProject = (project: Project) => {
    setSelectedProject(project);
  };

  const handleOpenFolder = (project: Project) => {
    executeAction('openFolder', project.path, `📁 ${project.name} 폴더를 열었습니다`, project.name);
    setSelectedProject(null);
  };

  const handleOpenVSCode = (project: Project) => {
    executeAction('openVSCode', project.path, `💻 ${project.name}을(를) VSCode로 열었습니다`, project.name);
    if (selectedProject) setSelectedProject(null);
  };

  const handleRunProject = (project: Project) => {
    executeAction('runProject', project.path, `▶️ ${project.name} 프로젝트를 실행했습니다`, project.name);
    if (selectedProject) setSelectedProject(null);
  };

  const handleOpenTerminal = (project: Project) => {
    executeAction('openTerminal', project.path, `🖥️ ${project.name} 터미널을 열었습니다`, project.name);
    if (selectedProject) setSelectedProject(null);
  };

  const handleBatchRun = (projectsToRun: Project[]) => {
    projectsToRun.forEach((project, index) => {
      // 약간의 딜레이를 두고 순차적으로 실행
      setTimeout(() => {
        executeAction('runProject', project.path, `▶️ ${project.name} 실행`, project.name);
      }, index * 500);
    });
    showToast(`🚀 ${projectsToRun.length}개 프로젝트 일괄 실행 중...`, 'success');
  };

  const handleUpdateMemo = (projectName: string, memo: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.name === projectName ? { ...p, description: memo } : p
      )
    );
    showToast(`📝 ${projectName} 메모가 저장되었습니다`, 'success');
  };

  const handleUpdateTags = (projectName: string, tags: string[]) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.name === projectName ? { ...p, tags } : p
      )
    );
    showToast(`🏷️ ${projectName} 태그가 업데이트되었습니다`, 'success');
  };

  const handleUpdateStatus = (projectName: string, status: ProjectStatus) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.name === projectName ? { ...p, status } : p
      )
    );
    const statusLabels: Record<ProjectStatus, string> = {
      development: '개발중',
      active: '활성',
      deployed: '배포됨',
      archived: '보관됨',
    };
    showToast(`📊 ${projectName} 상태가 "${statusLabels[status]}"(으)로 변경되었습니다`, 'success');
  };

  const handleUpdateDeployUrl = (projectName: string, deployUrl: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.name === projectName ? { ...p, deployUrl: deployUrl || undefined } : p
      )
    );
    if (deployUrl) {
      showToast(`🌐 ${projectName} 배포 URL이 설정되었습니다`, 'success');
    } else {
      showToast(`🌐 ${projectName} 배포 URL이 삭제되었습니다`, 'info');
    }
  };

  const handleTogglePin = async (project: Project) => {
    const newPinned = !project.pinned;

    // Update local state immediately
    setProjects((prev) =>
      prev.map((p) =>
        p.name === project.name ? { ...p, pinned: newPinned } : p
      )
    );

    // Save to backend
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          updates: { pinned: newPinned },
        }),
      });
      showToast(
        newPinned ? `⭐ ${project.name} 즐겨찾기에 추가됨` : `${project.name} 즐겨찾기 해제`,
        'success'
      );
    } catch (error) {
      console.error('핀 저장 실패:', error);
    }
  };

  const handleUpdateGroup = (projectName: string, groupId: string | undefined) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.name === projectName ? { ...p, group: groupId } : p
      )
    );
    const groupName = groups.find((g) => g.id === groupId)?.name || '미분류';
    showToast(`📁 ${projectName}이(가) "${groupName}" 그룹으로 이동했습니다`, 'success');
  };

  // 그룹 관리 함수들
  const handleCreateGroup = async (group: Omit<ProjectGroup, 'id' | 'order'>) => {
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', group }),
      });
      const data = await res.json();
      if (data.success && data.group) {
        setGroups((prev) => [...prev, data.group]);
        showToast(`📁 "${group.name}" 그룹이 생성되었습니다`, 'success');
      }
    } catch (error) {
      console.error('그룹 생성 실패:', error);
    }
  };

  const handleUpdateGroupData = async (groupId: string, updates: Partial<ProjectGroup>) => {
    try {
      await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', groupId, group: updates }),
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, ...updates } : g))
      );
    } catch (error) {
      console.error('그룹 수정 실패:', error);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', groupId }),
      });
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      // 해당 그룹의 프로젝트들을 미분류로 이동
      setProjects((prev) =>
        prev.map((p) => (p.group === groupId ? { ...p, group: undefined } : p))
      );
      showToast('그룹이 삭제되었습니다', 'success');
    } catch (error) {
      console.error('그룹 삭제 실패:', error);
    }
  };

  // 모든 태그 수집 (중복 제거)
  const allTags = Array.from(
    new Set(projects.flatMap((p) => p.tags || []))
  ).sort();

  // 그룹별 프로젝트 수 계산
  const groupCounts: Record<string, number> = {
    none: projects.filter((p) => !p.group).length,
  };
  groups.forEach((group) => {
    groupCounts[group.id] = projects.filter((p) => p.group === group.id).length;
  });

  // 프로젝트 필터링
  const filteredProjects = projects.filter((p) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'pinned') return p.pinned;
    if (activeFilter === 'recent') {
      const lastMod = new Date(p.lastModified);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return lastMod > weekAgo;
    }
    if (activeFilter === 'active') return p.status === 'active' || p.status === 'development';
    if (activeFilter === 'deployed') return p.status === 'deployed';
    if (activeFilter === 'archived') return p.status === 'archived';
    if (activeFilter.startsWith('type:')) {
      const type = activeFilter.replace('type:', '');
      return p.type === type;
    }
    if (activeFilter.startsWith('tag:')) {
      const tag = activeFilter.replace('tag:', '');
      return p.tags?.includes(tag);
    }
    if (activeFilter.startsWith('group:')) {
      const groupId = activeFilter.replace('group:', '');
      if (groupId === 'none') return !p.group;
      return p.group === groupId;
    }
    return true;
  });

  // 프로젝트 정렬 (핀된 프로젝트 우선)
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    // 핀된 프로젝트가 항상 먼저 (즐겨찾기 필터가 아닌 경우)
    if (activeFilter !== 'pinned') {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
    }

    if (sortMode === 'recent') {
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    }
    if (sortMode === 'lastOpened') {
      // 열어본 적 없는 프로젝트는 뒤로
      if (!a.lastOpened && !b.lastOpened) return 0;
      if (!a.lastOpened) return 1;
      if (!b.lastOpened) return -1;
      return new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime();
    }
    if (sortMode === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortMode === 'type') {
      return a.type.localeCompare(b.type);
    }
    return 0;
  });

  // 통계
  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === 'active' || p.status === 'development').length,
    deployed: projects.filter((p) => p.status === 'deployed').length,
    recent: projects.filter((p) => {
      const lastMod = new Date(p.lastModified);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return lastMod > weekAgo;
    }).length,
    pinned: projects.filter((p) => p.pinned).length,
  };

  const getFilterTitle = () => {
    if (viewMode === 'codex') return 'Morning Codex';
    if (viewMode === 'stats') return '개발자 통계';
    switch (activeFilter) {
      case 'all': return '전체 프로젝트';
      case 'pinned': return '즐겨찾기';
      case 'recent': return '최근 작업';
      case 'active': return '활성 프로젝트';
      case 'deployed': return '배포된 프로젝트';
      case 'archived': return '보관됨';
      default:
        if (activeFilter.startsWith('type:')) {
          const type = activeFilter.replace('type:', '');
          const labels: Record<string, string> = {
            nextjs: 'Next.js',
            react: 'React (리액트)',
            python: 'Python (파이썬)',
            html: 'HTML (웹페이지)',
          };
          return labels[type] || type.toUpperCase();
        }
        if (activeFilter.startsWith('tag:')) {
          const tag = activeFilter.replace('tag:', '');
          return `#${tag} 태그`;
        }
        if (activeFilter.startsWith('group:')) {
          const groupId = activeFilter.replace('group:', '');
          if (groupId === 'none') return '미분류';
          const group = groups.find((g) => g.id === groupId);
          return group ? group.name : '그룹';
        }
        return '프로젝트';
    }
  };

  return (
    <>
      <Sidebar
        activeFilter={activeFilter}
        onFilterChange={(filter) => {
          setActiveFilter(filter);
          // 필터 선택시 Codex 뷰에서 그리드 뷰로 전환
          if (viewMode === 'codex') {
            setViewMode('grid');
          }
        }}
        stats={stats}
        allTags={allTags}
        groups={groups}
        groupCounts={groupCounts}
        onManageGroups={() => setGroupManagerOpen(true)}
        isMobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <main className="lg:ml-64 min-h-screen">
        {/* 헤더 */}
        <header className="sticky top-0 z-30 bg-[#09090b]/80 backdrop-blur-xl border-b border-[#1f1f23]">
          <div className="flex items-center justify-between h-16 px-4 lg:px-8">
            <div className="flex items-center gap-4 lg:gap-6">
              {/* 모바일 메뉴 버튼 */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div>
                <h1 className="text-base lg:text-lg font-semibold text-white">
                  {getFilterTitle()}
                </h1>
                <p className="text-xs lg:text-sm text-zinc-500">
                  {sortedProjects.length}개 프로젝트
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 뷰 모드 전환 */}
              <div className="flex items-center bg-[#18181b] rounded-lg p-1">
                <button
                  onClick={() => setViewMode('codex')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'codex'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Codex 뷰 (C)"
                >
                  <Sunrise className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="그리드 뷰 (G)"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'list'
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="리스트 뷰 (L)"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('stats')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'stats'
                      ? 'bg-emerald-600 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="통계 뷰 (T)"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
              </div>

              {/* 정렬 */}
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="hidden sm:block h-9 px-3 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="recent">최근 수정순</option>
                <option value="lastOpened">최근 열어본 순</option>
                <option value="name">이름순</option>
                <option value="type">타입순</option>
              </select>

              {/* 새로고침 */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 h-9 px-3 lg:px-4 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-300 hover:bg-[#27272a] hover:border-[#3f3f46] transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline">새로고침</span>
              </button>

              {/* 커맨드 팔레트 버튼 */}
              <button
                onClick={() => setCommandOpen(true)}
                className="flex items-center gap-2 lg:gap-3 h-9 px-3 lg:px-4 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white font-medium transition-colors"
              >
                <span className="hidden sm:inline">명령 실행</span>
                <span className="sm:hidden">검색</span>
                <span className="hidden lg:flex gap-1">
                  <kbd className="px-1.5 py-0.5 bg-indigo-500/50 rounded text-xs">Ctrl</kbd>
                  <kbd className="px-1.5 py-0.5 bg-indigo-500/50 rounded text-xs">K</kbd>
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* 통계 바 - Codex/Stats 뷰에서는 숨김 */}
        {viewMode !== 'codex' && viewMode !== 'stats' && <div className="px-4 lg:px-8 py-4 lg:py-6 border-b border-[#1f1f23]">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <div className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 bg-[#18181b] rounded-xl border border-[#27272a]">
              <div className="p-2 lg:p-3 bg-indigo-500/10 rounded-lg">
                <FolderOpen className="w-4 h-4 lg:w-5 lg:h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-xl lg:text-2xl font-semibold text-white">{stats.total}</p>
                <p className="text-xs lg:text-sm text-zinc-500">전체</p>
              </div>
            </div>
            <div className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 bg-[#18181b] rounded-xl border border-[#27272a]">
              <div className="p-2 lg:p-3 bg-green-500/10 rounded-lg">
                <Zap className="w-4 h-4 lg:w-5 lg:h-5 text-green-400" />
              </div>
              <div>
                <p className="text-xl lg:text-2xl font-semibold text-white">{stats.active}</p>
                <p className="text-xs lg:text-sm text-zinc-500">활성</p>
              </div>
            </div>
            <div className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 bg-[#18181b] rounded-xl border border-[#27272a]">
              <div className="p-2 lg:p-3 bg-purple-500/10 rounded-lg">
                <ExternalLink className="w-4 h-4 lg:w-5 lg:h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xl lg:text-2xl font-semibold text-white">{stats.deployed}</p>
                <p className="text-xs lg:text-sm text-zinc-500">배포됨</p>
              </div>
            </div>
            <div className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 bg-[#18181b] rounded-xl border border-[#27272a]">
              <div className="p-2 lg:p-3 bg-amber-500/10 rounded-lg">
                <Clock className="w-4 h-4 lg:w-5 lg:h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xl lg:text-2xl font-semibold text-white">{stats.recent}</p>
                <p className="text-xs lg:text-sm text-zinc-500">이번 주</p>
              </div>
            </div>
          </div>
        </div>}

        {/* 프로젝트 콘텐츠 */}
        <div className="p-4 lg:p-8">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="h-48 bg-[#18181b] rounded-xl border border-[#27272a] animate-pulse"
                />
              ))}
            </div>
          ) : viewMode === 'stats' ? (
            <StatsPanel projects={projects} />
          ) : viewMode === 'codex' ? (
            <MorningCodex
              projects={projects}
              onRunProject={handleRunProject}
              onOpenVSCode={handleOpenVSCode}
              onOpenTerminal={handleOpenTerminal}
              onSelectProject={handleOpenProject}
              onBatchRun={handleBatchRun}
            />
          ) : sortedProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FolderOpen className="w-12 h-12 text-zinc-600 mb-4" />
              <h3 className="text-lg font-medium text-zinc-300 mb-2">
                프로젝트가 없습니다
              </h3>
              <p className="text-sm text-zinc-500 max-w-md">
                현재 필터에 맞는 프로젝트가 없습니다. 필터를 변경하거나 바탕화면에 새 프로젝트를 추가해보세요.
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <AnimatePresence mode="popLayout">
                {sortedProjects.map((project, index) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    index={index}
                    onOpen={handleOpenProject}
                    onRun={handleRunProject}
                    onTogglePin={handleTogglePin}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {sortedProjects.map((project, index) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    onClick={() => handleOpenProject(project)}
                    className="flex items-center gap-3 lg:gap-4 p-3 lg:p-4 bg-[#18181b] border border-[#27272a] rounded-xl cursor-pointer hover:bg-[#1f1f23] hover:border-[#3f3f46] transition-colors"
                  >
                    <div className="flex items-center justify-center w-8 h-8 lg:w-10 lg:h-10 bg-zinc-800 rounded-lg flex-shrink-0">
                      <Code2 className="w-4 h-4 lg:w-5 lg:h-5 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm lg:text-base font-medium text-white truncate">{project.name}</h3>
                      <div className="flex items-center gap-1.5 lg:gap-2 mt-1 flex-wrap">
                        {project.framework && (
                          <span className="text-[10px] lg:text-xs text-zinc-500">{project.framework}</span>
                        )}
                        <span className="hidden sm:flex items-center gap-1.5">
                          {project.techStack.slice(0, 3).map((tech) => (
                            <span key={tech} className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 rounded">
                              {tech}
                            </span>
                          ))}
                        </span>
                        {project.tags && project.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-indigo-500/20 text-indigo-400 rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 lg:gap-4 text-xs lg:text-sm text-zinc-500 flex-shrink-0">
                      <span className="hidden sm:inline">{project.lastModifiedRelative}</span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[project.status] }}
                      />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* 키보드 단축키 힌트 - 모바일에서 숨김 */}
        <div className="hidden md:flex fixed bottom-6 right-6 items-center gap-3 px-4 py-2 bg-[#18181b]/90 backdrop-blur border border-[#27272a] rounded-lg text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">Ctrl+Shift+F</kbd> 코드검색
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">C</kbd> Codex
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">G</kbd>/<kbd className="kbd">L</kbd> 뷰
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">T</kbd> 통계
          </span>
        </div>
      </main>

      {/* 커맨드 팔레트 */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        projects={projects}
        onSelectProject={handleOpenProject}
        onRunProject={handleRunProject}
        onRefresh={handleRefresh}
        onFilterType={() => {
          setActiveFilter((prev) => {
            const types = ['all', 'type:nextjs', 'type:react', 'type:python', 'type:html'];
            const idx = types.indexOf(prev);
            return types[(idx + 1) % types.length];
          });
          if (viewMode === 'codex') setViewMode('grid');
        }}
        onSortChange={() => {
          setSortMode((prev) => {
            const modes: SortMode[] = ['recent', 'lastOpened', 'name', 'type'];
            const idx = modes.indexOf(prev);
            return modes[(idx + 1) % modes.length];
          });
        }}
        onOpenTerminal={() => {
          if (selectedProject) {
            handleOpenTerminal(selectedProject);
          }
        }}
      />

      {/* 프로젝트 상세 모달 */}
      <ProjectModal
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
        onOpenFolder={handleOpenFolder}
        onOpenVSCode={handleOpenVSCode}
        onRunProject={handleRunProject}
        onOpenTerminal={handleOpenTerminal}
        onUpdateMemo={handleUpdateMemo}
        onUpdateTags={handleUpdateTags}
        onUpdateStatus={handleUpdateStatus}
        onUpdateDeployUrl={handleUpdateDeployUrl}
        groups={groups}
        onUpdateGroup={handleUpdateGroup}
      />

      {/* 그룹 관리 모달 */}
      <GroupManager
        open={groupManagerOpen}
        onClose={() => setGroupManagerOpen(false)}
        groups={groups}
        onCreateGroup={handleCreateGroup}
        onUpdateGroup={handleUpdateGroupData}
        onDeleteGroup={handleDeleteGroup}
      />

      {/* 코드 검색 모달 */}
      <CodeSearch
        open={codeSearchOpen}
        onClose={() => setCodeSearchOpen(false)}
        projects={projects}
      />

      {/* 이스터에그 효과 */}
      <EasterEggEffects
        konamiActivated={easterEggs.konamiActivated}
        sudoSandwich={easterEggs.sudoSandwich}
        coffeeMode={easterEggs.coffeeMode}
        matrixMode={easterEggs.matrixMode}
        partyMode={easterEggs.partyMode}
      />
    </>
  );
}
