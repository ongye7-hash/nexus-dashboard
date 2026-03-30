# 현재 진행 상태

## 완료 (2026-03-30)
- Phase 0: n8n 보안 (HTTPS, nginx, UFW, 포트 차단)
- Phase 1: INFLUX 블로그 CRUD API + Supabase 마이그레이션 201개 + ISR
- Phase 2: n8n 블로그 자동화 (매일 09:00, Sonnet 4.6, 텔레그램 알림, 키워드 50개)
- Phase 3: SEO 스텁 보강 상위 4개 + 배치 스크립트 + 구글 로그인 수정 + 사이트맵 제출
- Phase 4: Project Registry (DB 확장 + deploy_targets + 등록 API + 뱃지 + 보안 5건)
  - INFLUX(Vercel) + n8n(Docker) + Nexus(Docker) 등록 완료
- Phase 5a: AI 채팅 패널 (SSE 스트리밍, 세션 관리, 마크다운)
- Phase 5b: 프로젝트 컨텍스트 자동 주입 + 드롭다운
- Phase 5c: Tool Use 읽기 도구 6개 (project_list, http_health_check, vps_status, docker_logs, n8n_executions, git_status)
- Phase 5d: 쓰기 도구 3개 + 사용자 승인 (service_restart, deploy_trigger, n8n_workflow_toggle)
- n8n 설정: N8N_TRUST_PROXY=true, N8N_DEFAULT_BINARY_DATA_MODE=filesystem
- n8n API Key 생성 + Nexus settings 저장 + 설정 UI 추가
- VPS: 2GB swap 추가 (/swapfile, fstab 등록)

## 다음 세션
- Chapter 6: 트렌드 피드 + 프로젝트 연계 자동 추천
- Chapter 7: 새 프로젝트 생성 UI
- Chapter 8: 자율 프로젝트 실행 엔진
- INFLUX: 배치 스크립트 보완 (HTML 태그 제거 후 카운트), 키 재발행
- 신기능 아이디어: 자동 테스팅 + 백테스팅 + 개선 추천

## 운영 정보
- VPS: 146.190.50.42 (DigitalOcean, 2GB RAM + 2GB swap)
- Nexus: https://ongye.org (Docker, /root/deploy/)
- INFLUX: https://www.influx-lab.com (Vercel + Supabase)
- n8n: https://n8n.ongye.org (Docker, nginx 프록시)
- Claude 모델: claude-sonnet-4-6 (채팅 + 도구)
- 최신 커밋: 8421970 (master)
