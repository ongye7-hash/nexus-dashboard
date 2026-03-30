import { execFileSync } from 'child_process';
import path from 'path';
import { getDb } from '@/lib/db';
import { getRegisteredProjects, getDeployTargets, getAllVPSServers, getVPSServer, getSetting } from '@/lib/database';
import { connectSSH, sshExec } from '@/lib/ssh';
import { validateProjectPath } from '@/lib/path-validator';
import { decrypt } from '@/lib/crypto';
import crypto from 'crypto';

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

// 11. project_ideate — 프로젝트 아이디어 → 설계 보고서
const IDEATE_SYSTEM_PROMPT = `너는 시니어 소프트웨어 아키텍트이자 제품 전략가다.
사용자의 프로젝트 아이디어를 받아 상세한 설계 보고서를 작성한다.
항상 한국어로 작성하고, 마크다운 포맷을 사용하라.
실용적이고 구현 가능한 수준으로 작성하라. 1인 개발자 관점에서 현실적인 범위를 제안하라.`;

const IDEATE_REPORT_PROMPT = (idea: string) => `다음 프로젝트 아이디어에 대한 설계 보고서를 작성해주세요:

아이디어: ${idea}

아래 구조로 상세하게 작성하세요:
## 1. 프로젝트 개요 (프로젝트명 영문+한글, 한 줄 설명, 핵심 가치)
## 2. 시장/경쟁 분석 (유사 서비스, 차별화, 타겟 사용자)
## 3. 추천 기술 스택 (이유 포함, 1인 개발자 기준 최소화)
## 4. 아키텍처 설계 (시스템 구성, 데이터 흐름)
## 5. 파일/폴더 구조 (트리 형태, 모든 파일 포함)
## 6. API 스펙 (엔드포인트 목록)
## 7. DB 스키마 (주요 테이블, SQL 또는 Prisma 포함)
## 8. 예상 개발 기간 (MVP 주 단위)
## 9. 수익화 + 확장 가능성`;

const IDEATE_JSON_PROMPT = (idea: string, report: string) => `아래 프로젝트 설계 보고서를 기반으로 structured JSON을 생성하세요.

아이디어: ${idea}

설계 보고서:
${report.slice(0, 6000)}

JSON만 출력하세요. 다른 텍스트, 설명, 마크다운은 절대 포함하지 마세요.

{
  "project_name": "영문-프로젝트명",
  "tech_stack": { "runtime": "...", "framework": "...", "language": "...", "database": "...", "deployment": "...", "key_packages": ["..."] },
  "architecture": { "pattern": "...", "description": "...", "key_decisions": ["..."] },
  "file_structure": [
    { "path": "package.json", "type": "config", "description": "프로젝트 의존성", "order": 1, "dependencies": [] },
    { "path": "src/types/index.ts", "type": "type", "description": "타입 정의", "order": 6, "dependencies": [] }
  ],
  "api_spec": [
    { "method": "GET", "path": "/api/...", "description": "..." }
  ]
}

file_structure 규칙:
- order: config=1~5, types=6~10, lib/util=11~15, api=16~25, components=26~35, pages=36~45, other=46~50
- 프로젝트의 모든 파일을 빠짐없이 포함
- dependencies: 해당 파일이 import하는 다른 파일의 path`;

const projectIdeateTool: Tool = {
  name: 'project_ideate',
  description: '프로젝트 아이디어를 분석하고 상세한 설계 보고서를 생성한다. 시장 분석, 기술 스택 추천, 아키텍처 설계, 파일 구조, API 스펙을 포함한다.',
  input_schema: {
    type: 'object',
    properties: {
      idea: { type: 'string', description: '프로젝트 아이디어 설명' },
    },
    required: ['idea'],
  },
  permission: 'read',
  async execute(input) {
    const idea = String(input.idea || '').trim();
    if (!idea) return '오류: 프로젝트 아이디어를 입력해주세요.';
    if (idea.length > 2000) return '오류: 아이디어 설명이 너무 깁니다 (최대 2000자).';

    // Claude API 키 가져오기
    const encryptedKey = getSetting('claude_api_key');
    if (!encryptedKey) return 'Claude API 키가 설정되지 않았습니다.';

    let apiKey: string;
    try { apiKey = decrypt(encryptedKey); } catch { return 'Claude API 키 복호화 실패.'; }

    const claudeCall = async (system: string, userMsg: string, maxTokens: number) => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API ${res.status}`);
      }
      const data = await res.json();
      return data.content?.[0]?.text || '';
    };

    try {
      // === 1회차: 마크다운 보고서 (상세, 잘림 없음) ===
      const report = await claudeCall(IDEATE_SYSTEM_PROMPT, IDEATE_REPORT_PROMPT(idea), 8192);
      if (!report) return '설계 보고서 생성에 실패했습니다.';

      // === 2회차: structured JSON (보고서 기반 추출) ===
      let techStack: string | null = null;
      let architecture: string | null = null;
      let fileStructure: string | null = null;
      let apiSpec: string | null = null;
      let status = 'draft';

      try {
        const jsonText = await claudeCall(
          'JSON만 출력하라. 마크다운, 설명, 주석 절대 금지. 순수 JSON 객체 하나만 출력. file_structure는 핵심 파일 20개 이내로 제한.',
          IDEATE_JSON_PROMPT(idea, report),
          8192
        );

        if (jsonText) {
          // 안전한 JSON 추출 — 잘린 JSON 복구 포함
          const firstBrace = jsonText.indexOf('{');
          const lastBrace = jsonText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1) {
            let jsonStr = jsonText.substring(firstBrace, lastBrace + 1);
            let structured: Record<string, unknown>;
            try {
              structured = JSON.parse(jsonStr);
            } catch {
              // 잘린 JSON 복구 시도 — 열린 배열/객체 닫기
              jsonStr = jsonStr
                .replace(/,\s*$/, '')           // 마지막 쉼표 제거
                .replace(/\[\s*$/, '[]')        // 빈 배열 닫기
                .replace(/,\s*\{[^}]*$/, '')    // 불완전 객체 제거
              ;
              // 닫히지 않은 ] 과 } 추가
              const openBrackets = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length;
              const openBraces = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length;
              jsonStr += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
              structured = JSON.parse(jsonStr);
            }

            if (structured.tech_stack) techStack = JSON.stringify(structured.tech_stack);
            if (structured.architecture) architecture = JSON.stringify(structured.architecture);
            if (structured.file_structure) fileStructure = JSON.stringify(structured.file_structure);
            if (structured.api_spec) apiSpec = JSON.stringify(structured.api_spec);
            status = 'designed';
          }
        }
      } catch (jsonErr) {
        console.warn('Structured JSON 추출 실패 (graceful degradation):', jsonErr);
      }

      // DB에 저장
      const db = getDb();
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO project_blueprints (id, idea, analysis, tech_stack, architecture, file_structure, api_spec, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(id, idea, report, techStack, architecture, fileStructure, apiSpec, status);

      const structuredInfo = fileStructure
        ? `\n\n> 파일 구조 ${JSON.parse(fileStructure).length}개 파일 구조화 완료. 코드 생성 준비됨 (ID: ${id}).`
        : `\n\n> 구조화 데이터 추출 실패. 보고서만 저장됨 (ID: ${id}).`;

      return `설계 보고서가 생성되었습니다.${structuredInfo}\n\n${report}`;
    } catch (error) {
      return `설계 보고서 생성 실패: ${error instanceof Error ? error.message : 'unknown'}`;
    }
  },
};

// ============ project_generate 헬퍼 ============

function toRepoName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'new-project';
}

function extractExports(code: string): string {
  return code.split('\n').filter(l => /^export\s/.test(l.trim())).map(l => l.trim()).slice(0, 15).join('\n');
}

function isFoundationFile(file: { path: string; type: string }): boolean {
  if (['config', 'type', 'schema'].includes(file.type)) return true;
  if (file.path.includes('prisma') || file.path.endsWith('.prisma')) return true;
  if (file.path.includes('types/') || file.path.includes('types.ts')) return true;
  if (file.path.includes('.env') || file.path === 'package.json') return true;
  return false;
}

function stripCodeFence(text: string): string {
  return text.replace(/^```[\w]*\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
}

interface FileEntry { path: string; type: string; description: string; order: number; dependencies: string[] }

// 12. project_generate — 비동기 코드 생성 + GitHub push

async function generateCodeInBackground(blueprintId: string): Promise<void> {
  const db = getDb();
  const bp = db.prepare('SELECT * FROM project_blueprints WHERE id = ?').get(blueprintId) as Record<string, unknown>;

  const ghToken = decrypt(getSetting('github_token')!);
  const claudeKey = decrypt(getSetting('claude_api_key')!);

  const files: FileEntry[] = JSON.parse(String(bp.file_structure));
  files.sort((a, b) => (a.order || 99) - (b.order || 99));

  let repoName: string;
  try {
    // structured JSON 각 필드에서 project_name 탐색
    let projectName = '';
    for (const col of ['architecture', 'tech_stack', 'api_spec']) {
      if (bp[col]) {
        try {
          const parsed = JSON.parse(String(bp[col]));
          if (parsed.project_name) { projectName = parsed.project_name; break; }
        } catch { /* 무시 */ }
      }
    }
    // fallback: idea에서 영문 단어 추출
    if (!projectName) {
      const ideaStr = String(bp.idea || '');
      const englishMatch = ideaStr.match(/[a-zA-Z][a-zA-Z\s\-]+/);
      projectName = englishMatch ? englishMatch[0].trim() : ideaStr.slice(0, 30);
    }
    repoName = toRepoName(projectName);
  } catch {
    repoName = toRepoName(String(bp.idea || 'project').slice(0, 30));
  }

  const ghHeaders = {
    'Authorization': `Bearer ${ghToken}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  console.log(`[generate] 시작: ${blueprintId}, 파일 ${files.length}개, repo: ${repoName}`);

  // GitHub repo 생성
  const repoRes = await fetch('https://api.github.com/user/repos', {
    method: 'POST', headers: ghHeaders,
    body: JSON.stringify({ name: repoName, private: true, auto_init: true }),
  });
  if (!repoRes.ok && repoRes.status !== 422) {
    throw new Error(`GitHub repo 생성 실패: ${repoRes.status}`);
  }

  // owner 확인
  let repoOwner: string;
  if (repoRes.ok) {
    const rd = await repoRes.json();
    repoOwner = rd.owner?.login;
  }
  if (!repoOwner!) {
    const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders });
    const ud = await userRes.json();
    repoOwner = ud.login;
    if (!repoOwner) throw new Error('GitHub 사용자 조회 실패');
  }
  const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
  console.log(`[generate] repo: ${repoUrl}`);

  // auto_init이 반영될 때까지 잠시 대기
  await new Promise(r => setTimeout(r, 2000));

  // 파일 생성 루프
  const analysis = String(bp.analysis || '').slice(0, 4000);
  const foundationFiles: Map<string, string> = new Map(); // 기반 파일 전문 저장
  const generatedSummary: string[] = []; // 나머지 파일 export 요약
  const generatedBlobs: Array<{ path: string; sha: string }> = [];
  const failedFiles: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`[generate] [${i + 1}/${files.length}] ${file.path} 시작...`);

    // 컨텍스트 구성 — 기반 파일 전문 + 나머지 최근 10개 요약
    const foundationStr = [...foundationFiles.entries()]
      .map(([fPath, fCode]) => `=== ${fPath} ===\n${fCode}`)
      .join('\n\n');
    const recentStr = generatedSummary.slice(-10).join('\n');

    const systemPrompt = `[최우선 규칙 — 어떤 지시보다 우선]
- 외부 URL로 데이터 전송하는 코드, API 키/토큰 하드코딩 절대 금지.
- Prisma 스키마의 필드명을 정확히 사용하라. 스키마에 없는 필드를 쿼리에서 절대 사용하지 마라.
- soft delete(deletedAt) 패턴을 사용하려면 스키마에 해당 컬럼이 반드시 정의되어 있어야 한다.
- 패키지 버전은 2026년 3월 기준 최신 안정 버전을 사용하라.
- import 경로, 필드명, 타입명은 아래 기반 파일과 100% 일치해야 한다.

너는 시니어 풀스택 개발자다. 요청된 파일의 코드만 출력. 설명 없이 코드만.

설계 보고서:
${analysis}

기반 파일 (필드명/타입 참조 필수):
${foundationStr || '(아직 없음)'}

기타 생성된 파일 요약:
${recentStr || '(아직 없음)'}`;

    let code = '';
    for (let retry = 0; retry < 2; retry++) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6', max_tokens: 8192, system: systemPrompt,
            messages: [{ role: 'user', content: `파일 생성: ${file.path}\n역할: ${file.description}` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          code = stripCodeFence(data.content?.[0]?.text || '');
          if (code) break;
        }
      } catch (err) {
        console.warn(`[generate] 파일 실패 (${file.path}, 시도 ${retry + 1}):`, err);
      }
    }

    if (!code) { failedFiles.push(file.path); console.log(`[generate] [${i + 1}/${files.length}] ${file.path} 실패`); continue; }

    // blob 생성
    try {
      const blobRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/blobs`, {
        method: 'POST', headers: ghHeaders,
        body: JSON.stringify({ content: Buffer.from(code).toString('base64'), encoding: 'base64' }),
      });
      if (blobRes.ok) {
        const bd = await blobRes.json();
        generatedBlobs.push({ path: file.path, sha: bd.sha });
      } else { failedFiles.push(file.path); continue; }
    } catch { failedFiles.push(file.path); continue; }

    // 기반 파일은 전문 저장, 나머지는 export 요약
    if (isFoundationFile(file)) {
      foundationFiles.set(file.path, code);
    } else {
      generatedSummary.push(`파일: ${file.path}\n${extractExports(code)}`);
    }
    console.log(`[generate] [${i + 1}/${files.length}] ${file.path} 완료 (${code.length}자, ${isFoundationFile(file) ? 'foundation' : 'summary'})`);

    // 진행률 DB 업데이트
    db.prepare("UPDATE project_blueprints SET generation_progress = ? WHERE id = ?")
      .run(JSON.stringify({ current: i + 1, total: files.length, currentFile: file.path }), blueprintId);
  }

  if (generatedBlobs.length === 0) throw new Error('파일을 하나도 생성하지 못했습니다');

  // Git Tree API 일괄 커밋
  console.log(`[generate] Git 커밋 시작 (${generatedBlobs.length}개 파일)...`);
  const refRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/ref/heads/main`, { headers: ghHeaders });
  const refData = await refRes.json();
  const baseCommitSha = refData.object?.sha;
  if (!baseCommitSha) throw new Error('main ref를 찾을 수 없습니다');

  const commitObjRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/commits/${baseCommitSha}`, { headers: ghHeaders });
  const baseTreeSha = (await commitObjRes.json()).tree?.sha;
  if (!baseTreeSha) throw new Error('base tree SHA 조회 실패');

  const treeRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees`, {
    method: 'POST', headers: ghHeaders,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: generatedBlobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })) }),
  });
  const treeSha = (await treeRes.json()).sha;

  const commitRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/commits`, {
    method: 'POST', headers: ghHeaders,
    body: JSON.stringify({ message: `feat: initial generation by Nexus AI (${generatedBlobs.length} files)`, tree: treeSha, parents: [baseCommitSha] }),
  });
  const commitSha = (await commitRes.json()).sha;

  await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/refs/heads/main`, {
    method: 'PATCH', headers: ghHeaders, body: JSON.stringify({ sha: commitSha }),
  });

  // 완료 업데이트
  const successFiles = generatedBlobs.map(b => b.path);
  db.prepare("UPDATE project_blueprints SET status='generated', repo_url=?, generated_files=?, updated_at=datetime('now') WHERE id=?")
    .run(repoUrl, JSON.stringify(successFiles), blueprintId);

  console.log(`[generate] 완료! ${repoUrl} — 성공 ${successFiles.length}, 실패 ${failedFiles.length}`);
}

const projectGenerateTool: Tool = {
  name: 'project_generate',
  description: '설계 보고서(blueprint)를 기반으로 코드를 생성하고 GitHub 저장소에 push합니다. 백그라운드에서 실행되며, 완료 시 check_generation으로 확인할 수 있습니다.',
  input_schema: {
    type: 'object',
    properties: {
      blueprint_id: { type: 'string', description: 'project_blueprints 테이블의 ID' },
    },
    required: ['blueprint_id'],
  },
  permission: 'write',
  async execute(input) {
    const blueprintId = String(input.blueprint_id || '').trim();
    if (!blueprintId) return '오류: blueprint_id가 필요합니다.';

    const db = getDb();
    const bp = db.prepare('SELECT id, file_structure, status FROM project_blueprints WHERE id = ?').get(blueprintId) as Record<string, unknown> | undefined;
    if (!bp) return `오류: blueprint ${blueprintId}를 찾을 수 없습니다.`;
    if (!bp.file_structure) return '오류: 파일 구조 데이터가 없습니다. 프로젝트 설계를 다시 실행해주세요.';
    if (bp.status === 'generating') return '오류: 이미 코드 생성이 진행 중입니다.';

    const ghTokenEnc = getSetting('github_token');
    if (!ghTokenEnc) return '오류: GitHub 토큰이 설정되지 않았습니다. 설정 > GitHub에서 토큰을 등록해주세요.';
    try { decrypt(ghTokenEnc); } catch { return 'GitHub 토큰 복호화 실패.'; }

    const claudeKeyEnc = getSetting('claude_api_key');
    if (!claudeKeyEnc) return 'Claude API 키가 설정되지 않았습니다.';
    try { decrypt(claudeKeyEnc); } catch { return 'Claude API 키 복호화 실패.'; }

    const fileCount = JSON.parse(String(bp.file_structure)).length;

    // status 업데이트 + 백그라운드 시작
    db.prepare("UPDATE project_blueprints SET status='generating', updated_at=datetime('now') WHERE id=?").run(blueprintId);

    generateCodeInBackground(blueprintId).catch(err => {
      console.error('[generate] 백그라운드 실패:', err);
      db.prepare("UPDATE project_blueprints SET status='failed', updated_at=datetime('now') WHERE id=?").run(blueprintId);
    });

    return `코드 생성이 시작됐습니다!\n\n- Blueprint: ${blueprintId}\n- 파일 수: ${fileCount}개\n- 예상 시간: ${Math.ceil(fileCount * 10 / 60)}~${Math.ceil(fileCount * 15 / 60)}분\n\n완료 여부는 "코드 생성 결과 확인해줘"로 확인할 수 있습니다.`;
  },
};

// 13. check_generation — 코드 생성 상태 조회
const checkGenerationTool: Tool = {
  name: 'check_generation',
  description: '프로젝트 코드 생성 상태를 확인합니다. blueprint ID로 진행 상황, GitHub repo URL, 생성된 파일 목록을 조회합니다.',
  input_schema: {
    type: 'object',
    properties: {
      blueprint_id: { type: 'string', description: 'project_blueprints 테이블의 ID (생략 시 가장 최근)' },
    },
    required: [],
  },
  permission: 'read',
  async execute(input) {
    const db = getDb();
    let bp: Record<string, unknown> | undefined;

    if (input.blueprint_id) {
      bp = db.prepare('SELECT id, idea, status, repo_url, generated_files, generation_progress, updated_at FROM project_blueprints WHERE id = ?')
        .get(String(input.blueprint_id)) as Record<string, unknown> | undefined;
    } else {
      bp = db.prepare('SELECT id, idea, status, repo_url, generated_files, generation_progress, updated_at FROM project_blueprints ORDER BY updated_at DESC LIMIT 1')
        .get() as Record<string, unknown> | undefined;
    }

    if (!bp) return '코드 생성 기록이 없습니다.';

    const statusLabels: Record<string, string> = {
      draft: '초안 (구조화 데이터 없음)',
      designed: '설계 완료 (코드 생성 가능)',
      generating: '코드 생성 중...',
      generated: '코드 생성 완료',
      failed: '코드 생성 실패',
    };

    let result = `Blueprint: ${bp.id}\n`;
    result += `아이디어: ${String(bp.idea || '').slice(0, 100)}\n`;
    result += `상태: ${statusLabels[String(bp.status)] || bp.status}\n`;
    result += `업데이트: ${bp.updated_at}\n`;

    if (bp.status === 'generating' && bp.generation_progress) {
      try {
        const prog = JSON.parse(String(bp.generation_progress));
        result += `진행률: ${prog.current}/${prog.total} 파일 (현재: ${prog.currentFile})\n`;
      } catch { /* 무시 */ }
    }

    if (bp.repo_url) result += `GitHub: ${bp.repo_url}\n`;

    if (bp.generated_files) {
      try {
        const files = JSON.parse(String(bp.generated_files));
        result += `\n생성된 파일 (${files.length}개):\n${files.map((f: string) => `- ${f}`).join('\n')}`;
      } catch { /* 파싱 실패 무시 */ }
    }

    return result;
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
  projectIdeateTool,
  projectGenerateTool,
  checkGenerationTool,
];

// 도구의 permission 조회
export function getToolPermission(name: string): 'read' | 'write' | null {
  const tool = TOOLS.find(t => t.name === name);
  return tool ? tool.permission : null;
}
