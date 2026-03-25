import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSetting, setSetting } from '@/lib/database';
import { encrypt, decrypt } from '@/lib/crypto';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// Claude API 호출
async function callClaude(
  prompt: string,
  system: string,
  apiKey: string,
  model: string = DEFAULT_MODEL
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error: ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// API 키 가져오기
function getApiKey(): string | null {
  const encrypted = getSetting('claude_api_key');
  if (!encrypted) return null;
  try {
    return decrypt(encrypted);
  } catch {
    return null;
  }
}

// 프로젝트 코드 읽기 (주요 파일만)
function readProjectCode(projectPath: string): string {
  const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];
  const ignoreDirs = ['node_modules', '.git', '.next', 'dist', 'build', '.vercel'];
  let content = '';
  let fileCount = 0;
  const maxFiles = 15;
  const maxChars = 12000;

  function walkDir(dir: string) {
    if (fileCount >= maxFiles || content.length >= maxChars) return;

    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (fileCount >= maxFiles || content.length >= maxChars) break;
        if (ignoreDirs.includes(item)) continue;

        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (codeExtensions.includes(ext)) {
            const fileContent = fs.readFileSync(fullPath, 'utf-8');
            const relativePath = path.relative(projectPath, fullPath);
            content += `\n--- ${relativePath} ---\n`;
            content += fileContent.slice(0, 2000);
            if (fileContent.length > 2000) content += '\n... (truncated)';
            content += '\n';
            fileCount++;
          }
        }
      }
    } catch {
      // ignore errors
    }
  }

  walkDir(projectPath);
  return content.slice(0, maxChars);
}

// 프로젝트 분석 (package.json 등)
function analyzeProject(projectPath: string): Record<string, unknown> {
  const info: Record<string, unknown> = { path: projectPath };

  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      info.name = pkg.name;
      info.description = pkg.description;
      info.dependencies = Object.keys(pkg.dependencies || {});
      info.devDependencies = Object.keys(pkg.devDependencies || {});
      info.scripts = Object.keys(pkg.scripts || {});
    } catch {
      // ignore
    }
  }

  info.hasReadme = fs.existsSync(path.join(projectPath, 'README.md'));
  return info;
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  switch (action) {
    case 'status': {
      const apiKey = getApiKey();
      return NextResponse.json({
        online: !!apiKey,
        provider: 'claude',
        models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
        defaultModel: DEFAULT_MODEL,
      });
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, projectPath, model } = body;

    // API 키 저장/삭제 액션
    if (action === 'saveApiKey') {
      const { apiKey } = body;
      if (!apiKey) return NextResponse.json({ error: 'API 키가 필요합니다' }, { status: 400 });

      // Claude API로 키 유효성 검증
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        });
        if (!res.ok) {
          return NextResponse.json({ error: '유효하지 않은 API 키입니다' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Claude API에 연결할 수 없습니다' }, { status: 503 });
      }

      setSetting('claude_api_key', encrypt(apiKey));
      return NextResponse.json({ success: true });
    }

    if (action === 'deleteApiKey') {
      const { deleteSetting } = await import('@/lib/database');
      deleteSetting('claude_api_key');
      return NextResponse.json({ success: true });
    }

    // AI 기능 실행
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Claude API 키가 설정되지 않았습니다. 설정에서 API 키를 입력하세요.' },
        { status: 401 }
      );
    }

    const selectedModel = model || DEFAULT_MODEL;

    switch (action) {
      case 'summarize': {
        const code = readProjectCode(projectPath);
        const projectInfo = analyzeProject(projectPath);

        const prompt = `이 프로젝트를 분석해주세요:

프로젝트 정보:
${JSON.stringify(projectInfo, null, 2)}

코드 샘플:
${code}

다음을 한국어로 작성해주세요:
1. 프로젝트 요약 (2-3 문장)
2. 주요 기능
3. 사용된 기술 스택
4. 프로젝트 구조 특징`;

        const summary = await callClaude(prompt,
          '당신은 코드 분석 전문가입니다. 항상 한국어로 응답하세요. 간결하고 실용적으로 답하세요.',
          apiKey, selectedModel);

        return NextResponse.json({ success: true, summary });
      }

      case 'generateReadme': {
        const code = readProjectCode(projectPath);
        const projectInfo = analyzeProject(projectPath);
        const projectName = path.basename(projectPath);

        const prompt = `이 프로젝트의 README.md를 한국어로 생성해주세요:

프로젝트 이름: ${projectName}
프로젝트 정보:
${JSON.stringify(projectInfo, null, 2)}

코드 샘플:
${code}

다음 섹션을 포함한 마크다운을 생성하세요:
1. # 프로젝트 이름
2. ## 소개
3. ## 주요 기능
4. ## 기술 스택
5. ## 설치 방법
6. ## 사용법
7. ## 프로젝트 구조`;

        const readme = await callClaude(prompt,
          '당신은 기술 문서 작가입니다. 깔끔하고 전문적인 README를 한국어로 작성하세요. 마크다운 문법을 올바르게 사용하세요.',
          apiKey, selectedModel);

        return NextResponse.json({ success: true, readme });
      }

      case 'explainCode': {
        const { filePath, lineStart, lineEnd } = body;
        if (!filePath || !fs.existsSync(filePath)) {
          return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.split('\n');
        const codeSlice = lines.slice(lineStart - 1, lineEnd || lineStart + 20).join('\n');

        const prompt = `이 코드를 한국어로 설명해주세요:

파일: ${path.basename(filePath)}
\`\`\`
${codeSlice}
\`\`\`

설명:
1. 이 코드가 하는 일
2. 주요 로직 설명
3. 개선 가능한 점 (있다면)`;

        const explanation = await callClaude(prompt,
          '당신은 코드 교사입니다. 코드를 명확하게 한국어로 설명하세요. 간결하고 교육적으로.',
          apiKey, selectedModel);

        return NextResponse.json({ success: true, explanation });
      }

      case 'suggestImprovements': {
        const code = readProjectCode(projectPath);
        const projectInfo = analyzeProject(projectPath);

        const prompt = `이 프로젝트를 리뷰하고 개선점을 한국어로 제안해주세요:

프로젝트 정보:
${JSON.stringify(projectInfo, null, 2)}

코드 샘플:
${code}

제안사항:
1. 코드 품질 개선점 (3-5개)
2. 구조적 개선 제안
3. 성능 최적화 팁
4. 보안 고려사항

구체적이고 실용적으로 작성하세요.`;

        const suggestions = await callClaude(prompt,
          '당신은 시니어 코드 리뷰어입니다. 건설적인 피드백을 한국어로 제공하세요. 구체적이고 도움이 되게.',
          apiKey, selectedModel);

        return NextResponse.json({ success: true, suggestions });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('AI API error:', error);
    return NextResponse.json(
      { error: 'AI 작업 실패', details: String(error) },
      { status: 500 }
    );
  }
}
