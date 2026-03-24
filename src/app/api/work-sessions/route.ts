import { NextResponse } from 'next/server';
import { startWorkSession, endWorkSession, getActiveSession, getAllActiveSessions, getRecentSessions } from '@/lib/database';
import { validateProjectPath } from '@/lib/path-validator';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (projectPath) {
    const validation = validateProjectPath(projectPath);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const session = getActiveSession(validation.sanitizedPath!);
    return NextResponse.json({ session });
  }

  const activeSessions = getAllActiveSessions();
  const recentSessions = getRecentSessions(7);
  return NextResponse.json({ activeSessions, recentSessions });
}

export async function POST(request: Request) {
  try {
    const { action, projectPath, sessionId } = await request.json();

    switch (action) {
      case 'start': {
        if (!projectPath) return NextResponse.json({ error: 'projectPath required' }, { status: 400 });
        // Check for existing active session
        const existing = getActiveSession(projectPath);
        if (existing) {
          return NextResponse.json({ session: existing, alreadyActive: true });
        }
        const id = startWorkSession(projectPath);
        return NextResponse.json({ success: true, sessionId: id });
      }
      case 'stop': {
        if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
        endWorkSession(sessionId);
        // Update daily activity with work minutes
        return NextResponse.json({ success: true });
      }
      case 'stopAll': {
        const activeSessions = getAllActiveSessions();
        for (const session of activeSessions) {
          endWorkSession(session.id);
        }
        return NextResponse.json({ success: true, stopped: activeSessions.length });
      }
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process session' }, { status: 500 });
  }
}
