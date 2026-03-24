# 현재 진행 상태

## 마지막 작업
- 내장 터미널 (xterm.js + node-pty) 구현 완료 (2026-03-25)

## 현재 상태
- 프로젝트: Nexus Dashboard
- 단계: 핵심 기능 구현 완료, 실사용 테스트 필요

## 완료된 기능
- 프로젝트 스캔/관리/그룹/태그/TODO
- Git 인라인 커밋/푸시, AI 커밋 메시지
- GitHub 연동 (토큰 인증, 레포 동기화, 원클릭 클론)
- 내장 터미널 + Claude Code 세션 (보안: 토큰+Origin+세션제한)
- 통계/히트맵/스트릭/뱃지/주간 리포트
- Morning Codex (알림, Resume, 어제 요약, 빠른 커밋)

## 다음 할 일
- 실사용 테스트 (터미널, GitHub 연동 등)
- 사용자 피드백 기반 개선

## 중요 결정사항
- GitHub: fetch 직접 호출 (octokit 미사용), 토큰은 SQLite 저장
- 터미널: 별도 WebSocket 서버 (포트 8508), instrumentation.ts로 자동 시작
- 보안: execFileSync, 토큰 인증, Origin 체크, 경로 검증
