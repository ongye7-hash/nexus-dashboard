import { execFileSync } from 'child_process';
import path from 'path';
import { getDb } from '@/lib/db';
import { getRegisteredProjects, getDeployTargets, getAllVPSServers, getVPSServer, getSetting } from '@/lib/database';
import { connectSSH, sshExec } from '@/lib/ssh';
import { validateProjectPath } from '@/lib/path-validator';
import { decrypt } from '@/lib/crypto';

// ============ Tool 인터페이스 ============

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
  permission: 'read' | 'write';
}

// Claude API에 전달할 도구 스키마 (execute 제외)
export function getToolSchemas(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

// 도구 이름으로 실행
export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return `알 수 없는 도구: ${name}`;
  try {
    return await tool.execute(input);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '도구 실행 실패';
    console.error(`Tool ${name} error:`, error);
    return `도구 실행 오류: ${msg}`;
  }
}

// ============ 도구 구현 ============

// 1. project_list — 등록된 프로젝트 목록
const projectListTool: Tool = {
  name: 'project_list',
  description: '등록된 프로젝트 목록과 배포 정보를 조회한다.',
  input_schema: { type: 'object', properties: {}, required: [] },
  permission: 'read',
  async execute() {
    const projects = getRegisteredProjects();
    if (projects.length === 0) return '등록된 프로젝트가 없습니다.';

    const lines = projects.map(p => {
      const name = path.basename(p.project_path);
      const targets = getDeployTargets(p.project_path);
      const targetInfo = targets.map(t => `${t.name}(${t.type})`).join(', ');
      return `- ${name}: ${p.deploy_type || '미지정'} | 태그: ${p.tags || '없음'} | 배포: ${targetInfo || '없음'} | 메모: ${p.notes || '없음'}`;
    });

    return `등록된 프로젝트 ${projects.length}개:\n${lines.join('\n')}`;
  },
};

// 2. http_health_check — URL 상태 확인
const httpHealthCheckTool: Tool = {
  name: 'http_health_check',
  description: '등록된 프로젝트 URL의 HTTP 상태를 확인한다. URL은 등록된 배포 URL만 허용된다.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '확인할 URL (등록된 배포 URL만 가능)' },
    },
    required: ['url'],
  },
  permission: 'read',
  async execute(input) {
    const url = String(input.url || '').trim();
    if (!url) return '오류: URL이 필요합니다.';

    // 등록된 URL인지 확인
    const projects = getRegisteredProjects();
    const allowedUrls: string[] = [];
    for (const p of projects) {
      if (p.deploy_url) allowedUrls.push(p.deploy_url);
      const targets = getDeployTargets(p.project_path);
      for (const t of targets) {
        if (t.config) {
          try {
            const cfg = JSON.parse(t.config);
            if (cfg.url) allowedUrls.push(cfg.url);
            if (cfg.domain) allowedUrls.push(`https://${cfg.domain}`);
          } catch { /* 파싱 실패 무시 */ }
        }
      }
    }

    const isAllowed = allowedUrls.some(a => {
      try {
        const allowedOrigin = new URL(a).origin;
        const requestOrigin = new URL(url).origin;
        return allowedOrigin === requestOrigin;
      } catch { return false; }
    });
    if (!isAllowed) return `오류: ${url}은 등록된 배포 URL이 아닙니다. 등록된 URL: ${allowedUrls.join(', ')}`;

    try {
      const start = Date.now();
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
      const latency = Date.now() - start;
      return `${url}\n상태: ${res.status} ${res.statusText}\n응답 시간: ${latency}ms`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      return `${url}\n상태: 연결 실패 (${msg})`;
    }
  },
};

// 3. vps_status — VPS 서버 상태
const VPS_COMMANDS = [
  { label: '메모리', cmd: 'free -h' },
  { label: '디스크', cmd: 'df -h /' },
  { label: '업타임', cmd: 'uptime' },
  { label: 'Docker', cmd: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"' },
];

const vpsStatusTool: Tool = {
  name: 'vps_status',
  description: 'VPS 서버의 메모리, 디스크, 업타임, Docker 컨테이너 상태를 조회한다.',
  input_schema: {
    type: 'object',
    properties: {
      serverId: { type: 'string', description: 'VPS 서버 ID (생략 시 첫 번째 서버)' },
    },
    required: [],
  },
  permission: 'read',
  async execute(input) {
    const servers = getAllVPSServers();
    if (servers.length === 0) return '등록된 VPS 서버가 없습니다.';

    const serverId = input.serverId ? String(input.serverId) : servers[0].id;
    const server = getVPSServer(serverId);
    if (!server) return `서버 ${serverId}를 찾을 수 없습니다.`;

    let conn;
    try {
      conn = await connectSSH(server);
      const results: string[] = [`VPS: ${server.name} (${server.host})`];

      for (const { label, cmd } of VPS_COMMANDS) {
        try {
          const output = await sshExec(conn, cmd);
          results.push(`\n[${label}]\n${output}`);
        } catch (err) {
          results.push(`\n[${label}] 실행 실패: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }

      return results.join('\n');
    } catch (error) {
      return `VPS 연결 실패: ${error instanceof Error ? error.message : 'unknown'}`;
    } finally {
      if (conn) try { conn.end(); } catch { /* 연결 종료 실패 무시 */ }
    }
  },
};

// 4. docker_logs — Docker 컨테이너 로그
const dockerLogsTool: Tool = {
  name: 'docker_logs',
  description: 'VPS Docker 컨테이너의 최근 로그 50줄을 조회한다.',
  input_schema: {
    type: 'object',
    properties: {
      container: { type: 'string', description: 'Docker 컨테이너 이름' },
      serverId: { type: 'string', description: 'VPS 서버 ID (생략 시 첫 번째 서버)' },
    },
    required: ['container'],
  },
  permission: 'read',
  async execute(input) {
    const containerName = String(input.container || '').trim();
    if (!containerName) return '오류: 컨테이너 이름이 필요합니다.';

    // 컨테이너 이름 검증 (영문, 숫자, 하이픈, 언더스코어, 점만 허용)
    if (!/^[a-zA-Z0-9_.\-]+$/.test(containerName)) {
      return '오류: 유효하지 않은 컨테이너 이름입니다.';
    }

    const servers = getAllVPSServers();
    if (servers.length === 0) return '등록된 VPS 서버가 없습니다.';

    const serverId = input.serverId ? String(input.serverId) : servers[0].id;
    const server = getVPSServer(serverId);
    if (!server) return `서버 ${serverId}를 찾을 수 없습니다.`;

    let conn;
    try {
      conn = await connectSSH(server);

      // 먼저 컨테이너가 존재하는지 확인
      const ps = await sshExec(conn, 'docker ps -a --format "{{.Names}}"');
      const containers = ps.split('\n').map(c => c.trim()).filter(Boolean);
      if (!containers.includes(containerName)) {
        return `컨테이너 '${containerName}'을 찾을 수 없습니다. 실행 중인 컨테이너: ${containers.join(', ')}`;
      }

      // 하드코딩된 명령 — containerName은 정규식 [a-zA-Z0-9_.\-]+ + 목록 검증 완료
      const logs = await sshExec(conn, `docker logs --tail 50 ${containerName}`, 20000);
      return `[${containerName} 로그 (최근 50줄)]\n${logs || '(로그 없음)'}`;
    } catch (error) {
      return `로그 조회 실패: ${error instanceof Error ? error.message : 'unknown'}`;
    } finally {
      if (conn) try { conn.end(); } catch { /* 연결 종료 실패 무시 */ }
    }
  },
};

// 5. n8n_executions — n8n 워크플로우 실행 이력
const n8nExecutionsTool: Tool = {
  name: 'n8n_executions',
  description: 'n8n 워크플로우의 최근 실행 이력을 조회한다. n8n API Key가 설정되어 있어야 한다.',
  input_schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: '조회할 실행 수 (기본 10, 최대 50)' },
    },
    required: [],
  },
  permission: 'read',
  async execute(input) {
    const encryptedKey = getSetting('n8n_api_key');
    if (!encryptedKey) return 'n8n API Key가 설정되지 않았습니다. settings 테이블에 n8n_api_key를 추가해주세요.';

    let apiKey: string;
    try {
      apiKey = decrypt(encryptedKey);
    } catch {
      return 'n8n API Key 복호화 실패. 키를 다시 설정해주세요.';
    }

    const limit = Math.min(Math.max(parseInt(String(input.limit)) || 10, 1), 50);
    const n8nUrl = getSetting('n8n_url') || 'https://n8n.ongye.org';

    try {
      const res = await fetch(`${n8nUrl}/api/v1/executions?limit=${limit}`, {
        headers: { 'X-N8N-API-KEY': apiKey },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        if (res.status === 401) return 'n8n API Key가 유효하지 않습니다.';
        return `n8n API 오류: ${res.status} ${res.statusText}`;
      }

      const data = await res.json();
      const executions = data.data || data.results || data;

      if (!Array.isArray(executions) || executions.length === 0) {
        return '최근 실행 이력이 없습니다.';
      }

      const lines = executions.map((ex: Record<string, unknown>) => {
        const status = ex.finished ? (ex.stoppedAt ? '완료' : '실행중') : '실패';
        const workflow = (ex.workflowData as Record<string, unknown>)?.name || ex.workflowId || 'unknown';
        const startedAt = ex.startedAt || '';
        return `- [${status}] ${workflow} (${startedAt})`;
      });

      return `n8n 최근 실행 ${executions.length}건:\n${lines.join('\n')}`;
    } catch (error) {
      return `n8n API 연결 실패: ${error instanceof Error ? error.message : 'unknown'}`;
    }
  },
};

// 6. git_status — 프로젝트 git 상태
const gitStatusTool: Tool = {
  name: 'git_status',
  description: '등록된 프로젝트의 git 브랜치와 변경 상태를 조회한다.',
  input_schema: {
    type: 'object',
    properties: {
      projectPath: { type: 'string', description: '프로젝트 경로' },
    },
    required: ['projectPath'],
  },
  permission: 'read',
  async execute(input) {
    const projectPath = String(input.projectPath || '');
    const validation = validateProjectPath(projectPath);
    if (!validation.isValid) return `경로 오류: ${validation.error}`;

    const safePath = validation.sanitizedPath!;
    const results: string[] = [`프로젝트: ${path.basename(safePath)}`];

    try {
      const branch = execFileSync('git', ['-C', safePath, 'branch', '--show-current'], {
        encoding: 'utf-8', timeout: 5000,
      }).trim();
      results.push(`브랜치: ${branch}`);
    } catch {
      results.push('브랜치: (확인 실패 — git 저장소가 아닐 수 있음)');
    }

    try {
      const status = execFileSync('git', ['-C', safePath, 'status', '--short'], {
        encoding: 'utf-8', timeout: 5000,
      }).trim();
      results.push(`변경사항:\n${status || '(변경 없음)'}`);
    } catch {
      results.push('변경사항: (확인 실패)');
    }

    try {
      const log = execFileSync('git', ['-C', safePath, 'log', '--oneline', '-5'], {
        encoding: 'utf-8', timeout: 5000,
      }).trim();
      results.push(`최근 커밋:\n${log}`);
    } catch {
      results.push('최근 커밋: (확인 실패)');
    }

    return results.join('\n');
  },
};

// ============ 쓰기 도구 ============

// 7. service_restart — PM2/Docker 서비스 재시작
const serviceRestartTool: Tool = {
  name: 'service_restart',
  description: 'VPS에서 Docker 컨테이너 또는 PM2 프로세스를 재시작한다. 사용자 승인이 필요하다.',
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['docker', 'pm2'], description: '서비스 타입' },
      target: { type: 'string', description: '컨테이너/프로세스 이름' },
      serverId: { type: 'string', description: 'VPS 서버 ID (생략 시 첫 번째 서버)' },
    },
    required: ['type', 'target'],
  },
  permission: 'write',
  async execute(input) {
    const serviceType = String(input.type || '');
    const target = String(input.target || '').trim();

    if (!['docker', 'pm2'].includes(serviceType)) return '오류: type은 docker 또는 pm2만 허용됩니다.';
    if (!target) return '오류: target이 필요합니다.';
    if (!/^[a-zA-Z0-9_.\-]+$/.test(target)) return '오류: 유효하지 않은 대상 이름입니다.';

    const servers = getAllVPSServers();
    if (servers.length === 0) return '등록된 VPS 서버가 없습니다.';
    const serverId = input.serverId ? String(input.serverId) : servers[0].id;
    const server = getVPSServer(serverId);
    if (!server) return `서버 ${serverId}를 찾을 수 없습니다.`;

    const cmd = serviceType === 'docker'
      ? `docker restart ${target}`
      : `pm2 restart ${target}`;

    let conn;
    try {
      conn = await connectSSH(server);
      const output = await sshExec(conn, cmd, 30000);
      return `[${serviceType} restart ${target}] 완료\n${output}`;
    } catch (error) {
      return `재시작 실패: ${error instanceof Error ? error.message : 'unknown'}`;
    } finally {
      if (conn) try { conn.end(); } catch { /* 연결 종료 실패 무시 */ }
    }
  },
};

// 8. deploy_trigger — 배포 트리거 (git pull + rebuild)
const deployTriggerTool: Tool = {
  name: 'deploy_trigger',
  description: 'VPS에서 프로젝트를 배포한다 (git pull + docker compose up --build). 사용자 승인이 필요하다.',
  input_schema: {
    type: 'object',
    properties: {
      projectDir: { type: 'string', description: '서버 내 프로젝트 디렉토리 (예: /root/nexus-dashboard)' },
      serverId: { type: 'string', description: 'VPS 서버 ID (생략 시 첫 번째 서버)' },
    },
    required: ['projectDir'],
  },
  permission: 'write',
  async execute(input) {
    const projectDir = String(input.projectDir || '').trim();
    if (!projectDir) return '오류: projectDir이 필요합니다.';

    // 보안: /root/ 또는 /home/으로 시작하는 절대경로만 허용
    if (projectDir.includes('..')) return '오류: 경로에 .. 가 포함될 수 없습니다.';
    if (/[;&|`$(){}]/.test(projectDir)) return '오류: 경로에 허용되지 않은 문자가 포함되어 있습니다.';
    if (!/^\/(?:root|home\/[a-zA-Z0-9_-]+)\/[a-zA-Z0-9_.\-/]+$/.test(projectDir)) {
      return '오류: 유효하지 않은 프로젝트 경로입니다. /root/ 또는 /home/user/ 하위만 허용됩니다.';
    }

    const servers = getAllVPSServers();
    if (servers.length === 0) return '등록된 VPS 서버가 없습니다.';
    const serverId = input.serverId ? String(input.serverId) : servers[0].id;
    const server = getVPSServer(serverId);
    if (!server) return `서버 ${serverId}를 찾을 수 없습니다.`;

    // deploy 디렉토리가 있으면 deploy/, 없으면 프로젝트 루트
    const deployCmd = [
      `cd ${projectDir}`,
      'git pull origin master',
      `if [ -d "deploy" ]; then cd deploy && docker compose -f docker-compose.prod.yml up -d --build; else docker compose up -d --build; fi`,
    ].join(' && ');

    let conn;
    try {
      conn = await connectSSH(server);
      const output = await sshExec(conn, deployCmd, 300000); // 5분 타임아웃
      return `[배포 완료: ${projectDir}]\n${output.slice(-2000)}`; // 마지막 2000자만
    } catch (error) {
      return `배포 실패: ${error instanceof Error ? error.message : 'unknown'}`;
    } finally {
      if (conn) try { conn.end(); } catch { /* 연결 종료 실패 무시 */ }
    }
  },
};

// 9. n8n_workflow_toggle — n8n 워크플로우 활성화/비활성화
const n8nWorkflowToggleTool: Tool = {
  name: 'n8n_workflow_toggle',
  description: 'n8n 워크플로우를 활성화하거나 비활성화한다. 사용자 승인이 필요하다.',
  input_schema: {
    type: 'object',
    properties: {
      workflowId: { type: 'string', description: '워크플로우 ID (숫자)' },
      active: { type: 'boolean', description: 'true=활성화, false=비활성화' },
    },
    required: ['workflowId', 'active'],
  },
  permission: 'write',
  async execute(input) {
    const workflowId = String(input.workflowId || '').trim();
    const active = Boolean(input.active);

    if (!workflowId || !/^\d+$/.test(workflowId)) return '오류: workflowId는 숫자여야 합니다.';

    const encryptedKey = getSetting('n8n_api_key');
    if (!encryptedKey) return 'n8n API Key가 설정되지 않았습니다.';

    let apiKey: string;
    try { apiKey = decrypt(encryptedKey); } catch { return 'n8n API Key 복호화 실패.'; }

    const n8nUrl = getSetting('n8n_url') || 'https://n8n.ongye.org';

    try {
      const res = await fetch(`${n8nUrl}/api/v1/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': apiKey,
        },
        body: JSON.stringify({ active }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        if (res.status === 404) return `워크플로우 ${workflowId}를 찾을 수 없습니다.`;
        return `n8n API 오류: ${res.status} ${res.statusText}`;
      }

      const data = await res.json();
      return `워크플로우 "${data.name || workflowId}" ${active ? '활성화' : '비활성화'} 완료.`;
    } catch (error) {
      return `n8n API 연결 실패: ${error instanceof Error ? error.message : 'unknown'}`;
    }
  },
};

// 10. get_trends — 오늘의 기술 트렌드 조회
const getTrendsTool: Tool = {
  name: 'get_trends',
  description: '오늘의 기술 트렌드를 조회한다. n8n이 수집한 HackerNews, Reddit 등의 트렌드 정보를 반환한다.',
  input_schema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: '조회할 날짜 (YYYY-MM-DD, 기본: 오늘)' },
      minScore: { type: 'number', description: '최소 점수 필터 (기본: 0)' },
    },
    required: [],
  },
  permission: 'read',
  async execute(input) {
    const rawDate = String(input.date || '');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : new Date().toISOString().slice(0, 10);
    const minScore = parseInt(String(input.minScore)) || 0;

    try {
      const db = getDb();
      const rows = db.prepare(
        'SELECT title, summary, source, source_url, tags, relevance, score FROM trends WHERE date(created_at) = ? AND score >= ? ORDER BY score DESC LIMIT 20'
      ).all(date, minScore) as Array<Record<string, unknown>>;

      if (rows.length === 0) return `${date} 트렌드가 없습니다.`;

      const lines = rows.map((r, i) => {
        let line = `${i + 1}. [${r.score}점] ${r.title}`;
        line += `\n   ${r.summary}`;
        line += `\n   소스: ${r.source}${r.source_url ? ` (${r.source_url})` : ''}`;
        if (r.tags) line += `\n   태그: ${r.tags}`;
        if (r.relevance) {
          try {
            const rel = JSON.parse(String(r.relevance));
            if (Array.isArray(rel) && rel.length > 0) {
              line += `\n   연계: ${rel.map((e: Record<string, unknown>) => `${e.project}(${e.reason})`).join(', ')}`;
            }
          } catch { /* 파싱 실패 무시 */ }
        }
        return line;
      });

      return `${date} 트렌드 ${rows.length}건:\n\n${lines.join('\n\n')}`;
    } catch (error) {
      return `트렌드 조회 실패: ${error instanceof Error ? error.message : 'unknown'}`;
    }
  },
};

// ============ Tool Registry ============

export const TOOLS: Tool[] = [
  projectListTool,
  httpHealthCheckTool,
  vpsStatusTool,
  dockerLogsTool,
  n8nExecutionsTool,
  gitStatusTool,
  serviceRestartTool,
  deployTriggerTool,
  n8nWorkflowToggleTool,
  getTrendsTool,
];

// 도구의 permission 조회
export function getToolPermission(name: string): 'read' | 'write' | null {
  const tool = TOOLS.find(t => t.name === name);
  return tool ? tool.permission : null;
}
