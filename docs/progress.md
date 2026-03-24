# 현재 진행 상태

## 마지막 작업
- GitHub 연동 기능 추가 + 코드 리뷰 이슈 5건 수정 (2026-03-25)

## 현재 상태
- 프로젝트: Nexus Dashboard
- 단계: 기능 확장 중

## 다음 할 일
- xterm.js 기반 내장 터미널 추가
- 프로젝트 클릭 시 대시보드 안에서 Claude Code 세션이 바로 열리는 기능

## 중요 결정사항
- GitHub 연동: fetch 직접 호출 (octokit 미사용), 토큰은 SQLite 저장
- 보안: clone 시 execFileSync 사용 (커맨드 인젝션 방지)
