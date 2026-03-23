import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, path } = body;

    if (!path) {
      return NextResponse.json({ error: '경로가 필요합니다' }, { status: 400 });
    }

    switch (action) {
      case 'openFolder':
        // Windows 탐색기로 폴더 열기
        await execAsync(`explorer "${path}"`);
        return NextResponse.json({ success: true, message: '폴더를 열었습니다' });

      case 'openVSCode':
        // VSCode로 열기
        await execAsync(`code "${path}"`);
        return NextResponse.json({ success: true, message: 'VSCode를 열었습니다' });

      case 'openTerminal':
        // Windows Terminal 또는 cmd로 열기
        try {
          // Windows Terminal 시도
          await execAsync(`wt -d "${path}"`);
        } catch {
          // 실패하면 cmd로 열기
          await execAsync(`start cmd /k "cd /d ${path}"`);
        }
        return NextResponse.json({ success: true, message: '터미널을 열었습니다' });

      case 'runProject':
        // 프로젝트 실행 (새 터미널에서)
        try {
          await execAsync(`wt -d "${path}" cmd /k "npm run dev"`);
        } catch {
          await execAsync(`start cmd /k "cd /d ${path} && npm run dev"`);
        }
        return NextResponse.json({ success: true, message: '프로젝트를 실행했습니다' });

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
