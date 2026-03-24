import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

const OLLAMA_URL = 'http://localhost:11434';

async function getGitDiff(projectPath: string): Promise<string> {
  try {
    // staged 변경사항 먼저 확인
    const { stdout: stagedDiff } = await execAsync('git diff --cached', {
      cwd: projectPath,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5, // 5MB
    });

    if (stagedDiff.trim()) {
      return stagedDiff;
    }

    // staged가 없으면 unstaged 확인
    const { stdout: unstagedDiff } = await execAsync('git diff', {
      cwd: projectPath,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5,
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
      timeout: 10000,
    });
    return stdout;
  } catch {
    return '';
  }
}

async function generateWithOllama(diff: string, status: string): Promise<string> {
  // diff가 너무 길면 잘라내기
  const maxDiffLength = 4000;
  const truncatedDiff = diff.length > maxDiffLength
    ? diff.substring(0, maxDiffLength) + '\n\n... (diff truncated)'
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
    });

    if (!response.ok) {
      throw new Error('Ollama request failed');
    }

    const data = await response.json();
    const message = data.response?.trim() || '';

    // 커밋 메시지만 추출 (첫 번째 줄만)
    const firstLine = message.split('\n')[0].trim();
    return firstLine;
  } catch (error) {
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
    const { projectPath, useAI = true } = await request.json();

    if (!projectPath) {
      return NextResponse.json({ error: 'Project path required' }, { status: 400 });
    }

    // .git 확인
    const gitPath = path.join(projectPath, '.git');
    if (!fs.existsSync(gitPath)) {
      return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
    }

    const diff = await getGitDiff(projectPath);
    const status = await getGitStatus(projectPath);

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
      } catch {
        // AI 실패시 규칙 기반으로 폴백
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
