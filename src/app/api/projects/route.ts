import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Project, ProjectType, ProjectStatus } from '@/lib/types';
import { getProjectMeta, getAllProjectMeta, saveProjectMeta } from '@/lib/database';

const DESKTOP_PATH = 'C:\\Users\\user\\Desktop';

const IGNORED_FOLDERS = [
  'node_modules',
  '.next',
  '.git',
  '.vercel',
  '$RECYCLE.BIN',
  'System Volume Information',
];

const IGNORED_NAMES = [
  'desktop.ini',
  '.DS_Store',
];

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`;
  return `${Math.floor(diffDays / 365)}년 전`;
}

function detectDeployUrl(dirPath: string): string | undefined {
  // Check for Vercel deployment
  const vercelProjectPath = path.join(dirPath, '.vercel', 'project.json');
  if (fs.existsSync(vercelProjectPath)) {
    try {
      const vercelProject = JSON.parse(fs.readFileSync(vercelProjectPath, 'utf-8'));
      // Try to construct URL from project name
      if (vercelProject.projectId) {
        // Check for README or package.json for homepage
        const packageJsonPath = path.join(dirPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          if (pkg.homepage) return pkg.homepage;
        }
      }
    } catch {}
  }

  // Check package.json homepage field
  const packageJsonPath = path.join(dirPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.homepage) return pkg.homepage;
    } catch {}
  }

  // Check for common deployment indicator files
  const vercelJsonPath = path.join(dirPath, 'vercel.json');
  if (fs.existsSync(vercelJsonPath)) {
    try {
      const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
      // Vercel config might have alias or name
      if (vercelJson.alias && vercelJson.alias.length > 0) {
        return `https://${vercelJson.alias[0]}`;
      }
      if (vercelJson.name) {
        return `https://${vercelJson.name}.vercel.app`;
      }
    } catch {}
  }

  return undefined;
}

function detectProjectType(dirPath: string): { type: ProjectType; framework?: string; techStack: string[] } {
  const techStack: string[] = [];
  let type: ProjectType = 'unknown';
  let framework: string | undefined;

  const hasFile = (name: string) => fs.existsSync(path.join(dirPath, name));
  const readJson = (name: string) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dirPath, name), 'utf-8'));
    } catch {
      return null;
    }
  };

  // Check package.json
  if (hasFile('package.json')) {
    const pkg = readJson('package.json');
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps['next']) {
        type = 'nextjs';
        framework = 'Next.js';
        techStack.push('Next.js');
      } else if (deps['react']) {
        type = 'react';
        framework = 'React';
        techStack.push('React');
      } else if (deps['vue']) {
        type = 'vue';
        framework = 'Vue';
        techStack.push('Vue');
      } else {
        type = 'node';
        framework = 'Node.js';
        techStack.push('Node.js');
      }

      if (deps['typescript']) techStack.push('TypeScript');
      if (deps['tailwindcss']) techStack.push('Tailwind');
      if (deps['prisma']) techStack.push('Prisma');
      if (deps['@supabase/supabase-js']) techStack.push('Supabase');
      if (deps['express']) techStack.push('Express');
      if (deps['framer-motion']) techStack.push('Framer');
    }
  }

  // Check Python
  if (hasFile('requirements.txt') || hasFile('pyproject.toml') || hasFile('setup.py')) {
    type = 'python';
    framework = 'Python';
    techStack.push('Python');
  }

  // Check HTML
  if (type === 'unknown' && hasFile('index.html')) {
    type = 'html';
    framework = 'HTML';
    techStack.push('HTML');

    try {
      const html = fs.readFileSync(path.join(dirPath, 'index.html'), 'utf-8');
      if (html.includes('tailwindcss') || html.includes('tailwind')) techStack.push('Tailwind');
      if (html.includes('alpine')) techStack.push('Alpine.js');
    } catch {}
  }

  return { type, framework, techStack };
}

// 모든 프로젝트 메타데이터를 경로 기반 맵으로 변환
function loadAllMeta(): Record<string, any> {
  try {
    const allMeta = getAllProjectMeta();
    const metaMap: Record<string, any> = {};

    for (const meta of allMeta) {
      const projectName = path.basename(meta.project_path);
      metaMap[projectName] = {
        description: meta.notes,
        tags: meta.tags ? JSON.parse(meta.tags) : [],
        status: meta.status,
        pinned: meta.pinned === 1,
        lastOpened: meta.last_opened,
        group: meta.group_id,
        deployUrl: meta.deploy_url,
      };
    }

    return metaMap;
  } catch (e) {
    console.error('Failed to load meta from database:', e);
    return {};
  }
}

function getDirectorySize(dirPath: string, maxDepth = 2): { size: number; fileCount: number } {
  let size = 0;
  let fileCount = 0;

  function walk(currentPath: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const items = fs.readdirSync(currentPath);
      for (const item of items) {
        if (IGNORED_FOLDERS.includes(item)) continue;

        const fullPath = path.join(currentPath, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            size += stat.size;
            fileCount++;
          } else if (stat.isDirectory()) {
            walk(fullPath, depth + 1);
          }
        } catch {}
      }
    } catch {}
  }

  walk(dirPath, 0);
  return { size, fileCount };
}

export async function GET() {
  try {
    const items = fs.readdirSync(DESKTOP_PATH);
    const meta = loadAllMeta();
    const projects: Project[] = [];

    for (const item of items) {
      if (IGNORED_NAMES.includes(item)) continue;
      if (item.endsWith('.lnk')) continue;
      if (item.startsWith('.')) continue;

      const fullPath = path.join(DESKTOP_PATH, item);

      try {
        const stat = fs.statSync(fullPath);

        if (!stat.isDirectory()) continue;
        if (IGNORED_FOLDERS.includes(item)) continue;

        const { type, framework, techStack } = detectProjectType(fullPath);
        const hasPackageJson = fs.existsSync(path.join(fullPath, 'package.json'));
        const hasGit = fs.existsSync(path.join(fullPath, '.git'));
        const hasVercel = fs.existsSync(path.join(fullPath, '.vercel'));

        // 개발 프로젝트 식별: 아래 중 하나라도 있어야 프로젝트로 인정
        const isProject = hasPackageJson || hasGit || hasVercel
          || fs.existsSync(path.join(fullPath, 'requirements.txt'))
          || fs.existsSync(path.join(fullPath, 'pyproject.toml'))
          || fs.existsSync(path.join(fullPath, 'setup.py'))
          || fs.existsSync(path.join(fullPath, 'index.html'))
          || fs.existsSync(path.join(fullPath, 'Cargo.toml'))
          || fs.existsSync(path.join(fullPath, 'go.mod'))
          || fs.existsSync(path.join(fullPath, 'pom.xml'))
          || fs.existsSync(path.join(fullPath, 'build.gradle'))
          || fs.existsSync(path.join(fullPath, '.gitignore'));

        if (!isProject) continue;

        const projectMeta = meta[item] || {};

        let status: ProjectStatus = 'development';
        if (projectMeta.status) {
          status = projectMeta.status;
        } else if (hasVercel) {
          status = 'deployed';
        } else if (type !== 'unknown') {
          status = 'active';
        }

        const { size, fileCount } = getDirectorySize(fullPath);

        // Auto-detect deploy URL if not manually set
        const autoDetectedUrl = detectDeployUrl(fullPath);
        const deployUrl = projectMeta.deployUrl || autoDetectedUrl;

        const project: Project = {
          id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${projects.length}`,
          name: item,
          path: fullPath,
          type,
          framework,
          lastModified: stat.mtime.toISOString(),
          lastModifiedRelative: getRelativeTime(stat.mtime),
          status,
          description: projectMeta.description,
          techStack,
          hasPackageJson,
          hasGit,
          deployUrl,
          size,
          fileCount,
          tags: projectMeta.tags || [],
          pinned: projectMeta.pinned || false,
          lastOpened: projectMeta.lastOpened,
          group: projectMeta.group,
        };

        projects.push(project);
      } catch (e) {
        console.error(`Error processing ${item}:`, e);
      }
    }

    // Sort: pinned first, then by last modified
    projects.sort((a, b) => {
      // Pinned projects come first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // Then sort by last modified
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });

    return NextResponse.json({ projects, total: projects.length });
  } catch (error) {
    console.error('Failed to scan projects:', error);
    return NextResponse.json(
      { error: 'Failed to scan projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectName, updates } = body;

    // 프로젝트 경로 찾기
    const projectPath = path.join(DESKTOP_PATH, projectName);

    // SQLite에 저장
    saveProjectMeta({
      project_path: projectPath,
      notes: updates.description,
      tags: updates.tags ? JSON.stringify(updates.tags) : undefined,
      status: updates.status,
      pinned: updates.pinned !== undefined ? (updates.pinned ? 1 : 0) : undefined,
      last_opened: updates.lastOpened,
      group_id: updates.group,
      deploy_url: updates.deployUrl,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}
