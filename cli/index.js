#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const DESKTOP_PATH = 'C:\\Users\\user\\Desktop';
const NEXUS_PORT = 8507;
const NEXUS_URL = `http://localhost:${NEXUS_PORT}`;

const program = new Command();

// 프로젝트 스캔
function scanProjects() {
  const projects = [];
  const items = fs.readdirSync(DESKTOP_PATH);
  const ignoredFolders = ['node_modules', '.next', '.git', '.vercel', '$RECYCLE.BIN'];
  const ignoredNames = ['desktop.ini', '.DS_Store'];

  for (const item of items) {
    if (ignoredNames.includes(item)) continue;
    if (item.endsWith('.lnk')) continue;
    if (item.startsWith('.')) continue;

    const fullPath = path.join(DESKTOP_PATH, item);

    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) continue;
      if (ignoredFolders.includes(item)) continue;

      const hasPackageJson = fs.existsSync(path.join(fullPath, 'package.json'));
      const hasGit = fs.existsSync(path.join(fullPath, '.git'));

      let framework = 'unknown';
      if (hasPackageJson) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(fullPath, 'package.json'), 'utf-8'));
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (deps['next']) framework = 'Next.js';
          else if (deps['react']) framework = 'React';
          else if (deps['vue']) framework = 'Vue';
          else framework = 'Node.js';
        } catch {}
      }

      projects.push({
        name: item,
        path: fullPath,
        framework,
        hasPackageJson,
        hasGit,
        lastModified: stat.mtime,
      });
    } catch {}
  }

  return projects.sort((a, b) => b.lastModified - a.lastModified);
}

// 프로젝트 찾기
function findProject(query) {
  const projects = scanProjects();
  const lowerQuery = query.toLowerCase();
  return projects.find(p =>
    p.name.toLowerCase() === lowerQuery ||
    p.name.toLowerCase().includes(lowerQuery)
  );
}

// 실행 중인 서버 확인
function getRunningServers() {
  try {
    const output = execSync('netstat -ano | findstr LISTENING', {
      encoding: 'utf-8',
      windowsHide: true,
    });

    const devPorts = [3000, 3001, 3002, 3003, 4000, 5173, 5174, 8000, 8080, 8506, 8507];
    const servers = [];
    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const localAddress = parts[1];
        const pid = parseInt(parts[4], 10);
        const portMatch = localAddress.match(/:(\d+)$/);

        if (portMatch) {
          const port = parseInt(portMatch[1], 10);
          if (devPorts.includes(port) && !servers.some(s => s.port === port)) {
            servers.push({ port, pid });
          }
        }
      }
    }

    return servers;
  } catch {
    return [];
  }
}

// CLI 설정
program
  .name('nexus')
  .description('Nexus Dashboard CLI - Manage your projects from the terminal')
  .version('1.0.0');

// 프로젝트 목록
program
  .command('list')
  .alias('ls')
  .description('List all projects')
  .option('-f, --framework <type>', 'Filter by framework')
  .option('-g, --git', 'Show only git projects')
  .action(async (options) => {
    const spinner = ora('프로젝트를 검색 중...').start();

    // Try API first (has more metadata)
    try {
      const res = await fetch(`${NEXUS_URL}/api/projects`);
      if (res.ok) {
        const data = await res.json();
        spinner.stop();
        console.log(chalk.bold.cyan('\n  NEXUS Projects') + chalk.gray(' (via dashboard)\n'));

        let filtered = data.projects || data;

        if (options.framework) {
          filtered = filtered.filter(p =>
            (p.framework || '').toLowerCase().includes(options.framework.toLowerCase())
          );
        }
        if (options.git) {
          filtered = filtered.filter(p => p.hasGit);
        }

        if (filtered.length === 0) {
          console.log(chalk.yellow('  No projects found.\n'));
          return;
        }

        filtered.forEach((p, i) => {
          const gitIcon = p.hasGit ? chalk.green('●') : chalk.gray('○');
          const fwColor = {
            'Next.js': chalk.blue,
            'React': chalk.cyan,
            'Vue': chalk.green,
            'Node.js': chalk.yellow,
          }[p.framework] || chalk.gray;

          console.log(
            `  ${chalk.gray(`${i + 1}.`)} ${gitIcon} ${chalk.white.bold(p.name)} ${fwColor(`[${p.framework || 'unknown'}]`)}`
          );
        });

        console.log(chalk.gray(`\n  Total: ${filtered.length} projects\n`));
        return;
      }
    } catch {
      // API not available, fall back to local scan
    }

    spinner.stop();
    console.log(chalk.bold.cyan('\n  NEXUS Projects\n'));

    const projects = scanProjects();
    let filtered = projects;

    if (options.framework) {
      filtered = filtered.filter(p =>
        p.framework.toLowerCase().includes(options.framework.toLowerCase())
      );
    }
    if (options.git) {
      filtered = filtered.filter(p => p.hasGit);
    }

    if (filtered.length === 0) {
      console.log(chalk.yellow('  No projects found.\n'));
      return;
    }

    filtered.forEach((p, i) => {
      const gitIcon = p.hasGit ? chalk.green('●') : chalk.gray('○');
      const fwColor = {
        'Next.js': chalk.blue,
        'React': chalk.cyan,
        'Vue': chalk.green,
        'Node.js': chalk.yellow,
      }[p.framework] || chalk.gray;

      console.log(
        `  ${chalk.gray(`${i + 1}.`)} ${gitIcon} ${chalk.white.bold(p.name)} ${fwColor(`[${p.framework}]`)}`
      );
    });

    console.log(chalk.gray(`\n  Total: ${filtered.length} projects\n`));
  });

// 프로젝트 열기
program
  .command('open <project>')
  .description('Open a project in VSCode')
  .action((projectName) => {
    const project = findProject(projectName);

    if (!project) {
      console.log(chalk.red(`\n  Project "${projectName}" not found.\n`));
      process.exit(1);
    }

    const spinner = ora(`Opening ${project.name} in VSCode...`).start();

    try {
      execSync(`code "${project.path}"`, { windowsHide: true });
      spinner.succeed(chalk.green(`Opened ${project.name} in VSCode`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to open VSCode'));
    }
  });

// 프로젝트 실행
program
  .command('run <project>')
  .alias('dev')
  .description('Run a project (npm run dev)')
  .action((projectName) => {
    const project = findProject(projectName);

    if (!project) {
      console.log(chalk.red(`\n  Project "${projectName}" not found.\n`));
      process.exit(1);
    }

    if (!project.hasPackageJson) {
      console.log(chalk.red(`\n  ${project.name} doesn't have a package.json.\n`));
      process.exit(1);
    }

    console.log(chalk.cyan(`\n  Starting ${chalk.bold(project.name)}...\n`));

    try {
      execSync(`wt -d "${project.path}" cmd /k "npm run dev"`, { windowsHide: true });
      console.log(chalk.green(`  Server starting in new terminal window.\n`));
    } catch {
      // Fallback to cmd
      execSync(`start cmd /k "cd /d ${project.path} && npm run dev"`, { windowsHide: true });
      console.log(chalk.green(`  Server starting in new terminal window.\n`));
    }
  });

// 서버 목록
program
  .command('servers')
  .alias('ps')
  .description('List running dev servers')
  .action(() => {
    console.log(chalk.bold.cyan('\n  Running Servers\n'));

    const servers = getRunningServers();

    if (servers.length === 0) {
      console.log(chalk.yellow('  No dev servers running.\n'));
      return;
    }

    servers.forEach((s) => {
      const isNexus = s.port === NEXUS_PORT;
      const color = isNexus ? chalk.magenta : chalk.green;
      const label = isNexus ? ' (Nexus Dashboard)' : '';

      console.log(
        `  ${color('●')} localhost:${chalk.bold(s.port)}${chalk.gray(label)} ${chalk.gray(`PID: ${s.pid}`)}`
      );
    });

    console.log();
  });

// 서버 종료
program
  .command('kill <port>')
  .description('Kill a server by port number')
  .action(async (port) => {
    const portNum = parseInt(port, 10);

    if (portNum === NEXUS_PORT) {
      console.log(chalk.red(`\n  Cannot kill Nexus Dashboard (port ${NEXUS_PORT}).\n`));
      process.exit(1);
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Kill server on port ${port}?`,
      default: false,
    }]);

    if (!confirm) {
      console.log(chalk.gray('\n  Cancelled.\n'));
      return;
    }

    const spinner = ora(`Killing server on port ${port}...`).start();

    try {
      const output = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf-8',
        windowsHide: true,
      });

      const lines = output.split('\n').filter(line => line.includes('LISTENING'));
      if (lines.length > 0) {
        const parts = lines[0].trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        execSync(`taskkill /PID ${pid} /F`, { windowsHide: true });
        spinner.succeed(chalk.green(`Killed server on port ${port}`));
      } else {
        spinner.fail(chalk.yellow(`No server found on port ${port}`));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to kill server'));
    }
  });

// 대시보드 열기
program
  .command('dashboard')
  .alias('web')
  .description('Open Nexus Dashboard in browser')
  .action(() => {
    const spinner = ora('Opening Nexus Dashboard...').start();

    try {
      execSync(`start ${NEXUS_URL}`, { windowsHide: true });
      spinner.succeed(chalk.green('Opened Nexus Dashboard'));
    } catch {
      spinner.fail(chalk.red('Failed to open dashboard'));
    }
  });

// 터미널 열기
program
  .command('terminal <project>')
  .alias('term')
  .description('Open terminal in project directory')
  .action((projectName) => {
    const project = findProject(projectName);

    if (!project) {
      console.log(chalk.red(`\n  Project "${projectName}" not found.\n`));
      process.exit(1);
    }

    try {
      execSync(`wt -d "${project.path}"`, { windowsHide: true });
      console.log(chalk.green(`\n  Opened terminal in ${project.name}\n`));
    } catch {
      execSync(`start cmd /k "cd /d ${project.path}"`, { windowsHide: true });
      console.log(chalk.green(`\n  Opened terminal in ${project.name}\n`));
    }
  });

// 폴더 열기
program
  .command('folder <project>')
  .alias('explorer')
  .description('Open project folder in Explorer')
  .action((projectName) => {
    const project = findProject(projectName);

    if (!project) {
      console.log(chalk.red(`\n  Project "${projectName}" not found.\n`));
      process.exit(1);
    }

    execSync(`explorer "${project.path}"`, { windowsHide: true });
    console.log(chalk.green(`\n  Opened ${project.name} in Explorer\n`));
  });

// 인터랙티브 모드
program
  .command('interactive')
  .alias('i')
  .description('Interactive project selection')
  .action(async () => {
    const projects = scanProjects();

    const { project, action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'project',
        message: 'Select a project:',
        choices: projects.map(p => ({
          name: `${p.hasGit ? '●' : '○'} ${p.name} [${p.framework}]`,
          value: p,
        })),
        pageSize: 15,
      },
      {
        type: 'list',
        name: 'action',
        message: 'What do you want to do?',
        choices: [
          { name: '🚀 Run (npm run dev)', value: 'run' },
          { name: '📂 Open in VSCode', value: 'code' },
          { name: '💻 Open Terminal', value: 'terminal' },
          { name: '📁 Open in Explorer', value: 'explorer' },
          { name: '❌ Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'cancel') {
      console.log(chalk.gray('\n  Cancelled.\n'));
      return;
    }

    const spinner = ora('Working...').start();

    try {
      switch (action) {
        case 'run':
          try {
            execSync(`wt -d "${project.path}" cmd /k "npm run dev"`, { windowsHide: true });
          } catch {
            execSync(`start cmd /k "cd /d ${project.path} && npm run dev"`, { windowsHide: true });
          }
          spinner.succeed(chalk.green('Started dev server'));
          break;

        case 'code':
          execSync(`code "${project.path}"`, { windowsHide: true });
          spinner.succeed(chalk.green('Opened in VSCode'));
          break;

        case 'terminal':
          try {
            execSync(`wt -d "${project.path}"`, { windowsHide: true });
          } catch {
            execSync(`start cmd /k "cd /d ${project.path}"`, { windowsHide: true });
          }
          spinner.succeed(chalk.green('Opened terminal'));
          break;

        case 'explorer':
          execSync(`explorer "${project.path}"`, { windowsHide: true });
          spinner.succeed(chalk.green('Opened in Explorer'));
          break;
      }
    } catch (error) {
      spinner.fail(chalk.red('Action failed'));
    }
  });

// 대시보드 통계
program
  .command('status')
  .alias('st')
  .description('대시보드 통계 표시 (스트릭, 오늘 활동)')
  .action(async () => {
    const spinner = ora('통계를 불러오는 중...').start();
    try {
      const res = await fetch(`${NEXUS_URL}/api/stats`);
      if (!res.ok) throw new Error('대시보드가 실행 중이 아닙니다');
      const data = await res.json();
      spinner.stop();

      console.log();
      console.log(chalk.bold.white('📊 Nexus Dashboard 통계'));
      console.log(chalk.gray('─'.repeat(40)));

      // Streak
      if (data.streak) {
        const streakEmoji = data.streak.current >= 7 ? '🔥' : data.streak.current >= 3 ? '⚡' : '📅';
        console.log(`${streakEmoji} 스트릭: ${chalk.bold.yellow(data.streak.current)}일 연속 (최고: ${data.streak.longest}일)`);
      }

      // Weekly stats
      if (data.stats) {
        console.log(`📝 이번 주: 커밋 ${chalk.bold.green(data.stats.weekCommits)}개, ${chalk.bold.blue(data.stats.weekDays)}일 활동`);
        if (data.stats.weekMinutes > 0) {
          const hours = Math.floor(data.stats.weekMinutes / 60);
          const mins = data.stats.weekMinutes % 60;
          console.log(`⏱  작업 시간: ${hours > 0 ? `${hours}시간 ` : ''}${mins}분`);
        }
      }

      // Badges
      if (data.badges && data.badges.length > 0) {
        console.log(`🏅 뱃지: ${data.badges.length}개 획득`);
      }

      console.log();
    } catch (err) {
      spinner.fail(chalk.red('통계를 불러올 수 없습니다'));
      console.log(chalk.gray('  대시보드가 실행 중인지 확인하세요 (npm run dev)'));
    }
  });

// 기본 명령어 (nexus만 입력했을 때)
program
  .action(() => {
    console.log(chalk.bold.magenta(`
  ╔═══════════════════════════════════════════════╗
  ║              NEXUS DASHBOARD CLI              ║
  ╚═══════════════════════════════════════════════╝
`));
    console.log(chalk.white('  Your personal developer command center\n'));
    console.log(chalk.gray('  Commands:'));
    console.log(chalk.cyan('    nexus list') + chalk.gray('         - List all projects'));
    console.log(chalk.cyan('    nexus status') + chalk.gray('       - Show dashboard stats'));
    console.log(chalk.cyan('    nexus open <name>') + chalk.gray('  - Open project in VSCode'));
    console.log(chalk.cyan('    nexus run <name>') + chalk.gray('   - Run project (npm run dev)'));
    console.log(chalk.cyan('    nexus servers') + chalk.gray('      - List running servers'));
    console.log(chalk.cyan('    nexus kill <port>') + chalk.gray('  - Kill server by port'));
    console.log(chalk.cyan('    nexus dashboard') + chalk.gray('    - Open web dashboard'));
    console.log(chalk.cyan('    nexus interactive') + chalk.gray(' - Interactive mode'));
    console.log(chalk.cyan('    nexus --help') + chalk.gray('       - Show all commands\n'));
  });

program.parse();
