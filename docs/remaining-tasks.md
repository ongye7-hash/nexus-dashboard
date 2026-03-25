# 남은 작업 계획

실사용 테스트 전에 계획만 정리. 구현은 실사용 피드백 후 진행.

---

## 1. 빈 catch 블록 정리 (40개)

### 현황
```
grep "catch {" src/app/api/ → 40건
```

### 계획
- 각 catch 블록에 `console.warn('컨텍스트:', error)` 추가
- 사용자에게 노출되는 에러는 한글 메시지로
- 정말 무시해도 되는 것만 `// 의도적 무시: OOO 이유` 주석

### 대상 파일
- ai/route.ts (7개)
- git/route.ts (3개)
- files/route.ts (2개)
- commit-message/route.ts (2개)
- projects/route.ts (2개)
- 기타 API 라우트

### 예상 작업량
- 30분~1시간
- 빌드에 영향 없음

---

## 2. 프로젝트 ID 결정론적 생성

### 현황
```typescript
// projects/route.ts:293 — 매 요청마다 바뀜
id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${projects.length}`
```

### 계획
프로젝트 경로의 해시값으로 변경:
```typescript
import crypto from 'crypto';
const id = `proj-${crypto.createHash('md5').update(fullPath).digest('hex').slice(0, 12)}`;
```

### 영향
- React key가 안정화됨 → 불필요한 리렌더 제거
- gitInfoMap 캐시가 새로고침 후에도 유효

### 예상 작업량
- 10분

---

## 3. 프로젝트 스캔 성능 개선

### 현황
- 동기적 `fs.readdirSync` + `fs.existsSync` × 11 + `execSync('git remote')` × N
- 30개 프로젝트 = 30번 git 명령 실행

### 계획
1단계: git remote 결과를 DB에 캐시 (마지막 확인 시간 저장, 1시간 TTL)
2단계: `getDirectorySize`를 제거하거나 백그라운드로 이동
3단계: `fs.existsSync` 11번 → 한 번에 `readdir` 후 Set으로 체크

### 예상 작업량
- 2~3시간

---

## 4. MorningCodex 데이터 로딩 최적화

### 현황
페이지 로드 시 7~10개 API 요청이 순차/반병렬 발생:
- /api/projects (page.tsx)
- /api/groups (page.tsx)
- /api/git × 6 (MorningCodex)
- /api/processes
- /api/stats
- /api/work-sessions

### 계획
`/api/dashboard` 통합 엔드포인트 생성:
- 프로젝트 목록 + 핀된 프로젝트의 git 정보 + 실행 중 프로세스 + 통계를 한 번에 반환
- 클라이언트 요청 1번으로 줄임

### 예상 작업량
- 2~3시간

---

## 5. execGit 쉘 인터폴레이션 통일

### 현황
```typescript
// git/route.ts:44 — GET에서 사용
return execSync(`git ${command}`, { cwd: ... });
```
POST는 execFileSync로 수정했지만 GET의 execGit은 아직 execSync

### 계획
execGit을 execFileSync 기반으로 변경:
```typescript
function execGit(projectPath: string, ...args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: projectPath, ... }).toString().trim();
  } catch { return null; }
}
```
호출부: `execGit(path, 'rev-parse', '--abbrev-ref', 'HEAD')` 형태로 변경

### 예상 작업량
- 1시간

---

## 6. insights/route.ts branch 인젝션 수정

### 현황
```typescript
execSync(`git rev-list --left-right --count ${branch}...origin/${branch}`, ...)
```

### 계획
execFileSync로 변경:
```typescript
execFileSync('git', ['rev-list', '--left-right', '--count', `${branch}...origin/${branch}`], ...)
```

### 예상 작업량
- 15분

---

## 7. SettingsModal 탭별 분리

### 현황
SettingsModal.tsx가 995줄 (500줄 규칙 위반)

### 계획
탭별 컴포넌트로 분리:
- settings/GitHubTab.tsx
- settings/VPSTab.tsx
- settings/AITab.tsx
- SettingsModal.tsx (쉘만, ~100줄)

### 예상 작업량
- 1시간

---

## 우선순위 (실사용 후)

| 순위 | 작업 | 사용자 영향 | 시간 |
|---|---|---|---|
| 1 | 프로젝트 ID 결정론적 | 리렌더 감소, 캐시 안정 | 10분 |
| 2 | 빈 catch 정리 | 디버깅 편의 | 30분 |
| 3 | execGit + insights 통일 | 보안 일관성 | 1시간 |
| 4 | 스캔 성능 개선 | 로딩 속도 | 2시간 |
| 5 | 대시보드 통합 API | 초기 로딩 속도 | 2시간 |
| 6 | SettingsModal 분리 | 코드 품질 | 1시간 |

**총 예상: 약 7시간**

---

*작성: 2026-03-25*
