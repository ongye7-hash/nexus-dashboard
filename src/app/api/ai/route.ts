import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

// Ollama 서버 상태 확인
async function checkOllamaStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 사용 가능한 모델 목록
async function getAvailableModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await res.json();
    return data.models?.map((m: { name: string }) => m.name) || [];
  } catch {
    return [];
  }
}

// Ollama에 프롬프트 전송
async function generateCompletion(
  prompt: string,
  model: string = DEFAULT_MODEL,
  system?: string
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      system,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 2048,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama API error: ${res.status}`);
  }

  const data: OllamaResponse = await res.json();
  return data.response;
}

// 프로젝트 코드 읽기 (주요 파일만)
function readProjectCode(projectPath: string): string {
  const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];
  const ignoreDirs = ['node_modules', '.git', '.next', 'dist', 'build', '.vercel'];
  let content = '';
  let fileCount = 0;
  const maxFiles = 10;
  const maxChars = 8000;

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
            content += fileContent.slice(0, 1500);
            if (fileContent.length > 1500) content += '\n... (truncated)';
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

  // package.json 읽기
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

  // README 존재 여부
  info.hasReadme = fs.existsSync(path.join(projectPath, 'README.md'));

  return info;
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  switch (action) {
    case 'status':
      const isOnline = await checkOllamaStatus();
      const models = isOnline ? await getAvailableModels() : [];
      return NextResponse.json({
        online: isOnline,
        models,
        defaultModel: DEFAULT_MODEL,
      });

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, projectPath, model = DEFAULT_MODEL } = body;

    // Ollama 상태 확인
    const isOnline = await checkOllamaStatus();
    if (!isOnline) {
      return NextResponse.json(
        { error: 'Ollama is not running. Start it with: ollama serve' },
        { status: 503 }
      );
    }

    switch (action) {
      case 'summarize': {
        const code = readProjectCode(projectPath);
        const projectInfo = analyzeProject(projectPath);

        const prompt = `Analyze this project and provide a brief summary in Korean:

Project Info:
${JSON.stringify(projectInfo, null, 2)}

Code samples:
${code}

Provide:
1. 프로젝트 요약 (2-3 문장)
2. 주요 기능
3. 사용된 기술 스택
4. 프로젝트 구조 특징`;

        const summary = await generateCompletion(prompt, model,
          'You are a helpful code analyst. Always respond in Korean. Be concise and practical.');

        return NextResponse.json({ success: true, summary });
      }

      case 'generateReadme': {
        const code = readProjectCode(projectPath);
        const projectInfo = analyzeProject(projectPath);
        const projectName = path.basename(projectPath);

        const prompt = `Generate a README.md file in Korean for this project:

Project Name: ${projectName}
Project Info:
${JSON.stringify(projectInfo, null, 2)}

Code samples:
${code}

Generate a professional README.md with these sections:
1. # 프로젝트 이름
2. ## 소개
3. ## 주요 기능
4. ## 기술 스택
5. ## 설치 방법
6. ## 사용법
7. ## 프로젝트 구조

Use markdown formatting. Be practical and helpful.`;

        const readme = await generateCompletion(prompt, model,
          'You are a technical writer. Generate clean, professional README files in Korean. Use proper markdown syntax.');

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

        const prompt = `Explain this code in Korean:

File: ${path.basename(filePath)}
\`\`\`
${codeSlice}
\`\`\`

Explain:
1. 이 코드가 하는 일
2. 주요 로직 설명
3. 개선 가능한 점 (있다면)`;

        const explanation = await generateCompletion(prompt, model,
          'You are a code teacher. Explain code clearly in Korean. Be concise and educational.');

        return NextResponse.json({ success: true, explanation });
      }

      case 'suggestImprovements': {
        const code = readProjectCode(projectPath);
        const projectInfo = analyzeProject(projectPath);

        const prompt = `Review this project and suggest improvements in Korean:

Project Info:
${JSON.stringify(projectInfo, null, 2)}

Code samples:
${code}

Provide:
1. 코드 품질 개선점 (3-5개)
2. 구조적 개선 제안
3. 성능 최적화 팁
4. 보안 고려사항

Be practical and specific.`;

        const suggestions = await generateCompletion(prompt, model,
          'You are a senior code reviewer. Provide constructive feedback in Korean. Be specific and helpful.');

        return NextResponse.json({ success: true, suggestions });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('AI API error:', error);
    return NextResponse.json(
      { error: 'AI operation failed', details: String(error) },
      { status: 500 }
    );
  }
}
