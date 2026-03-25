# Nexus Dashboard 심층 감사 보고서

작성일: 2026-03-25 | 감사 범위: 전체 코드베이스 (15,212줄, 23개 API, 25개 컴포넌트)

---

## 발견된 문제 요약

| 심각도 | 건수 | 요약 |
|---|---|---|
| Critical | 2건 | 커맨드 인젝션 (actions, git commit) |
| High | 6건 | 경로 검증 누락, SSE 메모리 누수, SSH key_file, GitHub 토큰 평문 |
| Medium | 7건 | 입력 검증 부족, 서버 바인딩, 기능 미연결 |
| Low/Info | 5건 | 데이터 정합성, UX 흐름 끊김 |

---

## 1. 코드 품질 감사

### Critical-1: actions/route.ts — 커맨드 인젝션 (경로)
- **파일:** src/app/api/actions/route.ts:49,54,62,74
- **문제:** `path`를 쉘 문자열에 직접 삽입. `validateProjectPath` 호출 없음. `start cmd` 변형은 따옴표도 없음
- **공격:** `path = 'C:\Users\user\Desktop\proj" & calc.exe & echo "'`
- **수정:** `validateProjectPath(path)` 추가 + `execFileSync`로 인수 배열 분리

### Critical-2: git/route.ts — 커맨드 인젝션 (커밋 메시지)
- **파일:** src/app/api/git/route.ts:207
- **문제:** `message.replace(/"/g, '\\"')` — 쌍따옴표만 이스케이프. 백틱, `$()`, 개행 등 미처리
- **수정:** `execFileSync('git', ['commit', '-m', message], { cwd })` — 쉘 우회

### High-1: files/route.ts — 경로 검증 없음
- **파일:** src/app/api/files/route.ts
- **문제:** `searchParams.get('path')`를 그대로 `fs.readdirSync`에 전달. 서버 전체 파일 구조 노출 가능
- **수정:** `validateProjectPath` 추가

### High-2: readme/route.ts — 경로 검증 없음
- **파일:** src/app/api/readme/route.ts
- **문제:** 임의 경로의 README.md 읽기 가능
- **수정:** `validateProjectPath` 추가

### High-3: terminal-server.ts — SSH key_file 경로 제한 누락
- **파일:** src/lib/terminal-server.ts:217
- **문제:** `vps/route.ts`와 `vps/status/route.ts`에는 `.ssh` 폴더 제한이 있지만, terminal-server에는 없음
- **수정:** 동일한 `.ssh` 경로 제한 적용

### High-4: watch/route.ts — SSE 리스너 누수
- **파일:** src/app/api/watch/route.ts:27-29
- **문제:** `abort` 이벤트 리스너가 제거되지 않음. `cancel()` 핸들러 없음. 재연결이 반복되면 메모리 증가
- **수정:** `removeEventListener` + ReadableStream `cancel()` 핸들러 추가

### High-5: processes/route.ts — PID 인젝션
- **파일:** src/app/api/processes/route.ts:144
- **문제:** `pid`를 검증 없이 `taskkill /PID ${pid} /F`에 삽입. `pid = "1 & del /f C:\\"`로 임의 명령 실행
- **수정:** `parseInt` 검증 + `execFileSync('taskkill', ['/PID', String(safePid), '/F'])`

### High-6: github/auth/route.ts — GitHub 토큰 평문 저장
- **파일:** src/app/api/github/auth/route.ts:62
- **문제:** `setSetting('github_token', token)` — `encrypt()` 호출 없음. Claude API 키는 암호화하면서 GitHub 토큰은 평문
- **수정:** `setSetting('github_token', encrypt(token))` + 읽을 때 `decrypt()`

### Medium-1: search/route.ts — 쿼리/경로 인젝션
- **파일:** src/app/api/search/route.ts:89
- **문제:** `query`와 `projectPath`를 쉘 문자열에 직접 삽입
- **수정:** `execFileSync('rg', [...flags, query, projectPath])`

### Medium-2: morning-routine/route.ts — 경로 검증 없음
- **파일:** src/app/api/morning-routine/route.ts:104
- **문제:** `project.path`를 검증 없이 `git pull`/`npm install`의 cwd로 사용
- **수정:** 루프 내에서 `validateProjectPath(project.path)` 호출

### Medium-3: terminal-server.ts — 서버 바인딩
- **파일:** src/lib/terminal-server.ts:55
- **문제:** `new WebSocketServer({ port: PORT })` — 0.0.0.0 바인딩 (LAN 노출)
- **수정:** `new WebSocketServer({ host: '127.0.0.1', port: PORT })`

### Medium-4: terminal-server.ts — cwd 검증 불완전
- **파일:** src/lib/terminal-server.ts:99-102
- **문제:** `fs.existsSync(cwd)`만 확인 — `C:\Windows\System32`도 유효한 cwd가 됨
- **수정:** `validateProjectPath(cwd)` 적용

### Medium-5: processes/route.ts — 포트 인젝션
- **파일:** src/app/api/processes/route.ts:152
- **문제:** `port`를 검증 없이 `findstr :${port}`에 삽입
- **수정:** 정수 검증 + JS에서 필터링

---

## 2. 데이터 정합성

### Medium-6: 고아 레코드 축적
- **파일:** src/lib/database.ts
- **문제:** `project_todos`와 `work_sessions`에 FK 제약 없음. 프로젝트 폴더 삭제 시 레코드 영구 잔류
- **수정:** 프로젝트 스캔 시 존재하지 않는 경로의 레코드 정리

### Low-1: 포트 매핑 미정리
- **파일:** src/app/api/processes/route.ts
- **문제:** 프로세스가 충돌 종료 시 `port_mappings` 정리 안 됨. 잘못된 프로젝트명 표시 원인
- **수정:** netstat 스캔 후 미사용 포트 매핑 자동 삭제

---

## 3. 실사용 테스트 결과

### 터미널 (xterm.js + node-pty)
- **상태:** 서버 실행 중 (포트 8508 LISTENING)
- **모듈:** node-pty, ws 모두 정상 로드
- **결과:** PASS

### SSH (ssh2)
- **상태:** 모듈 정상 로드
- **실제 연결:** 미테스트 (자격증명 필요)
- **결과:** 모듈 수준 PASS

### Claude Code 파이프
- **상태:** `claude` CLI 설치됨 (npm global)
- **문제:** `cat review.md | claude` — `cat`은 Git Bash에서만 존재. 터미널 서버가 `powershell.exe`를 기본 쉘로 사용하므로 **cmd.exe/PowerShell에서는 `cat`이 동작하지 않음**
- **수정:** `type` 명령 사용 (Windows 네이티브) 또는 PowerShell의 `Get-Content`
- **결과:** CONDITIONAL FAIL

### GitHub 연동
- **상태:** API 구조 완전, 토큰 저장/검증/동기화 흐름 정상
- **문제:** 토큰 평문 저장 (High-6 참조)
- **결과:** FUNCTIONAL (보안 수정 필요)

---

## 4. 기능 간 연결 점검

### GitHub 레포 ↔ 로컬 프로젝트 매칭
- **상태:** 작동함. `git remote get-url origin`에서 GitHub URL 추출 → DB 매칭
- **경로 변경 시:** 로컬 폴더명이 바뀌면 `local_path`가 불일치 → 매칭 끊어짐
- **수정:** 프로젝트 스캔 시 remote URL 기반으로 매번 재매칭

### VPS 프로젝트 ↔ 대시보드 통합
- **상태:** 미구현. VPS 프로젝트는 대시보드 프로젝트 목록에 전혀 표시 안 됨
- projects/route.ts에 VPS 관련 코드 없음

### AI 어시스턴트 ↔ GitHub/VPS
- **GitHub-only 프로젝트:** `projectPath`가 URL이라 `fs.readFileSync` 실패 → 빈 컨텍스트로 분석
- **VPS 프로젝트:** 원격 파일 읽기 불가 → 분석 불가
- **수정:** GitHub은 API로 코드 가져오기, VPS는 SSH exec로 코드 가져오기 (장기 과제)

### MorningCodex ↔ VPS
- **상태:** 미연결. VPS 서버 상태가 Codex 뷰에 표시 안 됨

---

## 5. 사용자 흐름 검증

### 아침 루틴 흐름
```
브라우저 열기 → Codex 뷰 로드 → 인사말 + 날짜 ✅
    → 어제 요약 (커밋/프로젝트/시간) ✅
    → 스트릭 표시 (Day N) ✅
    → 알림 (커밋 안 한 변경, 푸시 안 한 커밋) ✅
    → Morning Routine 클릭 → git pull + npm install ✅
    → 프로젝트 카드 클릭 → 모달 열림 ✅
    → 내장 터미널 / Claude Code 열기 ✅
    → 빠른 커밋 (Codex에서 인라인) ✅
    → 통계 확인 (T키) ✅
```

### 끊기는 구간

**Bug-1: 작업 세션 항상 비어있음**
- **파일:** src/components/MorningCodex.tsx:271
- **문제:** `data.sessions`를 읽지만 API는 `data.activeSessions`를 반환
- **영향:** 프로젝트별 작업 타이머가 Codex에 표시 안 됨

**Bug-2: 빠른 커밋 후 활동 미기록**
- **파일:** src/components/MorningCodex.tsx (quick commit handler)
- **문제:** 커밋 성공 후 `/api/stats` POST를 호출하지 않음
- **영향:** Codex에서 한 커밋이 히트맵/스트릭에 반영 안 됨

---

## 전체 이슈 우선순위 정리

### 즉시 수정 필요 (배포 차단)
| # | 심각도 | 파일 | 문제 |
|---|---|---|---|
| 1 | Critical | actions/route.ts | 경로 커맨드 인젝션 |
| 2 | Critical | git/route.ts:207 | 커밋 메시지 커맨드 인젝션 |
| 3 | High | files/route.ts | 경로 검증 없음 (파일 구조 노출) |
| 4 | High | readme/route.ts | 경로 검증 없음 |
| 5 | High | processes/route.ts:144 | PID 인젝션 |
| 6 | High | github/auth/route.ts:62 | GitHub 토큰 평문 저장 |

### 빠른 시일 내 수정
| # | 심각도 | 파일 | 문제 |
|---|---|---|---|
| 7 | High | terminal-server.ts:217 | SSH key_file 경로 미제한 |
| 8 | High | watch/route.ts:27 | SSE 리스너 누수 |
| 9 | Medium | search/route.ts:89 | 쿼리 인젝션 |
| 10 | Medium | morning-routine/route.ts | 경로 검증 없음 |
| 11 | Medium | terminal-server.ts:55 | WebSocket 0.0.0.0 바인딩 |
| 12 | Medium | terminal-server.ts:99 | cwd 검증 불완전 |
| 13 | Medium | processes/route.ts:152 | 포트 인젝션 |

### 기능 개선
| # | 심각도 | 위치 | 문제 |
|---|---|---|---|
| 14 | Bug | MorningCodex.tsx:271 | `data.sessions` → `data.activeSessions` |
| 15 | Bug | MorningCodex.tsx (커밋) | 빠른 커밋 후 활동 미기록 |
| 16 | Bug | AIAssistant.tsx:167 | `cat` 명령이 PowerShell에서 안 됨 |
| 17 | Missing | projects/route.ts | VPS 프로젝트 미통합 |
| 18 | Missing | MorningCodex.tsx | VPS 서버 상태 미표시 |
| 19 | Low | database.ts | 고아 레코드 정리 없음 |
| 20 | Low | processes/route.ts | 포트 매핑 미정리 |

---

## 수정 방안 요약

| 패턴 | 적용 대상 | 방법 |
|---|---|---|
| `execSync` → `execFileSync` | actions, git, processes, search | 인수 배열로 쉘 우회 |
| `validateProjectPath` 추가 | files, readme, morning-routine, terminal cwd | import 후 핸들러 시작점에 추가 |
| `encrypt()`/`decrypt()` | github/auth | GitHub 토큰 저장/조회 시 암호화 |
| `parseInt` 검증 | processes (pid, port) | 숫자가 아니면 400 반환 |
| `host: '127.0.0.1'` | terminal-server WebSocketServer | LAN 노출 차단 |
| `cat` → `type` | AIAssistant Claude Code 파이프 | Windows 네이티브 명령 사용 |
| `data.sessions` → `data.activeSessions` | MorningCodex | 응답 키 이름 수정 |
| 커밋 후 stats POST | MorningCodex quick commit | 커밋 성공 후 recordActivity 호출 |

---

*감사 수행: Claude Opus 4.6 (3개 에이전트 병렬 분석) | 2026-03-25*
