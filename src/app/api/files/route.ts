import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { validateProjectPath } from '@/lib/path-validator';

const IGNORED_FOLDERS = [
  'node_modules',
  '.next',
  '.git',
  '.vercel',
  '__pycache__',
  '.vscode',
  'dist',
  'build',
  '.cache',
  '.turbo',
];

const IGNORED_FILES = [
  '.DS_Store',
  'desktop.ini',
  '.gitignore',
  '.eslintcache',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  size?: number;
  extension?: string;
}

function getFileTree(dirPath: string, maxDepth = 3, currentDepth = 0): FileNode[] {
  if (currentDepth >= maxDepth) return [];

  try {
    const items = fs.readdirSync(dirPath);
    const nodes: FileNode[] = [];

    for (const item of items) {
      if (item.startsWith('.') && currentDepth > 0) continue;
      if (IGNORED_FOLDERS.includes(item)) continue;
      if (IGNORED_FILES.includes(item)) continue;

      const fullPath = path.join(dirPath, item);

      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          const children = getFileTree(fullPath, maxDepth, currentDepth + 1);
          nodes.push({
            name: item,
            type: 'folder',
            path: fullPath,
            children,
          });
        } else {
          const ext = path.extname(item).toLowerCase();
          nodes.push({
            name: item,
            type: 'file',
            path: fullPath,
            size: stat.size,
            extension: ext,
          });
        }
      } catch { /* 개별 파일 stat 실패 — 건너뜀 */ }
    }

    // Sort: folders first, then files, both alphabetically
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return nodes;
  } catch (error) {
    console.warn('파일 트리 읽기 실패:', error);
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get('path');

    if (!projectPath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const validation = validateProjectPath(projectPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const tree = getFileTree(validation.sanitizedPath!);

    return NextResponse.json({ tree });
  } catch (error) {
    console.error('Failed to get file tree:', error);
    return NextResponse.json({ error: 'Failed to get file tree' }, { status: 500 });
  }
}
