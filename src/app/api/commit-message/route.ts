import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { validateProjectPath } from '@/lib/path-validator';

const execAsync = promisify(exec);

// 설정 상수
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_TIMEOUT = 30000; // 30초
const GIT_TIMEOUT = 30000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 5; // 5MB
const MAX_DIFF_LENGTH = 4000;

async function getGitDiff(projectPath: string): Promise<string> {
  try {
    // staged 변경사항 먼저 확인
    const { stdout: stagedDiff } = await execAsync('git diff --cached', {
      cwd: projectPath,
      timeout: GIT_TIMEOUT,
      maxBuffer: MAX_BUFFER_SIZE,
    });

    if (stagedDiff.trim()) {
      return stagedDiff;
    }

    // staged가 없으면 unstaged 확인
    const { stdout: unstagedDiff } = await execAsync('git diff', {
      cwd: projectPath,
      timeout: GIT_TIMEOUT,
      maxBuffer: MAX_BUFFER_SIZE,
    });

    return unstagedDiff;
  } catch (error) {
    console.error('Git diff error:', error);
    return '';
  }
}

async function getGitStatus(projectPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git status --porcelain', {
      cwd: projectPath,
      timeout: GIT_TIMEOUT,
    });
    return stdout;
  } catch { /* git status 실패 — 빈 문자열 반환 */
    return '';
  }
}

async function generateWithOllama(diff: string, status: string): Promise<string> {
  // diff가 너무 길면 잘라내기
  const truncatedDiff = diff.length > MAX_DIFF_LENGTH
    ? diff.substring(0, MAX_DIFF_LENGTH) + '\n\n... (diff truncated)'
    : diff;

  const prompt = `You are a helpful assistant that generates git commit messages.
Based on the following git diff and status, generate a concise and descriptive commit message.

Rules:
1. Use conventional commit format: type(scope): description
2. Types: feat, fix, docs, style, refactor, test, chore, perf
3. Keep the first line under 72 characters
4. Be specific about what changed
5. Write in English
6. Do not include the diff in the message
7. Return ONLY the commit message, nothing else

Git Status:
${status}

Git Diff:
${truncatedDiff}

Commit message:`;

  // 타임아웃 설정
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 100,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('Ollama request failed');
    }

    const data = await response.json();
    const message = data.response?.trim() || '';

    // 빈 응답 체크
    if (!message) {
      throw new Error('Ollama returned empty response');
    }

    // 커밋 메시지만 추출 (첫 번째 줄만)
    const firstLine = message.split('\n')[0].trim();
    return firstLine || 'chore: update';
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Ollama error:', error);
    throw error;
  }
}

// Ollama 없이 간단한 규칙 기반 생성
function generateSimpleMessage(status: string): string {
  const lines = status.trim().split('\n').filter(Boolean);

  if (lines.length === 0) {
    return 'chore: update';
  }

  const changes = {
    added: lines.filter(l => l.startsWith('A ') || l.startsWith('?? ')).length,
    modified: lines.filter(l => l.startsWith('M ') || l.startsWith(' M')).length,
    deleted: lines.filter(l => l.startsWith('D ') || l.startsWith(' D')).length,
  };

  const parts: string[] = [];
  if (changes.added > 0) parts.push(`add ${changes.added} file${changes.added > 1 ? 's' : ''}`);
  if (changes.modified > 0) parts.push(`update ${changes.modified} file${changes.modified > 1 ? 's' : ''}`);
  if (changes.deleted > 0) parts.push(`remove ${changes.deleted} file${changes.deleted > 1 ? 's' : ''}`);

  const description = parts.join(', ') || 'update';

  // 파일 타입으로 type 추측
  const allFiles = lines.map(l => l.substring(3));
  const hasTest = allFiles.some(f => f.includes('test') || f.includes('spec'));
  const hasDocs = allFiles.some(f => f.includes('.md') || f.includes('docs'));
  const hasConfig = allFiles.some(f => f.includes('config') || f.includes('.json') || f.includes('.yaml'));

  let type = 'chore';
  if (hasTest) type = 'test';
  else if (hasDocs) type = 'docs';
  else if (hasConfig) type = 'chore';
  else if (changes.added > 0 && changes.modified === 0) type = 'feat';
  else type = 'refactor';

  return `${type}: ${description}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectPath, useAI = true } = body;

    // 경로 검증 (Path Traversal 방지)
    const validation = validateProjectPath(projectPath);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid project path' },
        { status: 400 }
      );
    }

    const safePath = validation.sanitizedPath!;

    // .git 확인
    const gitPath = path.join(safePath, '.git');
    if (!fs.existsSync(gitPath)) {
      return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
    }

    const diff = await getGitDiff(safePath);
    const status = await getGitStatus(safePath);

    if (!diff && !status) {
      return NextResponse.json({
        success: false,
        message: '',
        error: 'No changes to commit',
      });
    }

    let commitMessage: string;
    let generatedBy: 'ai' | 'rule';

    if (useAI) {
      try {
        commitMessage = await generateWithOllama(diff, status);
        generatedBy = 'ai';
      } catch { /* AI 실패시 규칙 기반으로 폴백 */
        commitMessage = generateSimpleMessage(status);
        generatedBy = 'rule';
      }
    } else {
      commitMessage = generateSimpleMessage(status);
      generatedBy = 'rule';
    }

    return NextResponse.json({
      success: true,
      message: commitMessage,
      generatedBy,
      changedFiles: status.trim().split('\n').filter(Boolean).length,
    });
  } catch (error) {
    console.error('Commit message generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate commit message' },
      { status: 500 }
    );
  }
}
