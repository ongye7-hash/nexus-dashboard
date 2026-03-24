import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface RoutineResult {
  projectName: string;
  projectPath: string;
  steps: {
    name: string;
    status: 'success' | 'skipped' | 'error';
    message?: string;
    duration?: number;
  }[];
}

async function runGitPull(projectPath: string): Promise<{ status: 'success' | 'skipped' | 'error'; message: string; duration: number }> {
  const startTime = Date.now();

  // .git 폴더 확인
  const gitPath = path.join(projectPath, '.git');
  if (!fs.existsSync(gitPath)) {
    return { status: 'skipped', message: 'Git 저장소가 아님', duration: Date.now() - startTime };
  }

  try {
    const { stdout, stderr } = await execAsync('git pull', {
      cwd: projectPath,
      timeout: 30000,
    });

    if (stdout.includes('Already up to date') || stdout.includes('이미 최신 상태입니다')) {
      return { status: 'success', message: '이미 최신 상태', duration: Date.now() - startTime };
    }

    return { status: 'success', message: stdout.trim() || '업데이트 완료', duration: Date.now() - startTime };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { status: 'error', message: errorMessage, duration: Date.now() - startTime };
  }
}

async function runNpmInstall(projectPath: string): Promise<{ status: 'success' | 'skipped' | 'error'; message: string; duration: number }> {
  const startTime = Date.now();

  // package.json 확인
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { status: 'skipped', message: 'package.json 없음', duration: Date.now() - startTime };
  }

  // node_modules 존재 확인 (없으면 설치 필요)
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  const lockFilePath = path.join(projectPath, 'package-lock.json');
  const pnpmLockPath = path.join(projectPath, 'pnpm-lock.yaml');

  // package.json과 lock 파일 비교하여 설치 필요 여부 판단
  const needsInstall = !fs.existsSync(nodeModulesPath);

  if (!needsInstall) {
    return { status: 'skipped', message: '이미 설치됨', duration: Date.now() - startTime };
  }

  try {
    // pnpm 또는 npm 사용
    const usesPnpm = fs.existsSync(pnpmLockPath);
    const cmd = usesPnpm ? 'pnpm install' : 'npm install';

    await execAsync(cmd, {
      cwd: projectPath,
      timeout: 120000, // 2분
    });

    return { status: 'success', message: `${usesPnpm ? 'pnpm' : 'npm'} install 완료`, duration: Date.now() - startTime };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { status: 'error', message: errorMessage, duration: Date.now() - startTime };
  }
}

export async function POST(request: Request) {
  try {
    const { projects, actions } = await request.json();

    if (!projects || !Array.isArray(projects)) {
      return NextResponse.json({ error: 'Projects array required' }, { status: 400 });
    }

    const enabledActions = actions || { gitPull: true, npmInstall: true };
    const results: RoutineResult[] = [];

    for (const project of projects) {
      const result: RoutineResult = {
        projectName: project.name,
        projectPath: project.path,
        steps: [],
      };

      // Git Pull
      if (enabledActions.gitPull) {
        const gitResult = await runGitPull(project.path);
        result.steps.push({
          name: 'git pull',
          status: gitResult.status,
          message: gitResult.message,
          duration: gitResult.duration,
        });
      }

      // npm install
      if (enabledActions.npmInstall) {
        const npmResult = await runNpmInstall(project.path);
        result.steps.push({
          name: 'npm install',
          status: npmResult.status,
          message: npmResult.message,
          duration: npmResult.duration,
        });
      }

      results.push(result);
    }

    // 결과 요약
    const summary = {
      total: results.length,
      gitPulled: results.filter(r => r.steps.find(s => s.name === 'git pull' && s.status === 'success')).length,
      npmInstalled: results.filter(r => r.steps.find(s => s.name === 'npm install' && s.status === 'success')).length,
      errors: results.filter(r => r.steps.some(s => s.status === 'error')).length,
    };

    return NextResponse.json({
      success: true,
      results,
      summary,
    });
  } catch (error) {
    console.error('Morning routine error:', error);
    return NextResponse.json(
      { error: 'Morning routine failed' },
      { status: 500 }
    );
  }
}
