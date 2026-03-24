import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { validateProjectPath } from '@/lib/path-validator';

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  relativeDate: string;
}

interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  staged: string[];
}

interface GitInfo {
  isGitRepo: boolean;
  currentBranch?: string;
  commits?: GitCommit[];
  branches?: GitBranch[];
  status?: GitStatus;
  remoteUrl?: string;
  hasRemote?: boolean;
  ahead?: number;
  behind?: number;
}

function execGit(projectPath: string, command: string): string | null {
  try {
    return execSync(`git ${command}`, {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
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
  return `${Math.floor(diffDays / 30)}개월 전`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  // 경로 검증 (Path Traversal 방지)
  const validation = validateProjectPath(projectPath);
  if (!validation.isValid) {
    return NextResponse.json(
      { error: validation.error || 'Invalid path' },
      { status: 400 }
    );
  }

  const safePath = validation.sanitizedPath!;
  const gitDir = path.join(safePath, '.git');
  const isGitRepo = fs.existsSync(gitDir);

  if (!isGitRepo) {
    return NextResponse.json({ isGitRepo: false });
  }

  const info: GitInfo = { isGitRepo: true };

  // Current branch
  const branch = execGit(safePath, 'rev-parse --abbrev-ref HEAD');
  if (branch) {
    info.currentBranch = branch;
  }

  // Recent commits (last 10)
  const logOutput = execGit(
    safePath,
    'log --oneline -10 --format="%H|%h|%s|%an|%aI"'
  );
  if (logOutput) {
    info.commits = logOutput.split('\n').filter(Boolean).map((line) => {
      const [hash, shortHash, message, author, date] = line.split('|');
      return {
        hash,
        shortHash,
        message,
        author,
        date,
        relativeDate: getRelativeTime(date),
      };
    });
  }

  // Branches
  const branchOutput = execGit(safePath, 'branch -a');
  if (branchOutput) {
    info.branches = branchOutput.split('\n').filter(Boolean).map((line) => {
      const isCurrent = line.startsWith('*');
      const name = line.replace(/^\*?\s+/, '').replace('remotes/', '');
      const isRemote = line.includes('remotes/');
      return { name, isCurrent, isRemote };
    });
  }

  // Status
  const statusOutput = execGit(safePath, 'status --porcelain');
  if (statusOutput !== null) {
    const status: GitStatus = {
      modified: [],
      added: [],
      deleted: [],
      untracked: [],
      staged: [],
    };

    statusOutput.split('\n').filter(Boolean).forEach((line) => {
      const code = line.substring(0, 2);
      const file = line.substring(3);

      if (code.includes('?')) {
        status.untracked.push(file);
      } else {
        if (code[0] !== ' ') {
          status.staged.push(file);
        }
        if (code[1] === 'M') {
          status.modified.push(file);
        } else if (code[1] === 'A') {
          status.added.push(file);
        } else if (code[1] === 'D') {
          status.deleted.push(file);
        }
      }
    });

    info.status = status;
  }

  // Remote URL
  const remoteUrl = execGit(safePath, 'remote get-url origin');
  if (remoteUrl) {
    info.remoteUrl = remoteUrl;
    info.hasRemote = true;

    // Ahead/behind
    const aheadBehind = execGit(
      safePath,
      `rev-list --left-right --count ${branch}...origin/${branch}`
    );
    if (aheadBehind) {
      const [ahead, behind] = aheadBehind.split('\t').map(Number);
      info.ahead = ahead || 0;
      info.behind = behind || 0;
    }
  } else {
    info.hasRemote = false;
  }

  return NextResponse.json(info);
}
