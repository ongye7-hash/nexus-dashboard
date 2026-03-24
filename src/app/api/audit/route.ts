import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { validateProjectPath } from '@/lib/path-validator';

const execAsync = promisify(exec);

interface AuditVulnerability {
  name: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  via: string[];
  effects: string[];
  range: string;
  fixAvailable: boolean;
}

interface AuditResult {
  projectName: string;
  projectPath: string;
  hasPackageJson: boolean;
  hasNodeModules: boolean;
  summary: {
    total: number;
    info: number;
    low: number;
    moderate: number;
    high: number;
    critical: number;
  };
  vulnerabilities: AuditVulnerability[];
  error?: string;
}

async function runAudit(projectPath: string, projectName: string): Promise<AuditResult> {
  const result: AuditResult = {
    projectName,
    projectPath,
    hasPackageJson: false,
    hasNodeModules: false,
    summary: { total: 0, info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    vulnerabilities: [],
  };

  // package.json 확인
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    result.error = 'package.json not found';
    return result;
  }
  result.hasPackageJson = true;

  // node_modules 확인
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  result.hasNodeModules = fs.existsSync(nodeModulesPath);

  if (!result.hasNodeModules) {
    result.error = 'node_modules not found (npm install required)';
    return result;
  }

  try {
    // npm audit --json 실행
    const { stdout } = await execAsync('npm audit --json', {
      cwd: projectPath,
      timeout: 60000,
    });

    const auditData = JSON.parse(stdout);

    // npm audit 결과 파싱
    if (auditData.metadata?.vulnerabilities) {
      const vulns = auditData.metadata.vulnerabilities;
      result.summary = {
        total: vulns.total || 0,
        info: vulns.info || 0,
        low: vulns.low || 0,
        moderate: vulns.moderate || 0,
        high: vulns.high || 0,
        critical: vulns.critical || 0,
      };
    }

    // 취약점 상세 정보
    if (auditData.vulnerabilities) {
      result.vulnerabilities = Object.entries(auditData.vulnerabilities)
        .slice(0, 10) // 상위 10개만
        .map(([name, data]: [string, unknown]) => {
          const vuln = data as {
            severity: string;
            via: Array<{ name?: string } | string>;
            effects: string[];
            range: string;
            fixAvailable: boolean;
          };
          return {
            name,
            severity: vuln.severity as AuditVulnerability['severity'],
            via: vuln.via?.map((v) => typeof v === 'string' ? v : v.name || 'unknown') || [],
            effects: vuln.effects || [],
            range: vuln.range || '',
            fixAvailable: vuln.fixAvailable || false,
          };
        });
    }

    return result;
  } catch (error: unknown) {
    // npm audit는 취약점이 있으면 non-zero exit code를 반환함
    // stdout에 JSON 결과가 있을 수 있음
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    if (execError.stdout) {
      try {
        const auditData = JSON.parse(execError.stdout);

        if (auditData.metadata?.vulnerabilities) {
          const vulns = auditData.metadata.vulnerabilities;
          result.summary = {
            total: vulns.total || 0,
            info: vulns.info || 0,
            low: vulns.low || 0,
            moderate: vulns.moderate || 0,
            high: vulns.high || 0,
            critical: vulns.critical || 0,
          };
        }

        if (auditData.vulnerabilities) {
          result.vulnerabilities = Object.entries(auditData.vulnerabilities)
            .slice(0, 10)
            .map(([name, data]: [string, unknown]) => {
              const vuln = data as {
                severity: string;
                via: Array<{ name?: string } | string>;
                effects: string[];
                range: string;
                fixAvailable: boolean;
              };
              return {
                name,
                severity: vuln.severity as AuditVulnerability['severity'],
                via: vuln.via?.map((v) => typeof v === 'string' ? v : v.name || 'unknown') || [],
                effects: vuln.effects || [],
                range: vuln.range || '',
                fixAvailable: vuln.fixAvailable || false,
              };
            });
        }

        return result;
      } catch {
        // JSON 파싱 실패
      }
    }

    result.error = execError.message || 'Audit failed';
    return result;
  }
}

export async function POST(request: Request) {
  try {
    const { projects } = await request.json();

    if (!projects || !Array.isArray(projects)) {
      return NextResponse.json({ error: 'Projects array required' }, { status: 400 });
    }

    const results: AuditResult[] = [];

    for (const project of projects) {
      // 각 프로젝트 경로 검증 (Path Traversal 방지)
      const validation = validateProjectPath(project.path);
      if (!validation.isValid) {
        results.push({
          projectName: project.name,
          projectPath: project.path,
          hasPackageJson: false,
          hasNodeModules: false,
          summary: { total: 0, info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
          vulnerabilities: [],
          error: validation.error || 'Invalid path',
        });
        continue;
      }

      const auditResult = await runAudit(validation.sanitizedPath!, project.name);
      results.push(auditResult);
    }

    // 전체 요약
    const totalSummary = {
      projectsChecked: results.length,
      projectsWithIssues: results.filter(r => r.summary.total > 0).length,
      totalVulnerabilities: results.reduce((sum, r) => sum + r.summary.total, 0),
      critical: results.reduce((sum, r) => sum + r.summary.critical, 0),
      high: results.reduce((sum, r) => sum + r.summary.high, 0),
      moderate: results.reduce((sum, r) => sum + r.summary.moderate, 0),
      low: results.reduce((sum, r) => sum + r.summary.low, 0),
    };

    return NextResponse.json({
      success: true,
      results,
      summary: totalSummary,
    });
  } catch (error) {
    console.error('Audit error:', error);
    return NextResponse.json(
      { error: 'Audit failed' },
      { status: 500 }
    );
  }
}
