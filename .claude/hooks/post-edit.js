// 파일 수정 후 자동 린트 훅
const { execSync } = require('child_process');
const fs = require('fs');

let input = '';
try {
  input = fs.readFileSync(0, 'utf8'); // stdin
} catch (e) {
  process.exit(0);
}

let data;
try {
  data = JSON.parse(input);
} catch (e) {
  process.exit(0);
}

const filePath = data.tool_input?.file_path || '';

// JS/TS 파일만 린트
if (filePath.match(/\.(js|ts|jsx|tsx)$/)) {
  try {
    execSync(`npx eslint --fix "${filePath}"`, {
      stdio: 'pipe',
      timeout: 10000,
      cwd: process.cwd()
    });
  } catch (e) {
    const output = e.stdout?.toString() || e.stderr?.toString() || '';
    if (output && output.includes('error')) {
      process.stderr.write(`\n[ESLint] ${filePath}\n${output.slice(0, 300)}\n`);
    }
  }
}

process.exit(0);
