import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSetting, setSetting, deleteSetting } from '@/lib/database';
import { encrypt, decrypt } from '@/lib/crypto';
import { validateProjectPath } from '@/lib/path-validator';

const DEFAULT_MODEL = 'claude-opus-4-6';

// 모델 정보 (한글 라벨 + 비용)
const MODEL_INFO: Record<string, { label: string; cost: string; speed: string }> = {
  'claude-opus-4-6': { label: 'Opus 4.6 (최고 성능)', cost: '$$$$', speed: '느림' },
  'claude-sonnet-4-6': { label: 'Sonnet 4.6 (균형)', cost: '$$', speed: '보통' },
  'claude-haiku-4-5-20251001': { label: 'Haiku 4.5 (빠름)', cost: '$', speed: '빠름' },
};

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
    const msg = err.error?.message || `API 응답 오류 (${res.status})`;
    if (res.status === 401) throw new Error('API 키가 유효하지 않습니다. 설정에서 확인하세요.');
    if (res.status === 429) throw new Error('요청 한도 초과. 잠시 후 다시 시도하세요.');
    if (res.status === 529) throw new Error('Claude 서버가 과부하 상태입니다. 잠시 후 다시 시도하세요.');
    throw new Error(msg);
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
  } catch { /* 복호화 실패 — API 키 무효 */
    return null;
  }
}

// ============ 프로젝트 코드 읽기 (개선됨) ============

// 중요도 기반 파일 우선순위
const FILE_PRIORITY: Record<string, number> = {
  'package.json': 100,
  'tsconfig.json': 90,
  'next.config.ts': 90,
  'next.config.js': 90,
  'vite.config.ts': 90,
  'tailwind.config.ts': 80,
  'tailwind.config.js': 80,
  '.env.example': 70,
  'docker-compose.yml': 70,
  'Dockerfile': 70,
  'requirements.txt': 85,
  'pyproject.toml': 85,
  'Cargo.toml': 85,
  'go.mod': 85,
};

// 확장자별 우선순위
const EXT_PRIORITY: Record<string, number> = {
  '.ts': 60, '.tsx': 65, '.js': 55, '.jsx': 60,
  '.py': 60, '.go': 60, '.rs': 60, '.java': 55,
  '.css': 30, '.scss': 30,
  '.sql': 40, '.prisma': 50,
  '.md': 20, '.json': 25, '.yml': 25, '.yaml': 25,
  '.html': 35, '.vue': 60, '.svelte': 60,
};

const CODE_EXTENSIONS = Object.keys(EXT_PRIORITY);
const IGNORE_DIRS = ['node_modules', '.git', '.next', 'dist', 'build', '.vercel', '__pycache__', '.venv', 'venv', '.nexus-data'];

interface FileEntry {
  path: string;
  relativePath: string;
  priority: number;
  size: number;
}

function collectFiles(projectPath: string): FileEntry[] {
  const files: FileEntry[] = [];

  function walkDir(dir: string, depth: number) {
    if (depth > 4) return; // 최대 4단계 깊이

    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (IGNORE_DIRS.includes(item) || item.startsWith('.')) continue;

        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath, depth + 1);
        } else if (stat.isFile()) {
          const relativePath = path.relative(projectPath, fullPath);
          const ext = path.extname(item).toLowerCase();
          const baseName = path.basename(item);

          // 우선순위 계산
          let priority = FILE_PRIORITY[baseName] || EXT_PRIORITY[ext] || 0;
          if (priority === 0) continue; // 우선순위 없는 파일은 스킵

          // src/ 폴더 내 파일은 우선순위 +10
          if (relativePath.startsWith('src')) priority += 10;
          // page/route/layout/index 파일은 +15
          if (/^(page|route|layout|index|main|app)\./i.test(baseName)) priority += 15;

          files.push({ path: fullPath, relativePath, priority, size: stat.size });
        }
      }
    } catch { /* 개별 파일/디렉토리 접근 실패 — 건너뜀 */
    }
  }

  walkDir(projectPath, 0);

  // 우선순위 높은 순으로 정렬
  return files.sort((a, b) => b.priority - a.priority);
}

function readProjectCode(projectPath: string): string {
  const files = collectFiles(projectPath);
  const maxFiles = 25;
  const maxChars = 30000; // Opus 4.6은 200K 토큰 처리 가능
  let content = '';
  let fileCount = 0;

  for (const file of files) {
    if (fileCount >= maxFiles || content.length >= maxChars) break;

    try {
      const fileContent = fs.readFileSync(file.path, 'utf-8');
      const maxPerFile = Math.min(3000, maxChars - content.length);
      content += `\n--- ${file.relativePath} ---\n`;
      content += fileContent.slice(0, maxPerFile);
      if (fileContent.length > maxPerFile) content += '\n... (truncated)';
      content += '\n';
      fileCount++;
    } catch { /* 개별 파일 읽기 실패 — 건너뜀 */
    }
  }

  return content;
}

// 프로젝트 분석 (package.json 등)
function analyzeProject(projectPath: string): Record<string, unknown> {
  const info: Record<string, unknown> = { path: projectPath, name: path.basename(projectPath) };

  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      info.name = pkg.name || path.basename(projectPath);
      info.description = pkg.description;
      info.dependencies = Object.keys(pkg.dependencies || {});
      info.devDependencies = Object.keys(pkg.devDependencies || {});
      info.scripts = Object.keys(pkg.scripts || {});
    } catch { /* package.json 파싱 실패 — 무시 */ }
  }

  // README 내용 (있으면 처음 500자)
  const readmePath = path.join(projectPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    try {
      info.readme = fs.readFileSync(readmePath, 'utf-8').slice(0, 500);
    } catch { /* README 읽기 실패 — 무시 */ }
  }

  // 파일 구조 요약
  const files = collectFiles(projectPath);
  info.fileStructure = files.slice(0, 30).map(f => f.relativePath);
  info.totalFiles = files.length;

  return info;
}

// ============ 결과 캐시 ============

const resultCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5분

function getCached(key: string): string | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    resultCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: string): void {
  resultCache.set(key, { result, timestamp: Date.now() });
  // 오래된 캐시 정리 (최대 50개)
  if (resultCache.size > 50) {
    const oldest = [...resultCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 10; i++) resultCache.delete(oldest[i][0]);
  }
}

// ============ API 라우트 ============

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  switch (action) {
    case 'status': {
      const apiKey = getApiKey();
      return NextResponse.json({
        online: !!apiKey,
        provider: 'claude',
        models: Object.entries(MODEL_INFO).map(([id, info]) => ({ id, ...info })),
        defaultModel: DEFAULT_MODEL,
      });
    }

    case 'n8nStatus': {
      const n8nKey = getSetting('n8n_api_key');
      const n8nUrl = getSetting('n8n_url') || 'https://n8n.ongye.org';
      return NextResponse.json({ online: !!n8nKey, url: n8nUrl });
    }

    case 'trendsStatus': {
      const trendsKey = getSetting('trends_api_key');
      return NextResponse.json({ online: !!trendsKey });
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, projectPath, model, noCache } = body;

    // API 키 저장
    if (action === 'saveApiKey') {
      const { apiKey } = body;
      if (!apiKey) return NextResponse.json({ error: 'API 키가 필요합니다' }, { status: 400 });

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
      } catch (error) {
        console.warn('Claude API 연결 실패:', error);
        return NextResponse.json({ error: 'Claude API에 연결할 수 없습니다' }, { status: 503 });
      }

      setSetting('claude_api_key', encrypt(apiKey));
      return NextResponse.json({ success: true });
    }

    if (action === 'deleteApiKey') {
      deleteSetting('claude_api_key');
      return NextResponse.json({ success: true });
    }

    // n8n API Key 저장
    if (action === 'saveN8nKey') {
      const { n8nApiKey, n8nUrl } = body;
      if (!n8nApiKey) return NextResponse.json({ error: 'n8n API Key가 필요합니다' }, { status: 400 });
      setSetting('n8n_api_key', encrypt(n8nApiKey.trim()));
      if (n8nUrl) setSetting('n8n_url', n8nUrl.trim());
      return NextResponse.json({ success: true });
    }

    if (action === 'deleteN8nKey') {
      deleteSetting('n8n_api_key');
      return NextResponse.json({ success: true });
    }

    // Trends API Key 저장
    if (action === 'saveTrendsKey') {
      const { trendsApiKey } = body;
      if (!trendsApiKey) return NextResponse.json({ error: 'Trends API Key가 필요합니다' }, { status: 400 });
      setSetting('trends_api_key', encrypt(trendsApiKey.trim()));
      return NextResponse.json({ success: true });
    }

    if (action === 'deleteTrendsKey') {
      deleteSetting('trends_api_key');
      return NextResponse.json({ success: true });
    }

    // 리뷰 결과를 파일로 저장 (Claude Code 적용용)
    if (action === 'saveReview') {
      const { content, projectName } = body;
      if (!content) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 });

      const reviewDir = path.join(process.cwd(), '.nexus-data', 'reviews');
      if (!fs.existsSync(reviewDir)) fs.mkdirSync(reviewDir, { recursive: true });

      const safeName = (projectName || 'unknown').replace(/[^a-zA-Z0-9가-힣_-]/g, '_').slice(0, 50);
      const fileName = `review-${safeName}-${Date.now()}.md`;
      const filePath = path.join(reviewDir, fileName);
      fs.writeFileSync(filePath, content, 'utf-8');

      return NextResponse.json({ success: true, filePath, fileName });
    }

    // README 프로젝트에 저장
    if (action === 'saveReadme') {
      const { content } = body;
      if (!content || !projectPath) return NextResponse.json({ error: '내용과 경로가 필요합니다' }, { status: 400 });

      const validation = validateProjectPath(projectPath);
      if (!validation.isValid) {
        return NextResponse.json({ error: validation.error || '잘못된 경로' }, { status: 403 });
      }
      const readmePath = path.join(validation.sanitizedPath!, 'README.md');
      fs.writeFileSync(readmePath, content, 'utf-8');
      return NextResponse.json({ success: true, path: readmePath });
    }

    // AI 기능 실행
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Claude API 키가 설정되지 않았습니다. AI 어시스턴트에서 API 키를 입력하세요.' },
        { status: 401 }
      );
    }

    const selectedModel = model || DEFAULT_MODEL;

    // AI 기능 실행 전 공통 projectPath 검증
    if (['summarize', 'generateReadme', 'suggestImprovements', 'explainCode'].includes(action)) {
      if (!projectPath) {
        return NextResponse.json({ error: '프로젝트 경로가 필요합니다' }, { status: 400 });
      }
      const pathCheck = validateProjectPath(projectPath);
      if (!pathCheck.isValid) {
        return NextResponse.json({ error: `잘못된 프로젝트 경로: ${pathCheck.error}` }, { status: 400 });
      }
    }

    switch (action) {
      case 'summarize': {
        const cacheKey = `summarize:${projectPath}:${selectedModel}`;
        if (!noCache) {
          const cached = getCached(cacheKey);
          if (cached) return NextResponse.json({ success: true, summary: cached, cached: true });
        }

        const code = readProjectCode(projectPath);
        const projectInfo = analyzeProject(projectPath);

        const prompt = `이 프로젝트를 분석해주세요:

프로젝트 정보:
${JSON.stringify(projectInfo, null, 2)}

코드 샘플:
${code}

다음을 한국어로 작성해주세요:
1. **프로젝트 요약** (2-3 문장으로 이 프로젝트가 뭔지)
2. **주요 기능** (핵심 기능 목록)
3. **기술 스택** (사용된 라이브러리/프레임워크)
4. **프로젝트 구조** (디렉토리 구조와 아키텍처 특징)
5. **주목할 점** (잘 만든 부분이나 특이한 점)`;

        const summary = await callClaude(prompt,
          '당신은 시니어 개발자입니다. 프로젝트를 분석하고 핵심을 정확히 파악해주세요. 항상 한국어로 응답하세요. 마크다운으로 깔끔하게 작성하세요.',
          apiKey, selectedModel);

        setCache(cacheKey, summary);
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

다음 섹션을 포함한 전문적인 마크다운을 생성하세요:
1. # ${projectName}
2. ## 소개 (프로젝트 설명)
3. ## 주요 기능 (기능 목록)
4. ## 기술 스택 (사용된 기술)
5. ## 시작하기 (설치 및 실행 방법)
6. ## 사용법 (기본 사용법)
7. ## 프로젝트 구조 (디렉토리 트리)

실용적이고 실제로 사용할 수 있는 README를 작성하세요.`;

        const readme = await callClaude(prompt,
          '당신은 기술 문서 작가입니다. 깔끔하고 전문적인 README를 한국어로 작성하세요. 마크다운 문법을 올바르게 사용하세요. 코드 블록, 테이블 등을 활용하세요.',
          apiKey, selectedModel);

        return NextResponse.json({ success: true, readme });
      }

      case 'explainCode': {
        const { filePath, lineStart, lineEnd } = body;
        if (!filePath || !projectPath) {
          return NextResponse.json({ error: '파일 경로와 프로젝트 경로가 필요합니다' }, { status: 400 });
        }
        // filePath가 projectPath 하위인지 검증
        const resolvedFile = path.resolve(filePath);
        const resolvedProject = path.resolve(projectPath);
        if (!resolvedFile.toLowerCase().startsWith(resolvedProject.toLowerCase())) {
          return NextResponse.json({ error: '프로젝트 외부 파일에 접근할 수 없습니다' }, { status: 403 });
        }
        if (!fs.existsSync(resolvedFile)) {
          return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 });
        }

        const fileContent = fs.readFileSync(resolvedFile, 'utf-8');
        const lines = fileContent.split('\n');
        const codeSlice = lines.slice(lineStart - 1, lineEnd || lineStart + 20).join('\n');

        const prompt = `이 코드를 한국어로 설명해주세요:

파일: ${path.basename(filePath)}
\`\`\`
${codeSlice}
\`\`\`

다음을 포함해서 설명하세요:
1. **이 코드가 하는 일** (한 문장 요약)
2. **상세 로직** (단계별 설명)
3. **개선 가능한 점** (있다면)`;

        const explanation = await callClaude(prompt,
          '당신은 코드 교사입니다. 코드를 명확하게 한국어로 설명하세요.',
          apiKey, selectedModel);

        return NextResponse.json({ success: true, explanation });
      }

      case 'suggestImprovements': {
        const cacheKey = `improve:${projectPath}:${selectedModel}`;
        if (!noCache) {
          const cached = getCached(cacheKey);
          if (cached) return NextResponse.json({ success: true, suggestions: cached, cached: true });
        }

        const code = readProjectCode(projectPath);
        const projectInfo = analyzeProject(projectPath);

        const prompt = `이 프로젝트를 리뷰하고 개선점을 제안해주세요:

프로젝트 정보:
${JSON.stringify(projectInfo, null, 2)}

코드 샘플:
${code}

다음 관점에서 구체적으로 분석하세요:

## 1. 코드 품질
- 버그 가능성이 있는 코드
- 타입 안정성 문제
- 에러 핸들링 누락

## 2. 구조적 개선
- 컴포넌트/모듈 분리가 필요한 곳
- 중복 코드
- 관심사 분리 위반

## 3. 성능
- 불필요한 리렌더링
- N+1 쿼리 패턴
- 메모리 누수 가능성

## 4. 보안
- 입력 검증 누락
- 인젝션 위험
- 민감 정보 노출

각 항목에 **파일명:줄번호**를 포함해서 구체적으로 지적하세요.
수정 방법도 코드 예시와 함께 제안하세요.`;

        const suggestions = await callClaude(prompt,
          '당신은 시니어 코드 리뷰어입니다. 실제로 적용 가능한 구체적인 피드백을 한국어로 제공하세요. 파일명과 줄번호를 명시하세요. 코드 수정 예시를 포함하세요.',
          apiKey, selectedModel);

        setCache(cacheKey, suggestions);
        return NextResponse.json({ success: true, suggestions });
      }

      default:
        return NextResponse.json({ error: '알 수 없는 액션입니다' }, { status: 400 });
    }
  } catch (error) {
    console.error('AI API error:', error);
    const message = error instanceof Error ? error.message : 'AI 작업에 실패했습니다';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
