import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/database';
import fs from 'fs';
import path from 'path';

const DEFAULT_PATHS = ['C:\\Users\\user\\Desktop'];

function getConfiguredPaths(): string[] {
  const raw = getSetting('scan_paths');
  if (!raw) return DEFAULT_PATHS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PATHS;
  } catch { /* 파싱 실패 — 기본값 */
    return DEFAULT_PATHS;
  }
}

function validatePaths(paths: string[]): { path: string; exists: boolean }[] {
  return paths.map(p => {
    try {
      return { path: p, exists: fs.existsSync(p) && fs.statSync(p).isDirectory() };
    } catch { /* 경로 검증 실패 */
      return { path: p, exists: false };
    }
  });
}

export async function GET() {
  const paths = getConfiguredPaths();
  const validated = validatePaths(paths);
  return NextResponse.json({ paths, validated });
}

export async function POST(request: Request) {
  try {
    const { action, path: inputPath } = await request.json();
    let paths = getConfiguredPaths();

    switch (action) {
      case 'add': {
        if (!inputPath || typeof inputPath !== 'string') {
          return NextResponse.json({ error: '경로가 필요합니다' }, { status: 400 });
        }
        const resolved = path.resolve(inputPath);

        // Path traversal 방지: .. 포함 여부 확인
        if (inputPath.includes('..')) {
          return NextResponse.json({ error: '잘못된 경로입니다' }, { status: 400 });
        }

        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
          return NextResponse.json({ error: '존재하지 않는 경로이거나 폴더가 아닙니다' }, { status: 400 });
        }
        if (paths.includes(resolved)) {
          return NextResponse.json({ error: '이미 등록된 경로입니다' }, { status: 400 });
        }
        paths.push(resolved);
        setSetting('scan_paths', JSON.stringify(paths));
        const validated = validatePaths(paths);
        return NextResponse.json({ paths, validated });
      }
      case 'remove': {
        if (!inputPath) {
          return NextResponse.json({ error: '경로가 필요합니다' }, { status: 400 });
        }
        paths = paths.filter(p => p !== inputPath);
        if (paths.length === 0) paths = DEFAULT_PATHS; // 최소 하나의 경로 유지
        setSetting('scan_paths', JSON.stringify(paths));
        const validated = validatePaths(paths);
        return NextResponse.json({ paths, validated });
      }
      case 'reset': {
        setSetting('scan_paths', JSON.stringify(DEFAULT_PATHS));
        const validated = validatePaths(DEFAULT_PATHS);
        return NextResponse.json({ paths: DEFAULT_PATHS, validated });
      }
      default:
        return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 });
    }
  } catch (error) {
    console.warn('Scan paths API error:', error);
    return NextResponse.json({ error: '경로 설정 실패' }, { status: 500 });
  }
}
