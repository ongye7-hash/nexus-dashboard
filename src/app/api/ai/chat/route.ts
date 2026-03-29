import { NextRequest } from 'next/server';
import path from 'path';
import { getDb } from '@/lib/db';
import { getSetting, getRegisteredProjects, getDeployTargets } from '@/lib/database';
import { decrypt } from '@/lib/crypto';
import crypto from 'crypto';

const CHAT_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

const BASE_SYSTEM_PROMPT = `너는 Nexus 대시보드의 프로젝트 관리자이자 시니어 개발자다.
등록된 프로젝트들의 상태를 파악하고 개발 관련 질문에 답변한다.
항상 한국어로 응답하고, 마크다운 포맷을 활용하라. 코드 블록에는 언어 태그를 붙여라.
간결하고 실용적으로 답변하라.
사용자의 질문에 프로젝트 컨텍스트를 활용해서 답변하되, 구체적인 API키나 비밀번호는 절대 응답에 포함하지 마.`;

// credential 키 패턴 — config JSON에서 제거할 필드
const CREDENTIAL_KEYS = /^(token|key|secret|password|credential|api_key|apikey|auth)$/i;

function sanitizeConfig(configStr: string | null): Record<string, unknown> {
  if (!configStr) return {};
  try {
    const config = JSON.parse(configStr);
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
      if (!CREDENTIAL_KEYS.test(k)) {
        safe[k] = v;
      }
    }
    return safe;
  } catch {
    return {};
  }
}

function buildSystemPrompt(projectPath?: string | null): string {
  try {
    const registered = getRegisteredProjects();
    if (registered.length === 0) return BASE_SYSTEM_PROMPT;

    // projectPath가 있으면 해당 프로젝트만, 없으면 전체
    const targets = projectPath
      ? registered.filter(p => p.project_path === projectPath)
      : registered;

    if (targets.length === 0) return BASE_SYSTEM_PROMPT;

    const projectBlocks = targets.map((proj, i) => {
      const name = path.basename(proj.project_path);
      const deployTargets = getDeployTargets(proj.project_path);
      const tags = proj.tags ? proj.tags.split(',').map(t => t.trim()).filter(Boolean).join(', ') : '';

      let block = `[프로젝트 ${i + 1}: ${name}]`;
      if (proj.deploy_type) block += `\n  배포 방식: ${proj.deploy_type}`;
      if (tags) block += `\n  태그: ${tags}`;
      if (proj.notes) block += `\n  메모: ${proj.notes}`;
      if (proj.deploy_url) block += `\n  URL: ${proj.deploy_url}`;

      for (const dt of deployTargets) {
        const safeConfig = sanitizeConfig(dt.config ?? null);
        const configUrl = safeConfig.url || safeConfig.domain || '';
        block += `\n  배포 타겟: ${dt.name} (${dt.type})`;
        if (configUrl) block += ` — ${configUrl}`;
        if (dt.status && dt.status !== 'unknown') block += ` [${dt.status}]`;
      }

      return block;
    });

    return `${BASE_SYSTEM_PROMPT}

아래는 현재 등록된 프로젝트 목록이다:

${projectBlocks.join('\n\n')}`;
  } catch (error) {
    console.warn('프로젝트 컨텍스트 빌드 실패:', error);
    return BASE_SYSTEM_PROMPT;
  }
}

function getApiKey(): string | null {
  const encrypted = getSetting('claude_api_key');
  if (!encrypted) return null;
  try {
    return decrypt(encrypted);
  } catch {
    return null;
  }
}

function generateSessionId(): string {
  return `chat_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateTitle(message: string): string {
  // 첫 메시지에서 제목 추출 (최대 50자)
  const cleaned = message.replace(/\n/g, ' ').trim();
  return cleaned.length > 50 ? cleaned.slice(0, 47) + '...' : cleaned;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message, projectPath } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: '메시지가 필요합니다' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const MAX_MESSAGE_LENGTH = 8000;
    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ error: `메시지가 너무 깁니다 (최대 ${MAX_MESSAGE_LENGTH}자)` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Claude API 키가 설정되지 않았습니다. 설정 > AI에서 API 키를 입력하세요.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = getDb();
    let currentSessionId = sessionId;
    let resolvedProjectPath = projectPath || null;

    // 새 세션 생성 (sessionId 없을 때)
    if (!currentSessionId) {
      currentSessionId = generateSessionId();
      const title = generateTitle(message);
      db.prepare(
        'INSERT INTO chat_sessions (id, title, project_path, model, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
      ).run(currentSessionId, title, resolvedProjectPath, CHAT_MODEL);
    } else {
      // 기존 세션이면 DB에서 project_path 읽기
      const session = db.prepare('SELECT project_path FROM chat_sessions WHERE id = ?').get(currentSessionId) as { project_path: string | null } | undefined;
      if (session) resolvedProjectPath = session.project_path;
    }

    // 사용자 메시지 저장
    db.prepare(
      'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
    ).run(currentSessionId, 'user', message.trim());

    // 대화 히스토리 로드 (최근 50개 제한)
    const history = db.prepare(
      'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id ASC LIMIT 50'
    ).all(currentSessionId) as { role: string; content: string }[];

    // Claude API 스트리밍 호출
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(resolvedProjectPath),
        stream: true,
        messages: history.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json().catch(() => ({}));
      const msg = err.error?.message || `Claude API 오류 (${claudeRes.status})`;
      if (claudeRes.status === 401) {
        return new Response(JSON.stringify({ error: 'API 키가 유효하지 않습니다.' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (claudeRes.status === 429) {
        return new Response(JSON.stringify({ error: '요청 한도 초과. 잠시 후 다시 시도하세요.' }), {
          status: 429, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: msg }), {
        status: claudeRes.status, headers: { 'Content-Type': 'application/json' },
      });
    }

    // SSE 스트리밍 응답
    let fullResponse = '';
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 세션 ID를 첫 이벤트로 전송
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'session', sessionId: currentSessionId })}\n\n`));

          const reader = claudeRes.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  fullResponse += parsed.delta.text;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: parsed.delta.text })}\n\n`));
                }

                if (parsed.type === 'message_stop') {
                  // 어시스턴트 응답 DB 저장
                  db.prepare(
                    'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
                  ).run(currentSessionId, 'assistant', fullResponse);

                  // 세션 updated_at 갱신
                  db.prepare(
                    'UPDATE chat_sessions SET updated_at = datetime(\'now\') WHERE id = ?'
                  ).run(currentSessionId);

                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                }
              } catch {
                // JSON 파싱 실패 — SSE 이벤트 건너뜀
              }
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);
          // 중단/에러 시에도 누적된 응답이 있으면 DB에 저장
          if (fullResponse.trim()) {
            try {
              db.prepare(
                'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
              ).run(currentSessionId, 'assistant', fullResponse);
              db.prepare('UPDATE chat_sessions SET updated_at = datetime(\'now\') WHERE id = ?')
                .run(currentSessionId);
            } catch (dbErr) {
              console.warn('중단된 응답 저장 실패:', dbErr);
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: '스트리밍 중 오류가 발생했습니다' })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    const message = error instanceof Error ? error.message : '채팅 처리에 실패했습니다';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
