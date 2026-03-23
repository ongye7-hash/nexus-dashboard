'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutGrid,
  FolderOpen,
  Clock,
  Star,
  Settings,
  Search,
  Zap,
  TrendingUp,
  Archive,
  Code2,
  Globe,
  FileCode,
  Braces,
  ChevronRight,
  Tag,
  Pin,
  FolderPlus,
  Layers,
  Plus,
} from 'lucide-react';

interface ProjectGroup {
  id: string;
  name: string;
  color: string;
  icon?: string;
  order: number;
}

interface SidebarProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  stats: {
    total: number;
    active: number;
    deployed: number;
    recent: number;
    pinned: number;
  };
  allTags?: string[];
  groups?: ProjectGroup[];
  groupCounts?: Record<string, number>;
  onManageGroups?: () => void;
}

const TAG_COLORS = [
  'bg-red-500/20 text-red-400',
  'bg-orange-500/20 text-orange-400',
  'bg-amber-500/20 text-amber-400',
  'bg-green-500/20 text-green-400',
  'bg-teal-500/20 text-teal-400',
  'bg-blue-500/20 text-blue-400',
  'bg-indigo-500/20 text-indigo-400',
  'bg-purple-500/20 text-purple-400',
  'bg-pink-500/20 text-pink-400',
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

const NAV_ITEMS = [
  { id: 'all', label: '전체 프로젝트', icon: LayoutGrid },
  { id: 'pinned', label: '즐겨찾기', icon: Star },
  { id: 'recent', label: '최근 작업', icon: Clock },
  { id: 'active', label: '활성 프로젝트', icon: Zap },
  { id: 'deployed', label: '배포됨', icon: Globe },
  { id: 'archived', label: '보관됨', icon: Archive },
];

const TYPE_FILTERS = [
  { id: 'nextjs', label: 'Next.js', icon: Braces, color: '#000' },
  { id: 'react', label: 'React (리액트)', icon: Code2, color: '#61dafb' },
  { id: 'python', label: 'Python (파이썬)', icon: FileCode, color: '#3776ab' },
  { id: 'html', label: 'HTML (웹페이지)', icon: Globe, color: '#e34c26' },
];

export function Sidebar({ activeFilter, onFilterChange, stats, allTags = [], groups = [], groupCounts = {}, onManageGroups }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-[#0f0f10] border-r border-[#1f1f23] z-40 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex flex-col h-full">
        {/* 로고 */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-[#1f1f23]">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white tracking-tight">Nexus (넥서스)</span>
            </motion.div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            />
          </button>
        </div>

        {/* 검색 힌트 */}
        {!collapsed && (
          <div className="p-3">
            <button className="w-full flex items-center gap-3 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-zinc-500 hover:border-[#3f3f46] transition-colors">
              <Search className="w-4 h-4" />
              <span>검색</span>
              <span className="ml-auto flex gap-1">
                <kbd className="kbd">Ctrl</kbd>
                <kbd className="kbd">K</kbd>
              </span>
            </button>
          </div>
        )}

        {/* 네비게이션 */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeFilter === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onFilterChange(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.id === 'all' && (
                        <span className="text-xs text-zinc-600">{stats.total}</span>
                      )}
                      {item.id === 'pinned' && stats.pinned > 0 && (
                        <span className="text-xs text-amber-500">{stats.pinned}</span>
                      )}
                      {item.id === 'active' && (
                        <span className="text-xs text-zinc-600">{stats.active}</span>
                      )}
                      {item.id === 'deployed' && (
                        <span className="text-xs text-zinc-600">{stats.deployed}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* 타입별 필터 */}
          {!collapsed && (
            <div className="mt-6">
              <div className="px-3 mb-2">
                <span className="text-xs font-medium text-zinc-600 uppercase tracking-wider">
                  타입별 분류
                </span>
              </div>
              <div className="space-y-1">
                {TYPE_FILTERS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeFilter === `type:${item.id}`;

                  return (
                    <button
                      key={item.id}
                      onClick={() => onFilterChange(`type:${item.id}`)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-zinc-800 text-white'
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      <span
                        className="w-4 h-4 flex items-center justify-center rounded"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        <Icon className="w-3 h-3" style={{ color: item.color }} />
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 그룹별 필터 */}
          {!collapsed && (
            <div className="mt-6">
              <div className="px-3 mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600 uppercase tracking-wider">
                  그룹
                </span>
                {onManageGroups && (
                  <button
                    onClick={onManageGroups}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400"
                    title="그룹 관리"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {/* 그룹 없음 필터 */}
                <button
                  onClick={() => onFilterChange('group:none')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeFilter === 'group:none'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                  }`}
                >
                  <Layers className="w-4 h-4 text-zinc-500" />
                  <span className="flex-1 text-left">미분류</span>
                  <span className="text-xs text-zinc-600">{groupCounts['none'] || 0}</span>
                </button>
                {groups.sort((a, b) => a.order - b.order).map((group) => {
                  const isActive = activeFilter === `group:${group.id}`;
                  const count = groupCounts[group.id] || 0;

                  return (
                    <button
                      key={group.id}
                      onClick={() => onFilterChange(`group:${group.id}`)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-zinc-800 text-white'
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                      <span className="flex-1 text-left truncate">{group.name}</span>
                      <span className="text-xs text-zinc-600">{count}</span>
                    </button>
                  );
                })}
                {groups.length === 0 && (
                  <button
                    onClick={onManageGroups}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-400 transition-colors"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>그룹 만들기</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 태그별 필터 */}
          {!collapsed && allTags.length > 0 && (
            <div className="mt-6">
              <div className="px-3 mb-2">
                <span className="text-xs font-medium text-zinc-600 uppercase tracking-wider">
                  태그
                </span>
              </div>
              <div className="space-y-1">
                {allTags.slice(0, 8).map((tag) => {
                  const isActive = activeFilter === `tag:${tag}`;
                  const colorClass = getTagColor(tag);

                  return (
                    <button
                      key={tag}
                      onClick={() => onFilterChange(`tag:${tag}`)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-zinc-800 text-white'
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      <span className={`px-1.5 py-0.5 text-[10px] rounded ${colorClass}`}>
                        #
                      </span>
                      <span className="truncate">{tag}</span>
                    </button>
                  );
                })}
                {allTags.length > 8 && (
                  <p className="px-3 py-1 text-xs text-zinc-600">
                    +{allTags.length - 8}개 더...
                  </p>
                )}
              </div>
            </div>
          )}
        </nav>

        {/* 하단 */}
        {!collapsed && (
          <div className="p-3 border-t border-[#1f1f23]">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors">
              <Settings className="w-4 h-4" />
              <span>설정</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
