import { NextRequest } from 'next/server';
import path from 'path';
import { getDb } from '@/lib/db';
import { getSetting, getRegisteredProjects, getDeployTargets } from '@/lib/database';
import { decrypt } from '@/lib/crypto';
import { getToolSchemas, executeTool, getToolPermission } from '@/lib/ai/tools';
import crypto from 'crypto';

const CHAT_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

const BASE_SYSTEM_PROMPT = `너는 Nexus 대시보드의 프로젝트 관리자이자 시니어 개발자다.
등록된 프로젝트들의 상태를 파악하고 개발 관련 질문에 답변한다.
항상 한국어로 응답하고, 마크다운 포맷을 활용하라. 코드 블록에는 언어 태그를 붙여라.
간결하고 실용적으로 답변하라.
사용자의 질문에 프로젝트 컨텍스트를 활용해서 답변하되, 구체적인 API키나 비밀번호는 절대 응답에 포함하지 마.

도구 사용 규칙:
- 사용자가 작업을 요청하면 가용한 도구를 적극적으로 사용하라.
- 쓰기 도구(service_restart, deploy_trigger, n8n_workflow_toggle)는 시스템이 자동으로 사용자 승인을 요청한다. 네가 직접 "진행할까요?" 같은 확인을 물어보지 마. 바로 도구를 호출하라.
- 읽기 도구는 확인 없이 바로 실행된다.
- 정보가 필요하면 먼저 읽기 도구로 상태를 확인한 뒤 판단하라.`;

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
    const safeApiKey: string = apiKey;

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
    const historyRows = db.prepare(
      'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id ASC LIMIT 50'
    ).all(currentSessionId) as { role: string; content: string }[];

    // content가 JSON 배열이면 파싱 (tool_use/tool_result 메시지)
    function parseContent(content: string): string | unknown[] {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
        return content;
      } catch { return content; }
    }

    const rawMessages: Array<{ role: string; content: string | unknown[] }> = historyRows.map(m => ({
      role: m.role,
      content: parseContent(m.content),
    }));

    // tool_use/tool_result 쌍이 깨진 메시지 정리
    // Claude API는 tool_use 다음에 반드시 tool_result가 와야 한다
    const messages: typeof rawMessages = [];
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      const content = msg.content;

      // assistant 메시지에 tool_use가 있는지 확인
      if (msg.role === 'assistant' && Array.isArray(content)) {
        const hasToolUse = content.some((b: unknown) => (b as Record<string, unknown>).type === 'tool_use');
        if (hasToolUse) {
          // 다음 메시지가 tool_result인지 확인
          const next = rawMessages[i + 1];
          if (next && next.role === 'user' && Array.isArray(next.content)) {
            const hasToolResult = next.content.some((b: unknown) => (b as Record<string, unknown>).type === 'tool_result');
            if (hasToolResult) {
              messages.push(msg);  // tool_use
              messages.push(next); // tool_result
              i++; // 다음 건 이미 추가했으므로 건너뜀
              continue;
            }
          }
          // 대응하는 tool_result 없음 → 이 tool_use 메시지 건너뜀
          continue;
        }
      }

      // tool_result만 단독으로 있는 경우도 건너뜀
      if (msg.role === 'user' && Array.isArray(content)) {
        const hasToolResult = content.some((b: unknown) => (b as Record<string, unknown>).type === 'tool_result');
        if (hasToolResult) continue;
      }

      messages.push(msg);
    }

    const systemPrompt = buildSystemPrompt(resolvedProjectPath);
    const tools = getToolSchemas();
    const MAX_TOOL_ROUNDS = 5;

    // Claude API 공통 호출 함수 (non-streaming)
    async function callClaudeNonStreaming(msgs: typeof messages): Promise<{ content: unknown[]; stop_reason: string }> {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': safeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools,
          messages: msgs,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Claude API 오류 (${res.status})`);
      }
      return res.json();
    }

    // SSE 스트리밍 응답
    let fullResponse = '';
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let controllerClosed = false;
        const send = (data: Record<string, unknown>) => {
          if (controllerClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            controllerClosed = true;
          }
        };

        let aborted = false;
        // 클라이언트 연결 끊김 감지
        request.signal.addEventListener('abort', () => { aborted = true; });

        try {
          // 세션 ID를 첫 이벤트로 전송
          send({ type: 'session', sessionId: currentSessionId });

          // Tool use 루프: non-streaming으로 도구 실행, 마지막 텍스트 응답만 스트리밍
          const loopMessages = [...messages];
          let toolRounds = 0;

          while (toolRounds < MAX_TOOL_ROUNDS) {
            // 먼저 non-streaming으로 호출 (heartbeat로 연결 유지)
            const claudeHb = setInterval(() => {
              send({ type: 'heartbeat' });
            }, 10000);
            let result: { content: unknown[]; stop_reason: string };
            try {
              result = await callClaudeNonStreaming(loopMessages);
            } finally {
              clearInterval(claudeHb);
            }

            // tool_use 블록 추출
            const toolUseBlocks = (result.content as Array<Record<string, unknown>>).filter(
              (b) => b.type === 'tool_use'
            );

            if (result.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
              // tool_use 없음 → 텍스트 응답 추출하고 루프 종료
              const textBlocks = (result.content as Array<Record<string, unknown>>).filter(
                (b) => b.type === 'text'
              );
              fullResponse = textBlocks.map(b => b.text).join('');

              // 텍스트를 delta로 전송 (청크 분할해서 스트리밍처럼 보이게)
              const chunkSize = 20;
              for (let i = 0; i < fullResponse.length; i += chunkSize) {
                send({ type: 'delta', text: fullResponse.slice(i, i + chunkSize) });
              }
              break;
            }

            // tool_use 응답을 메시지에 추가
            loopMessages.push({ role: 'assistant', content: result.content as unknown[] });

            // assistant의 tool_use를 DB에 저장
            db.prepare(
              'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
            ).run(currentSessionId, 'assistant', JSON.stringify(result.content));

            // 각 도구 실행
            const toolResults: unknown[] = [];
            for (const block of toolUseBlocks) {
              const toolName = String(block.name);
              const toolInput = (block.input || {}) as Record<string, unknown>;
              const toolUseId = String(block.id);
              const permission = getToolPermission(toolName);

              let toolResult: string;

              if (permission === 'write') {
                // 쓰기 도구 → 사용자 승인 필요
                const approvalId = crypto.randomUUID();
                db.prepare(
                  'INSERT INTO tool_approvals (id, session_id, tool_name, tool_input, status, created_at) VALUES (?, ?, ?, ?, \'pending\', datetime(\'now\'))'
                ).run(approvalId, currentSessionId, toolName, JSON.stringify(toolInput));

                send({ type: 'approval_required', approvalId, toolName, toolInput });

                // 폴링 루프 (60초, 1초 간격)
                const APPROVAL_TIMEOUT = 60;
                let approved = false;
                let rejected = false;

                for (let i = 0; i < APPROVAL_TIMEOUT; i++) {
                  if (aborted) break;
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const row = db.prepare('SELECT status FROM tool_approvals WHERE id = ?').get(approvalId) as { status: string } | undefined;
                  if (row?.status === 'approved') { approved = true; break; }
                  if (row?.status === 'rejected') { rejected = true; break; }
                }

                if (approved) {
                  send({ type: 'tool_call', name: toolName, status: 'running' });

                  const hb = setInterval(() => {
                    send({ type: 'tool_call', name: toolName, status: 'running' });
                  }, 10000);
                  try {
                    toolResult = await executeTool(toolName, toolInput);
                  } finally {
                    clearInterval(hb);
                  }

                  send({ type: 'tool_call', name: toolName, status: 'complete' });

                  // 실행 완료 기록
                  db.prepare('UPDATE tool_approvals SET status = \'executed\', resolved_at = datetime(\'now\') WHERE id = ?').run(approvalId);
                } else if (rejected) {
                  toolResult = `사용자가 ${toolName} 실행을 거부했습니다.`;
                  send({ type: 'tool_call', name: toolName, status: 'rejected' });
                } else {
                  // 타임아웃 또는 클라이언트 연결 끊김
                  db.prepare('UPDATE tool_approvals SET status = \'timeout\', resolved_at = datetime(\'now\') WHERE id = ?').run(approvalId);
                  toolResult = aborted
                    ? `${toolName} 실행이 취소되었습니다 (연결 끊김).`
                    : `${toolName} 실행 승인 시간이 초과되었습니다 (60초).`;
                  send({ type: 'tool_call', name: toolName, status: 'timeout' });
                }
              } else {
                // 읽기 도구 → 즉시 실행 (heartbeat로 연결 유지)
                send({ type: 'tool_call', name: toolName, status: 'running' });

                // 긴 도구 실행 중 10초마다 heartbeat 전송 (nginx 타임아웃 방지)
                const heartbeatInterval = setInterval(() => {
                  send({ type: 'tool_call', name: toolName, status: 'running' });
                }, 10000);

                try {
                  toolResult = await executeTool(toolName, toolInput);
                } finally {
                  clearInterval(heartbeatInterval);
                }

                send({ type: 'tool_call', name: toolName, status: 'complete' });
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: toolResult,
              });
            }

            // tool_result를 메시지에 추가
            loopMessages.push({ role: 'user', content: toolResults });

            // tool_result를 DB에 저장
            db.prepare(
              'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
            ).run(currentSessionId, 'user', JSON.stringify(toolResults));

            toolRounds++;
          }

          // 루프 한도 도달 시 에러
          if (!fullResponse.trim() && toolRounds >= MAX_TOOL_ROUNDS) {
            fullResponse = '도구 실행 한도(5회)에 도달했습니다. 질문을 더 구체적으로 해주세요.';
            send({ type: 'delta', text: fullResponse });
          }

          // 최종 응답 DB 저장
          if (fullResponse.trim()) {
            db.prepare(
              'INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
            ).run(currentSessionId, 'assistant', fullResponse);
          }

          // 세션 updated_at 갱신
          db.prepare(
            'UPDATE chat_sessions SET updated_at = datetime(\'now\') WHERE id = ?'
          ).run(currentSessionId);

          send({ type: 'done' });
        } catch (error) {
          console.error('Chat streaming error:', error);
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
          const errMsg = error instanceof Error ? error.message : '스트리밍 중 오류가 발생했습니다';
          send({ type: 'error', message: errMsg });
        } finally {
          controllerClosed = true;
          try { controller.close(); } catch { /* 이미 닫힘 */ }
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
