import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { linkGitHubRepoToLocal } from '@/lib/database';
import path from 'path';
import fs from 'fs';

const DESKTOP_PATH = 'C:\\Users\\user\\Desktop';

// GitHub URL만 허용 (커맨드 인젝션 방지)
const ALLOWED_URL_PATTERN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/;

export async function POST(request: Request) {
  try {
    const { fullName, repoUrl } = await request.json();

    if (!fullName || !repoUrl) {
      return NextResponse.json({ error: 'fullName and repoUrl required' }, { status: 400 });
    }

    // repoUrl 검증 (커맨드 인젝션 방지)
    if (!ALLOWED_URL_PATTERN.test(repoUrl)) {
      return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 });
    }

    // Extract repo name for folder
    const repoName = fullName.split('/')[1];
    if (!repoName || repoName.includes('..') || repoName.includes('/') || repoName.includes('\\')) {
      return NextResponse.json({ error: 'Invalid repo name' }, { status: 400 });
    }

    const targetPath = path.join(DESKTOP_PATH, repoName);

    // Check if folder already exists
    if (fs.existsSync(targetPath)) {
      // Check if it's already a git repo with same remote
      const gitDir = path.join(targetPath, '.git');
      if (fs.existsSync(gitDir)) {
        // Link it instead
        linkGitHubRepoToLocal(fullName, targetPath);
        return NextResponse.json({
          success: true,
          message: 'Folder already exists, linked to GitHub repo',
          path: targetPath,
          alreadyExists: true,
        });
      }
      return NextResponse.json({ error: `Folder "${repoName}" already exists on Desktop` }, { status: 409 });
    }

    // Clone the repo (execFileSync로 인수 분리 — 인젝션 불가)
    try {
      execFileSync('git', ['clone', repoUrl, targetPath], {
        encoding: 'utf-8',
        timeout: 120000,
        windowsHide: true,
      });
    } catch (e: any) {
      return NextResponse.json({ error: `Clone failed: ${e.message}` }, { status: 500 });
    }

    // Link in database
    linkGitHubRepoToLocal(fullName, targetPath);

    return NextResponse.json({
      success: true,
      message: `Cloned ${fullName} to Desktop`,
      path: targetPath,
    });
  } catch (error) {
    console.error('Clone error:', error);
    return NextResponse.json({ error: 'Clone failed' }, { status: 500 });
  }
}
