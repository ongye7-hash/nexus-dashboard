import { NextRequest, NextResponse } from 'next/server';
import { fileWatcher, FileChangeEvent } from '@/lib/fileWatcher';

// SSE로 파일 변경 이벤트 스트리밍
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 연결 성공 메시지
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`)
      );

      // 파일 변경 이벤트 구독
      unsubscribe = fileWatcher.subscribe((event: FileChangeEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch { /* 스트림이 닫힌 경우 무시 */ }
      });

      // 연결이 종료되면 정리
      const onAbort = () => {
        unsubscribe?.();
        request.signal.removeEventListener('abort', onAbort);
      };
      request.signal.addEventListener('abort', onAbort);
    },
    cancel() { unsubscribe?.(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// 프로젝트 감시 시작/중지
export async function POST(request: Request) {
  try {
    const { action, projectPath, projectPaths } = await request.json();

    switch (action) {
      case 'watch':
        if (projectPath) {
          fileWatcher.watchProject(projectPath);
          return NextResponse.json({
            success: true,
            message: `Started watching: ${projectPath}`,
          });
        } else if (projectPaths && Array.isArray(projectPaths)) {
          projectPaths.forEach((p: string) => fileWatcher.watchProject(p));
          return NextResponse.json({
            success: true,
            message: `Started watching ${projectPaths.length} projects`,
          });
        }
        break;

      case 'unwatch':
        if (projectPath) {
          fileWatcher.unwatchProject(projectPath);
          return NextResponse.json({
            success: true,
            message: `Stopped watching: ${projectPath}`,
          });
        }
        break;

      case 'unwatchAll':
        fileWatcher.unwatchAll();
        return NextResponse.json({
          success: true,
          message: 'Stopped watching all projects',
        });

      case 'status':
        return NextResponse.json({
          success: true,
          watching: fileWatcher.getWatchedProjects(),
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Missing projectPath' }, { status: 400 });
  } catch (error) {
    console.error('Watch API error:', error);
    return NextResponse.json(
      { error: 'Watch operation failed', details: String(error) },
      { status: 500 }
    );
  }
}
