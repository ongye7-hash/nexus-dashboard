# 현재 진행 상태

## 마지막 작업
- 묶음 E 완료 + 리뷰 5건 수정 (2026-03-26)

## 완료된 묶음
- Phase 0~3: 핵심 기능 전체 구현
- GitHub 연동 + 보안 리뷰
- 내장 터미널 + Claude Code + 보안
- VPS 원격 관리 + 보안 리뷰
- AI 어시스턴트 (Ollama→Claude API 전환)
- 심층 감사 20건 수정
- MorningCodex 분리 (1270줄→453줄)
- database.ts 분리 (8개 도메인 파일)
- 설정 통합 (SettingsModal 탭별 분리)
- remaining-tasks 6건 완료
- 묶음 A: VPS 통합 (프로젝트 스캔/배포/Quick Actions/로그)
- 묶음 B: 스캔 경로 설정화, 히트맵 import, 브라우저 알림
- 묶음 C: GitHub Issue→TODO, Actions 상태
- 묶음 D: progress.md 표시, PM2/Docker, CLI 동기화
- 묶음 E: 테스트(39개), DB 백업, 에러 로깅, 설정 export/import

## 현재 상태
- 빌드 성공, 타입 에러 0개, 테스트 39개 통과
- 코드: ~18,000줄, API 30개+, 컴포넌트 30개+

## 다음 할 일 (묶음 F)
- 인증 시스템 (로컬 PIN 또는 패스워드)
- 웹 배포 준비 (Docker 컨테이너화)
- AI 채팅 패널 (프로젝트 컨텍스트 대화)

## 중요 결정사항
- execSync 완전 제거 → execFileSync만 사용
- 토큰/키는 AES-256-GCM 암호화, export에서 제외
- DB 백업: VACUUM INTO (WAL 안전)
- 로거: 비동기 버퍼 + 재진입 방지
- VPS SSH: 명령 화이트리스트 + 경로 새니타이징
