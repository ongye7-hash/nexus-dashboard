import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { verifyToken, isSessionRevoked } from '@/lib/auth';
import {
  getProjectMeta,
  saveProjectMeta,
  saveDeployTarget,
  deleteDeployTargetsByProject,
} from '@/lib/database';

// ============================================
// 인증 헬퍼 (기존 auth_sessions 패턴)
// ============================================
async function requireAuth(): Promise<{ sessionId: string } | NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get('nexus_token')?.value;
  if (!token) return NextResponse.json({ success: false, error: '인증이 필요합니다' }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload?.sid || typeof payload.sid !== 'string') {
    return NextResponse.json({ success: false, error: '유효하지 않은 토큰' }, { status: 401 });
  }

  if (isSessionRevoked(payload.sid)) {
    return NextResponse.json({ success: false, error: '세션이 만료되었습니다' }, { status: 401 });
  }

  return { sessionId: payload.sid };
}

// ============================================
// 경로 검증
// ============================================
const VALID_DEPLOY_TYPES = ['vercel', 'docker', 'pm2', 'static', 'external'] as const;
const DANGEROUS_SEGMENTS = ['..', '%2e%2e', 'javascript:', 'data:'];

function validateProjectPath(projectPath: string): string | null {
  // 절대 경로 또는 external:// 프로토콜만 허용
  const isAbsoluteWin = /^[a-zA-Z]:\\/.test(projectPath);
  const isAbsoluteUnix = projectPath.startsWith('/');
  const isExternal = projectPath.startsWith('external://');

  if (!isAbsoluteWin && !isAbsoluteUnix && !isExternal) {
    return 'projectPath는 절대 경로 또는 external:// 형식이어야 합니다';
  }

  if (DANGEROUS_SEGMENTS.some(s => projectPath.toLowerCase().includes(s))) {
    return '유효하지 않은 경로입니다';
  }

  return null; // 유효
}

// ============================================
// POST — 프로젝트 수동 등록
// ============================================
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { name, projectPath, deployType, deployTargets, tags, notes } = body;

    // 필수 필드 검증
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ success: false, error: 'name은 필수입니다' }, { status: 400 });
    }
    if (!projectPath || typeof projectPath !== 'string') {
      return NextResponse.json({ success: false, error: 'projectPath는 필수입니다' }, { status: 400 });
    }
    if (!deployType || typeof deployType !== 'string') {
      return NextResponse.json({ success: false, error: 'deployType은 필수입니다' }, { status: 400 });
    }

    // 경로 검증
    const pathError = validateProjectPath(projectPath);
    if (pathError) {
      return NextResponse.json({ success: false, error: pathError }, { status: 400 });
    }

    // deployType 검증
    if (!VALID_DEPLOY_TYPES.includes(deployType as typeof VALID_DEPLOY_TYPES[number])) {
      return NextResponse.json(
        { success: false, error: `deployType은 ${VALID_DEPLOY_TYPES.join(', ')} 중 하나여야 합니다` },
        { status: 400 }
      );
    }

    // 중복 검사
    const existing = getProjectMeta(projectPath);
    if (existing && existing.is_registered === 1) {
      return NextResponse.json(
        { success: false, error: `이미 등록된 프로젝트입니다: ${projectPath}` },
        { status: 409 }
      );
    }

    // project_meta 저장
    saveProjectMeta({
      project_path: projectPath,
      notes: notes || name,
      tags: tags ? JSON.stringify(tags) : undefined,
      status: 'deployed',
      is_registered: 1,
      deploy_type: deployType,
      deploy_url: deployTargets?.[0]?.config?.url || undefined,
    });

    // deploy_targets 저장
    if (Array.isArray(deployTargets)) {
      for (const target of deployTargets) {
        if (!target.type || !target.name) continue;
        saveDeployTarget({
          id: `dt-${crypto.randomUUID().slice(0, 8)}`,
          project_path: projectPath,
          type: target.type,
          name: target.name,
          config: target.config ? JSON.stringify(target.config) : undefined,
          status: 'unknown',
        });
      }
    }

    return NextResponse.json({
      success: true,
      projectPath,
      name,
      deployType,
    }, { status: 201 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Register API] POST 에러:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ============================================
// DELETE — 프로젝트 등록 해제
// ============================================
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get('projectPath');

    if (!projectPath) {
      return NextResponse.json({ success: false, error: 'projectPath 파라미터가 필요합니다' }, { status: 400 });
    }

    // 존재 여부 확인 (이슈 3: 없는 경로 DELETE 시 고아 레코드 방지)
    const existing = getProjectMeta(projectPath);
    if (!existing || existing.is_registered !== 1) {
      return NextResponse.json(
        { success: false, error: '등록된 프로젝트를 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // is_registered를 0으로 변경
    saveProjectMeta({
      project_path: projectPath,
      is_registered: 0,
    });

    // 배포 타겟 삭제
    deleteDeployTargetsByProject(projectPath);

    return NextResponse.json({ success: true, unregistered: projectPath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Register API] DELETE 에러:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
