# 현재 진행 상태

## 마지막 작업
- F-1 인증 + F-2 Docker 배포 완료 (2026-03-26)

## 완료된 묶음
- Phase 0~3: 핵심 기능 전체 구현
- GitHub 연동 + 보안 리뷰
- 내장 터미널 + Claude Code + 보안
- VPS 원격 관리 + 보안 리뷰
- AI 어시스턴트 (Ollama→Claude API 전환)
- 심층 감사 20건 수정 + 리팩토링 4건
- 묶음 A~E: VPS 통합, 스캔 설정, GitHub Issue, PM2/Docker, 테스트/백업
- F-1: JWT 인증 (bcrypt + 세션 + Rate Limiting + proxy.ts)
- F-2: Docker 배포 (standalone + 멀티스테이지 + nginx + WebSocket 프록시)

## 현재 상태
- 빌드 성공, 타입 에러 0개, 테스트 78개 통과
- 코드: ~19,000줄, API 35개+, 컴포넌트 30개+

## 다음 할 일 (F-3)
- AI 채팅 패널 (프로젝트 컨텍스트 대화)

## 배포 정보
- VPS: 146.190.50.42 (DigitalOcean 2GB)
- 구성: Docker(앱) + nginx(호스트) + certbot(HTTPS)
- 도메인 연결 필요 (Let's Encrypt는 IP 인증서 미지원)

## 중요 결정사항
- execSync 완전 제거 → execFileSync만 사용
- 토큰/키는 AES-256-GCM 암호화, export에서 제외
- 인증: JWT(jose) + bcrypt, proxy.ts(Node.js 런타임)
- Docker: standalone 출력 + 멀티스테이지 빌드
- WebSocket: 로컬=직접, 배포=nginx /ws/terminal 프록시
