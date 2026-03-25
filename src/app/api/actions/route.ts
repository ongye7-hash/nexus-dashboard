import { NextResponse } from 'next/server';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { savePortMapping as dbSavePortMapping } from '@/lib/database';
import { validateProjectPath } from '@/lib/path-validator';

const execFileAsync = promisify(execFile);

// 프로젝트의 package.json에서 포트 추출
function detectPortFromPackageJson(projectPath: string): number {
  try {
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const devScript = pkg.scripts?.dev || '';

      // -p 또는 --port 옵션에서 포트 추출
      const portMatch = devScript.match(/(?:-p|--port)\s+(\d+)/);
      if (portMatch) {
        return parseInt(portMatch[1], 10);
      }

      // PORT= 환경변수에서 추출
      const envPortMatch = devScript.match(/PORT=(\d+)/);
      if (envPortMatch) {
        return parseInt(envPortMatch[1], 10);
      }
    }
  } catch { /* package.json 읽기 실패 — 기본 포트 사용 */ }

  return 3000; // 기본 포트
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, path: requestPath } = body;

    if (!requestPath) {
      return NextResponse.json({ error: '경로가 필요합니다' }, { status: 400 });
    }

    const validation = validateProjectPath(requestPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error || '잘못된 경로' }, { status: 400 });
    }
    const safePath = validation.sanitizedPath!;

    switch (action) {
      case 'openFolder':
        // Windows 탐색기로 폴더 열기
        await execFileAsync('explorer', [safePath]);
        return NextResponse.json({ success: true, message: '폴더를 열었습니다' });

      case 'openVSCode':
        // VSCode로 열기
        await execFileAsync('code', [safePath]);
        return NextResponse.json({ success: true, message: 'VSCode를 열었습니다' });

      case 'openTerminal':
        // Windows Terminal 또는 cmd로 열기
        try {
          // Windows Terminal 시도
          await execFileAsync('wt', ['-d', safePath]);
        } catch { /* Windows Terminal 없으면 cmd로 폴백 */
          await execFileAsync('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${safePath}"`]);
        }
        return NextResponse.json({ success: true, message: '터미널을 열었습니다' });

      case 'runProject':
        // 프로젝트 실행 (새 터미널에서)
        const port = detectPortFromPackageJson(safePath);
        dbSavePortMapping(safePath, port);

        try {
          await execFileAsync('wt', ['-d', safePath, 'cmd', '/k', 'npm run dev']);
        } catch { /* Windows Terminal 없으면 cmd로 폴백 */
          await execFileAsync('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${safePath}" && npm run dev`]);
        }
        return NextResponse.json({ success: true, message: '프로젝트를 실행했습니다', port });

      default:
        return NextResponse.json({ error: '알 수 없는 액션입니다' }, { status: 400 });
    }
  } catch (error) {
    console.error('액션 실행 실패:', error);
    return NextResponse.json(
      { error: '액션 실행에 실패했습니다', details: String(error) },
      { status: 500 }
    );
  }
}
