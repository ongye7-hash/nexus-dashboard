export interface Project {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  framework?: string;
  lastModified: string;
  lastModifiedRelative: string;
  status: ProjectStatus;
  description?: string;
  techStack: string[];
  hasPackageJson: boolean;
  hasGit: boolean;
  deployUrl?: string;
  size?: number;
  fileCount?: number;
  tags?: string[];
  pinned?: boolean;
  lastOpened?: string;
  group?: string;
  githubUrl?: string;
  githubFullName?: string;
  isGithubOnly?: boolean;
  githubStars?: number;
  githubForks?: number;
  isVPS?: boolean;
  vpsServerId?: string;
  vpsServerName?: string;
}

export interface ProjectGroup {
  id: string;
  name: string;
  color: string;
  icon?: string;
  order: number;
}

export type ProjectType =
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'html'
  | 'python'
  | 'node'
  | 'unknown';

export type ProjectStatus =
  | 'active'
  | 'deployed'
  | 'archived'
  | 'development';

export interface ProjectMeta {
  notes?: string;
  tags?: string[];
  priority?: 'high' | 'medium' | 'low';
  deployUrl?: string;
  status?: ProjectStatus;
  pinned?: boolean;
  lastOpened?: string;
  group?: string;
}

export const GROUP_COLORS = [
  { id: 'blue', color: '#3b82f6', label: '파랑' },
  { id: 'purple', color: '#8b5cf6', label: '보라' },
  { id: 'pink', color: '#ec4899', label: '핑크' },
  { id: 'red', color: '#ef4444', label: '빨강' },
  { id: 'orange', color: '#f97316', label: '주황' },
  { id: 'amber', color: '#f59e0b', label: '노랑' },
  { id: 'green', color: '#22c55e', label: '초록' },
  { id: 'teal', color: '#14b8a6', label: '청록' },
  { id: 'cyan', color: '#06b6d4', label: '하늘' },
  { id: 'gray', color: '#71717a', label: '회색' },
];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  nextjs: 'Next.js',
  react: 'React (리액트)',
  vue: 'Vue (뷰)',
  html: 'HTML (웹페이지)',
  python: 'Python (파이썬)',
  node: 'Node.js (노드)',
  unknown: '프로젝트',
};

export const PROJECT_TYPE_COLORS: Record<ProjectType, string> = {
  nextjs: '#000000',
  react: '#61dafb',
  vue: '#42b883',
  html: '#e34c26',
  python: '#3776ab',
  node: '#339933',
  unknown: '#71717a',
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '활성',
  deployed: '배포됨',
  archived: '보관됨',
  development: '개발중',
};

// GitHub 레포 타입
export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  description?: string;
  html_url: string;
  default_branch: string;
  language?: string;
  stars: number;
  forks: number;
  open_issues: number;
  updated_at: string;
  pushed_at: string;
  local_path?: string;
  is_private: boolean;
  synced_at?: string;
}

// GitHub 사용자 정보
export interface GitHubUser {
  login: string;
  name?: string;
  avatar_url: string;
  public_repos: number;
  total_private_repos?: number;
}

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  active: '#22c55e',
  deployed: '#6366f1',
  archived: '#71717a',
  development: '#eab308',
};
