import path from 'path';
import fs from 'fs';

// 허용된 기본 디렉토리 (Desktop 하위만 허용)
const ALLOWED_BASE_DIR = process.env.PROJECTS_BASE_DIR || 'C:\\Users\\user\\Desktop';

export interface PathValidationResult {
  isValid: boolean;
  sanitizedPath?: string;
  error?: string;
}

/**
 * 프로젝트 경로 검증
 * - Path Traversal 공격 방지
 * - 허용된 디렉토리 내부만 접근 가능
 */
export function validateProjectPath(projectPath: unknown): PathValidationResult {
  // 타입 검증
  if (!projectPath || typeof projectPath !== 'string') {
    return { isValid: false, error: 'Invalid path type' };
  }

  // 빈 문자열 체크
  if (projectPath.trim() === '') {
    return { isValid: false, error: 'Path is empty' };
  }

  // 위험한 문자 확인
  if (projectPath.includes('\0')) {
    return { isValid: false, error: 'Path contains null byte' };
  }

  try {
    // 절대 경로로 정규화
    const resolvedPath = path.resolve(projectPath);
    const resolvedBase = path.resolve(ALLOWED_BASE_DIR);

    // 기준 경로 내부에 있는지 확인 (Path Traversal 방지)
    if (!resolvedPath.toLowerCase().startsWith(resolvedBase.toLowerCase())) {
      return { isValid: false, error: 'Access denied: path outside allowed directory' };
    }

    // 경로가 실제로 존재하는지 확인
    if (!fs.existsSync(resolvedPath)) {
      return { isValid: false, error: 'Path does not exist' };
    }

    // 디렉토리인지 확인
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return { isValid: false, error: 'Path is not a directory' };
    }

    return { isValid: true, sanitizedPath: resolvedPath };
  } catch (error) {
    return {
      isValid: false,
      error: `Path validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
