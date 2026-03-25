import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { Project, ProjectType, ProjectStatus } from '@/lib/types';
import { getProjectMeta, getAllProjectMeta, saveProjectMeta, getAllGitHubRepos, getAllVPSServers } from '@/lib/database';
import { connectSSH, sshExec } from '@/lib/ssh';

function detectLanguageType(language: string | null): ProjectType {
  if (!language) return 'unknown';
  const lang = language.toLowerCase();
  if (lang === 'typescript' || lang === 'javascript') return 'node';
  if (lang === 'python') return 'python';
  if (lang === 'html') return 'html';
  if (lang === 'vue') return 'vue';
  return 'unknown';
}

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
    } catch { /* Vercel 프로젝트 설정 파싱 실패 — 무시 */ }
  }

  // Check package.json homepage field
  const packageJsonPath = path.join(dirPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.homepage) return pkg.homepage;
    } catch { /* package.json 파싱 실패 — 무시 */ }
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
    } catch { /* vercel.json 파싱 실패 — 무시 */ }
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
    } catch { /* JSON 파싱 실패 */
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
    } catch { /* index.html 읽기 실패 — 무시 */ }
  }

  return { type, framework, techStack };
}

// 모든 프로젝트 메타데이터를 경로 기반 맵으로 변환
function loadAllMeta(): Record<string, any> {
  try {
    const allMeta = getAllProjectMeta();
    const metaMap: Record<string, any> = {};

    for (const meta of allMeta) {
      metaMap[meta.project_path] = {
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

        // Read directory listing once and use Set for O(1) lookups
        const dirContents = new Set<string>();
        try {
          const dirItems = fs.readdirSync(fullPath);
          dirItems.forEach(di => dirContents.add(di));
        } catch { /* 디렉토리 읽기 실패 — 무시 */ }

        const { type, framework, techStack } = detectProjectType(fullPath);
        const hasPackageJson = dirContents.has('package.json');
        const hasGit = dirContents.has('.git');
        const hasVercel = dirContents.has('.vercel');

        // 개발 프로젝트 식별: 아래 중 하나라도 있어야 프로젝트로 인정
        const isProject = hasPackageJson || hasGit || hasVercel
          || dirContents.has('requirements.txt')
          || dirContents.has('pyproject.toml')
          || dirContents.has('setup.py')
          || dirContents.has('index.html')
          || dirContents.has('Cargo.toml')
          || dirContents.has('go.mod')
          || dirContents.has('pom.xml')
          || dirContents.has('build.gradle')
          || dirContents.has('.gitignore');

        if (!isProject) continue;

        const projectMeta = meta[fullPath] || {};

        let status: ProjectStatus = 'development';
        if (projectMeta.status) {
          status = projectMeta.status;
        } else if (hasVercel) {
          status = 'deployed';
        } else if (type !== 'unknown') {
          status = 'active';
        }

        // Skip expensive directory walk during scan; fetch on-demand if needed
        const size = 0;
        const fileCount = 0;

        // Auto-detect deploy URL if not manually set
        const autoDetectedUrl = detectDeployUrl(fullPath);
        const deployUrl = projectMeta.deployUrl || autoDetectedUrl;

        // GitHub URL 자동 감지
        let githubUrl: string | undefined;
        let githubFullName: string | undefined;
        if (hasGit) {
          try {
            const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
              cwd: fullPath, encoding: 'utf-8', timeout: 1000, windowsHide: true,
            }).toString().trim();
            const ghMatch = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
            if (ghMatch) {
              githubFullName = `${ghMatch[1]}/${ghMatch[2]}`;
              githubUrl = `https://github.com/${githubFullName}`;
            }
          } catch { /* git remote 조회 실패 — 무시 */ }
        }

        const project: Project = {
          id: `proj-${crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12)}`,
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
          githubUrl,
          githubFullName,
        };

        projects.push(project);
      } catch (e) {
        console.error(`Error processing ${item}:`, e);
      }
    }

    // GitHub-only 레포 추가 (로컬에 없는 것만)
    try {
      const githubRepos = getAllGitHubRepos();
      const localPaths = new Set(projects.map(p => p.path.toLowerCase()));

      for (const ghRepo of githubRepos) {
        // 로컬에 이미 연결된 레포는 스킵
        if (ghRepo.local_path && localPaths.has(ghRepo.local_path.toLowerCase())) continue;
        // 이미 로컬 프로젝트로 매칭된 레포도 스킵
        if (projects.some(p => p.githubFullName?.toLowerCase() === ghRepo.full_name.toLowerCase())) continue;

        projects.push({
          id: `gh-${ghRepo.github_id}`,
          name: ghRepo.name,
          path: ghRepo.html_url, // URL as path for GitHub-only repos
          type: detectLanguageType(ghRepo.language),
          framework: ghRepo.language || undefined,
          lastModified: ghRepo.pushed_at || ghRepo.updated_at || new Date().toISOString(),
          lastModifiedRelative: getRelativeTime(new Date(ghRepo.pushed_at || ghRepo.updated_at || Date.now())),
          status: 'active' as ProjectStatus,
          description: ghRepo.description || undefined,
          techStack: ghRepo.language ? [ghRepo.language] : [],
          hasPackageJson: false,
          hasGit: true,
          githubUrl: ghRepo.html_url,
          githubFullName: ghRepo.full_name,
          isGithubOnly: true,
          githubStars: ghRepo.stars,
          githubForks: ghRepo.forks,
          size: 0,
          fileCount: 0,
          tags: [],
          pinned: false,
        });
      }
    } catch (error) {
      console.warn('GitHub 레포 목록 로드 실패:', error);
    }

    // VPS 프로젝트 추가 (5초 타임아웃)
    try {
      const vpsServers = getAllVPSServers();
      const VPS_TIMEOUT = 5000;

      // 연결 추적 (타임아웃 시 정리용)
      const activeConns: any[] = [];

      const vpsPromises = vpsServers.map(async (server) => {
        const vpsProjects: Project[] = [];
        let conn: any = null;
        try {
          conn = await connectSSH(server);
          activeConns.push(conn);
          const cwd = (server.default_cwd || '/home').replace(/[^a-zA-Z0-9/_.-]/g, '');
          const lsOutput = await sshExec(conn, `ls -d '${cwd}'/*/ 2>/dev/null | head -30`);
          const dirs = lsOutput.split('\n').filter(Boolean);

          for (const dir of dirs) {
            const name = dir.replace(/\/$/, '').split('/').pop() || '';
            if (!name || name.startsWith('.')) continue;
            const safeDir = dir.replace(/'/g, "'\\''");

            const checkResult = await sshExec(conn,
              `cd '${safeDir}' && ls package.json .git requirements.txt pyproject.toml index.html 2>/dev/null | head -5`
            );
            if (!checkResult) continue;

            const hasGit = checkResult.includes('.git');
            const hasPackageJson = checkResult.includes('package.json');

            let gitBranch = '';
            let lastCommit = '';
            if (hasGit) {
              gitBranch = await sshExec(conn, `cd '${safeDir}' && git rev-parse --abbrev-ref HEAD 2>/dev/null`).catch(() => '');
              lastCommit = await sshExec(conn, `cd '${safeDir}' && git log -1 --format="%s (%ar)" 2>/dev/null`).catch(() => '');
            }

            let framework = '';
            if (hasPackageJson) {
              const pkgCheck = await sshExec(conn, `cd '${safeDir}' && cat package.json 2>/dev/null | head -50`).catch(() => '');
              if (pkgCheck.includes('"next"')) framework = 'Next.js';
              else if (pkgCheck.includes('"react"')) framework = 'React';
              else if (pkgCheck.includes('"vue"')) framework = 'Vue';
              else if (pkgCheck.includes('"express"')) framework = 'Express';
              else framework = 'Node.js';
            } else if (checkResult.includes('requirements.txt') || checkResult.includes('pyproject.toml')) {
              framework = 'Python';
            }

            const dirClean = dir.replace(/\/$/, '');
            const projectType: ProjectType = framework.toLowerCase().includes('next') ? 'nextjs'
              : framework.toLowerCase().includes('react') ? 'react'
              : framework.toLowerCase().includes('vue') ? 'vue'
              : framework.toLowerCase().includes('python') ? 'python'
              : hasPackageJson ? 'node'
              : 'unknown';

            vpsProjects.push({
              id: `vps-${crypto.createHash('md5').update(`${server.id}:${dirClean}`).digest('hex').slice(0, 12)}`,
              name,
              path: dirClean,
              type: projectType,
              framework: framework || undefined,
              lastModified: new Date().toISOString(),
              lastModifiedRelative: '방금',
              status: 'active' as ProjectStatus,
              description: lastCommit || undefined,
              techStack: framework ? [framework] : [],
              hasPackageJson,
              hasGit,
              isVPS: true,
              vpsServerId: server.id,
              vpsServerName: server.name,
              size: 0,
              fileCount: 0,
              tags: [],
              pinned: false,
            });
          }

        } catch (err) {
          console.warn(`VPS ${server.name} 스캔 실패:`, err instanceof Error ? err.message : err);
        } finally {
          if (conn) { try { conn.end(); } catch { /* 연결 정리 */ } }
        }
        return vpsProjects;
      });

      // 전체 VPS 스캔에 타임아웃 적용 (타임아웃 시 남은 연결 정리)
      const vpsResults = await Promise.race([
        Promise.allSettled(vpsPromises),
        new Promise<never>((_, reject) => setTimeout(() => {
          // 타임아웃 시 모든 활성 연결 정리
          for (const c of activeConns) { try { c.end(); } catch { /* 정리 */ } }
          reject(new Error('VPS 스캔 타임아웃'));
        }, VPS_TIMEOUT)),
      ]).catch(() => [] as PromiseSettledResult<Project[]>[]);

      for (const result of vpsResults) {
        if (result.status === 'fulfilled') {
          // 로컬에 이미 같은 이름의 프로젝트가 있으면 스킵
          for (const vp of result.value) {
            if (!projects.some(p => p.name === vp.name && !p.isVPS)) {
              projects.push(vp);
            }
          }
        }
      }
    } catch (error) {
      console.warn('VPS 프로젝트 스캔 실패:', error);
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
