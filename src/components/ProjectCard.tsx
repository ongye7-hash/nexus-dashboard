'use client';

import { motion } from 'framer-motion';
import {
  Folder,
  ExternalLink,
  Clock,
  GitBranch,
  Package,
  Play,
  MoreHorizontal,
  Code2,
  Globe,
  FileCode,
  Braces,
  Tag,
  Star,
  FolderGit2 as GithubIcon,
  GitFork,
  Server,
} from 'lucide-react';
import { Project, PROJECT_TYPE_COLORS, STATUS_COLORS, STATUS_LABELS } from '@/lib/types';

interface ProjectCardProps {
  project: Project;
  index: number;
  onOpen: (project: Project) => void;
  onRun: (project: Project) => void;
  onTogglePin?: (project: Project) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  nextjs: <Braces className="w-4 h-4" />,
  react: <Code2 className="w-4 h-4" />,
  vue: <Code2 className="w-4 h-4" />,
  html: <Globe className="w-4 h-4" />,
  python: <FileCode className="w-4 h-4" />,
  node: <Braces className="w-4 h-4" />,
  unknown: <Folder className="w-4 h-4" />,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

export function ProjectCard({ project, index, onOpen, onRun, onTogglePin }: ProjectCardProps) {
  const typeColor = PROJECT_TYPE_COLORS[project.type];
  const statusColor = STATUS_COLORS[project.status];
  const statusLabel = STATUS_LABELS[project.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group relative"
    >
      <div
        onClick={() => onOpen(project)}
        className={`relative flex flex-col h-full p-5 bg-[#18181b] rounded-xl cursor-pointer transition-all duration-200 hover:bg-[#1f1f23] hover:shadow-lg hover:shadow-black/20 ${
          project.isGithubOnly
            ? 'border border-dashed border-purple-500/30 hover:border-purple-500/50'
            : project.isVPS
              ? 'border border-dashed border-cyan-500/30 hover:border-cyan-500/50'
              : 'border border-[#27272a] hover:border-[#3f3f46]'
        }`}
      >
        {/* 상단 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-lg"
              style={{ backgroundColor: `${typeColor}15` }}
            >
              <span style={{ color: typeColor }}>{TYPE_ICONS[project.type]}</span>
            </div>
            <div>
              <h3 className="font-semibold text-[15px] text-white leading-tight group-hover:text-indigo-400 transition-colors">
                {project.name}
              </h3>
              {project.framework && (
                <p className="text-xs text-zinc-500 mt-0.5">{project.framework}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* 핀 버튼 - 항상 보이거나 호버시 보임 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin?.(project);
              }}
              className={`p-2 rounded-lg transition-colors ${
                project.pinned
                  ? 'text-amber-400 hover:bg-zinc-700/50'
                  : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 opacity-0 group-hover:opacity-100'
              }`}
              title={project.pinned ? '즐겨찾기 해제' : '즐겨찾기'}
            >
              <Star className={`w-4 h-4 ${project.pinned ? 'fill-amber-400' : ''}`} />
            </button>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {project.hasPackageJson && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRun(project);
                  }}
                  className="p-2 rounded-lg hover:bg-zinc-700/50 text-zinc-400 hover:text-green-400 transition-colors"
                  title="프로젝트 실행"
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
              {project.deployUrl && (
                <a
                  href={project.deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-lg hover:bg-zinc-700/50 text-zinc-400 hover:text-indigo-400 transition-colors"
                  title="배포된 사이트 열기"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-2 rounded-lg hover:bg-zinc-700/50 text-zinc-400 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 메모 */}
        {project.description && (
          <div className="flex items-start gap-2 mb-4 p-2.5 bg-zinc-800/50 rounded-lg">
            <span className="text-zinc-500 text-xs mt-0.5">📝</span>
            <p className="text-sm text-zinc-400 line-clamp-2">{project.description}</p>
          </div>
        )}

        {/* 기술 스택 */}
        {project.techStack.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {project.techStack.slice(0, 4).map((tech) => (
              <span
                key={tech}
                className="px-2 py-0.5 text-[11px] font-medium text-zinc-400 bg-zinc-800 rounded-md"
              >
                {tech}
              </span>
            ))}
            {project.techStack.length > 4 && (
              <span className="px-2 py-0.5 text-[11px] font-medium text-zinc-500 bg-zinc-800/50 rounded-md">
                +{project.techStack.length - 4}
              </span>
            )}
          </div>
        )}

        {/* 태그 */}
        {project.tags && project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {project.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-md ${getTagColor(tag)}`}
              >
                #{tag}
              </span>
            ))}
            {project.tags.length > 3 && (
              <span className="px-2 py-0.5 text-[10px] font-medium text-zinc-500 bg-zinc-800/50 rounded-md">
                +{project.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* 하단 */}
        <div className="flex items-center justify-between mt-auto pt-4 border-t border-zinc-800">
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {project.lastModifiedRelative}
            </span>
            {project.isGithubOnly && project.githubUrl && (
              <>
                {project.githubStars != null && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {project.githubStars}
                  </span>
                )}
                {project.githubForks != null && (
                  <span className="flex items-center gap-1">
                    <GitFork className="w-3 h-3" />
                    {project.githubForks}
                  </span>
                )}
              </>
            )}
            {project.hasGit && (
              <span className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                Git
              </span>
            )}
            {project.githubUrl && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                <GithubIcon className="w-3 h-3" />
                {project.isGithubOnly ? 'GitHub' : 'GitHub 연결'}
              </span>
            )}
            {project.isVPS && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                <Server className="w-3 h-3" />
                {project.vpsServerName || 'VPS'}
              </span>
            )}
            {project.hasPackageJson && (
              <span className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                npm
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: statusColor }}
            />
            <span className="text-xs text-zinc-500">{statusLabel}</span>
          </div>
        </div>

        {/* 호버 그라데이션 효과 */}
        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5" />
        </div>
      </div>
    </motion.div>
  );
}
