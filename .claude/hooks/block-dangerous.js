// 위험한 명령어 차단 훅
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

const cmd = data.tool_input?.command || '';

const dangerous = [
  /rm\s+-rf\s+[\/~]/i,           // rm -rf / 같은 거
  /del\s+\/s\s+\/q\s+c:\\/i,     // Windows 전체 삭제
  /format\s+[a-z]:/i,            // 디스크 포맷
  /drop\s+database/i,            // DB 삭제
  /truncate\s+table/i,           // 테이블 비우기
  />\s*\/dev\/sda/i,             // 디스크 직접 쓰기
  /mkfs\./i,                     // 파일시스템 생성
  /dd\s+if=.*of=\/dev/i,         // dd로 디스크 쓰기
];

for (const pattern of dangerous) {
  if (pattern.test(cmd)) {
    console.log(JSON.stringify({
      decision: "block",
      reason: `[BLOCKED] 위험한 명령어 감지: ${cmd.substring(0, 50)}...`
    }));
    process.exit(0);
  }
}

// 차단하지 않음
process.exit(0);
