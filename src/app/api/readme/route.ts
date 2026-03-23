import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const README_NAMES = [
  'README.md',
  'readme.md',
  'Readme.md',
  'README.MD',
  'README',
  'readme',
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get('path');

    if (!projectPath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({ error: 'Path does not exist' }, { status: 404 });
    }

    // Find README file
    let readmePath: string | null = null;
    let readmeName: string | null = null;

    for (const name of README_NAMES) {
      const fullPath = path.join(projectPath, name);
      if (fs.existsSync(fullPath)) {
        readmePath = fullPath;
        readmeName = name;
        break;
      }
    }

    if (!readmePath || !readmeName) {
      return NextResponse.json({
        exists: false,
        content: null,
        filename: null,
      });
    }

    const content = fs.readFileSync(readmePath, 'utf-8');

    return NextResponse.json({
      exists: true,
      content,
      filename: readmeName,
    });
  } catch (error) {
    console.error('Failed to read README:', error);
    return NextResponse.json({ error: 'Failed to read README' }, { status: 500 });
  }
}
