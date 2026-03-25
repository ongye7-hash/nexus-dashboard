import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
import { getPortMappings, clearPortMapping } from '@/lib/database';

interface RunningProcess {
  port: number;
  pid: number;
  name?: string;
  projectPath?: string;
  projectName?: string;
}

export async function GET() {
  const processes: RunningProcess[] = [];

  // SQLite에서 포트 매핑 로드
  const portMappings = getPortMappings();

  // 포트를 프로젝트 경로로 역매핑
  const portToProject: Record<number, { path: string; name: string }> = {};
  for (const mapping of portMappings) {
    portToProject[mapping.port] = {
      path: mapping.project_path,
      name: path.basename(mapping.project_path),
    };
  }

  // 개발 서버에서 자주 사용하는 포트들 체크 (범위 확장)
  const devPorts = [
    // Next.js / React 기본
    3000, 3001, 3002, 3003, 3004, 3005,
    // Vite
    5173, 5174, 5175, 5176,
    // Python / Django / Flask
    8000, 8001, 8080, 8081,
    // Custom 범위 (8500-8510)
    8500, 8501, 8502, 8503, 8504, 8505, 8506, 8507, 8508, 8509, 8510,
    // 기타
    4000, 4200, 4321, 9000, 9001,
  ];

  try {
    // Windows netstat으로 열린 포트 확인
    const output = execSync('netstat -ano | findstr LISTENING', {
      encoding: 'utf-8',
      windowsHide: true,
    });

    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const localAddress = parts[1];
        const pid = parseInt(parts[4], 10);
        if (!Number.isInteger(pid) || pid <= 0) continue;

        // 포트 추출
        const portMatch = localAddress.match(/:(\d+)$/);
        if (portMatch) {
          const port = parseInt(portMatch[1], 10);

          // 개발 서버 포트인지 확인
          if (devPorts.includes(port) && !processes.some(p => p.port === port)) {
            let processName: string | undefined;

            // PID로 프로세스 이름 가져오기
            try {
              const taskOutput = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
                encoding: 'utf-8',
                windowsHide: true,
              });
              const taskParts = taskOutput.split(',');
              if (taskParts[0]) {
                processName = taskParts[0].replace(/"/g, '').trim();
              }
            } catch {
              // ignore
            }

            // 포트 매핑에서 프로젝트 정보 가져오기
            const projectInfo = portToProject[port];

            let resolvedName = projectInfo?.name;
            let resolvedPath = projectInfo?.path;

            if (!resolvedName) {
              // 1차: PID 커맨드라인에서 Desktop\프로젝트명 패턴 추출
              try {
                const cmdLine = execSync(
                  `wmic process where "ProcessId=${pid}" get CommandLine /FORMAT:LIST`,
                  { encoding: 'utf-8', windowsHide: true, timeout: 3000 }
                ).trim();
                const pathMatch = cmdLine.match(/Desktop\\([\w.-]+)/i);
                if (pathMatch) {
                  resolvedName = pathMatch[1];
                  resolvedPath = path.join('C:\\Users\\user\\Desktop', pathMatch[1]);
                }
              } catch {}

              // 2차: 못 찾으면 HTTP 요청으로 페이지 타이틀 추출
              if (!resolvedName) {
                try {
                  const controller = new AbortController();
                  const timeout = setTimeout(() => controller.abort(), 2000);
                  const res = await fetch(`http://localhost:${port}`, {
                    signal: controller.signal,
                    headers: { 'Accept': 'text/html' },
                  });
                  clearTimeout(timeout);
                  const html = await res.text();
                  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                  if (titleMatch) {
                    resolvedName = titleMatch[1].trim();
                  }
                } catch {}
              }
            }

            processes.push({
              port,
              pid,
              name: processName,
              projectPath: resolvedPath,
              projectName: resolvedName,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('프로세스 목록 조회 실패:', error);
  }

  // 미사용 포트 매핑 정리
  const listeningPorts = new Set(processes.map(p => p.port));
  for (const mapping of portMappings) {
    if (!listeningPorts.has(mapping.port)) {
      clearPortMapping(mapping.project_path);
    }
  }

  return NextResponse.json({ processes });
}

export async function POST(request: Request) {
  try {
    const { action, pid, port, projectPath } = await request.json();

    if (action === 'kill') {
      if (pid) {
        const safePid = parseInt(String(pid), 10);
        if (!Number.isInteger(safePid) || safePid <= 0) {
          return NextResponse.json({ error: '유효하지 않은 PID' }, { status: 400 });
        }
        execSync(`taskkill //PID ${safePid} //F`, { windowsHide: true });
        // 프로젝트 경로가 있으면 포트 매핑 정리
        if (projectPath) {
          clearPortMapping(projectPath);
        }
        return NextResponse.json({ success: true, message: `PID ${safePid} 프로세스를 종료했습니다` });
      } else if (port) {
        const safePort = parseInt(String(port), 10);
        if (!Number.isInteger(safePort) || safePort <= 0 || safePort > 65535) {
          return NextResponse.json({ error: '유효하지 않은 포트' }, { status: 400 });
        }
        // 포트로 PID 찾아서 종료
        const output = execSync(`netstat -ano | findstr :${safePort}`, {
          encoding: 'utf-8',
          windowsHide: true,
        });
        const lines = output.split('\n').filter(line => line.includes('LISTENING'));
        if (lines.length > 0) {
          const parts = lines[0].trim().split(/\s+/);
          const targetPid = parseInt(parts[parts.length - 1], 10);
          execSync(`taskkill //PID ${targetPid} //F`, { windowsHide: true });
          // 프로젝트 경로가 있으면 포트 매핑 정리
          if (projectPath) {
            clearPortMapping(projectPath);
          }
          return NextResponse.json({ success: true, message: `포트 ${port} 프로세스를 종료했습니다` });
        }
      }
    }

    return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: '프로세스 작업 실패', details: String(error) },
      { status: 500 }
    );
  }
}
