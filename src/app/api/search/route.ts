import { NextResponse } from 'next/server';
import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { validateProjectPath } from '@/lib/path-validator';

interface SearchResult {
  projectName: string;
  projectPath: string;
  filePath: string;
  relativePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchResponse {
  results: SearchResult[];
  totalMatches: number;
  searchTime: number;
  projectsSearched: number;
}

// 검색 제외 디렉토리
const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  'coverage',
];

// 검색 대상 확장자
const SEARCH_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.py', '.pyw',
  '.html', '.css', '.scss', '.less',
  '.json', '.yaml', '.yml',
  '.md', '.txt',
  '.sql',
  '.sh', '.bat', '.ps1',
  '.env', '.env.local',
  '.gitignore', '.dockerignore',
  'Dockerfile',
];

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const { query, projectPaths, caseSensitive = false, wholeWord = false, maxResults = 100 } = await request.json();

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: '검색어는 2자 이상이어야 합니다' }, { status: 400 });
    }

    const results: SearchResult[] = [];
    let projectsSearched = 0;

    // 프로젝트 경로들에서 검색
    for (const projectPath of projectPaths) {
      const validation = validateProjectPath(projectPath);
      if (!validation.isValid || !validation.sanitizedPath) continue;
      const validatedPath = validation.sanitizedPath;
      if (!fs.existsSync(validatedPath)) continue;
      projectsSearched++;

      const projectName = path.basename(projectPath);

      try {
        // ripgrep 또는 findstr 사용
        let searchOutput: string;

        try {
          // ripgrep 시도 (더 빠름)
          const rgArgs = [
            '-n', // 줄 번호
            '--no-heading',
            '-H', // 파일명 표시
            ...(caseSensitive ? [] : ['-i']),
            ...(wholeWord ? ['-w'] : []),
            '--max-count=20', // 파일당 최대 20개
            ...EXCLUDED_DIRS.map(d => `--glob=!${d}`),
            query,
            validatedPath,
          ];

          searchOutput = execFileSync('rg', rgArgs,
            { encoding: 'utf-8', timeout: 10000, maxBuffer: 5 * 1024 * 1024, windowsHide: true }
          );
        } catch { /* ripgrep 없으면 findstr로 폴백 */
          const findstrArgs = [
            ...(caseSensitive ? ['/N'] : ['/N', '/I']),
            '/S', '/P',
            query,
            `${validatedPath}\\*.*`,
          ];
          try {
            searchOutput = execFileSync('findstr', findstrArgs,
              { encoding: 'utf-8', timeout: 15000, maxBuffer: 5 * 1024 * 1024, windowsHide: true }
            );
          } catch { /* 검색 결과 없음 또는 에러 */
            continue;
          }
        }

        // 결과 파싱
        const lines = searchOutput.split('\n').filter(Boolean);

        for (const line of lines) {
          if (results.length >= maxResults) break;

          // ripgrep 형식: file:line:content
          // findstr 형식: file:line:content
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (match) {
            const [, filePath, lineNum, content] = match;
            const relativePath = path.relative(projectPath, filePath);

            // 제외 디렉토리 체크
            if (EXCLUDED_DIRS.some(d => relativePath.includes(d))) continue;

            // 확장자 체크
            const ext = path.extname(filePath).toLowerCase();
            const fileName = path.basename(filePath);
            if (!SEARCH_EXTENSIONS.includes(ext) && !SEARCH_EXTENSIONS.includes(fileName)) continue;

            // 매치 위치 찾기
            const searchLower = caseSensitive ? query : query.toLowerCase();
            const contentLower = caseSensitive ? content : content.toLowerCase();
            const matchStart = contentLower.indexOf(searchLower);

            results.push({
              projectName,
              projectPath,
              filePath,
              relativePath,
              lineNumber: parseInt(lineNum, 10),
              lineContent: content.trim().slice(0, 200), // 최대 200자
              matchStart: matchStart >= 0 ? matchStart : 0,
              matchEnd: matchStart >= 0 ? matchStart + query.length : query.length,
            });
          }
        }
      } catch (error) {
        // 개별 프로젝트 검색 실패는 무시
        console.error(`검색 실패 (${projectName}):`, error);
      }

      if (results.length >= maxResults) break;
    }

    const searchTime = Date.now() - startTime;

    const response: SearchResponse = {
      results,
      totalMatches: results.length,
      searchTime,
      projectsSearched,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('검색 API 오류:', error);
    return NextResponse.json(
      { error: '검색 중 오류가 발생했습니다', details: String(error) },
      { status: 500 }
    );
  }
}
