import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const PROGRESS_PATH = path.join(process.cwd(), 'docs', 'progress.md');

export async function GET() {
  try {
    if (!fs.existsSync(PROGRESS_PATH)) {
      return NextResponse.json({ exists: false, content: '' });
    }
    const content = fs.readFileSync(PROGRESS_PATH, 'utf-8');
    return NextResponse.json({ exists: true, content });
  } catch (error) {
    console.warn('progress.md 읽기 실패:', error);
    return NextResponse.json({ exists: false, content: '' });
  }
}

export async function POST(request: Request) {
  try {
    const { action } = await request.json();

    if (action === 'create') {
      const dir = path.dirname(PROGRESS_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const template = `# 현재 진행 상태\n\n## 마지막 작업\n- \n\n## 현재 상태\n- \n\n## 다음 할 일\n- \n`;
      fs.writeFileSync(PROGRESS_PATH, template, 'utf-8');
      return NextResponse.json({ success: true, content: template });
    }

    return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 });
  } catch (error) {
    console.warn('progress.md 생성 실패:', error);
    return NextResponse.json({ error: '파일 생성 실패' }, { status: 500 });
  }
}
