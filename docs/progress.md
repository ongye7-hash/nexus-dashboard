# 현재 진행 상태

## 완료
- Phase 0~8b: n8n 보안, INFLUX, AI 채팅, 트렌드, 프로젝트 등록/설계/생성
- Chapter 8b: 코드 생성 파이프라인 완성 (템플릿 시스템)
- 링크 분석 MVP: 구현+배포 완료
- 링크 분석 자막 수정: Piped API 1순위 + 다중 fallback 구현 완료

## 링크 분석 자막 — 현재 상태
### 해결한 문제
- VPS 데이터센터 IP에서 YouTube 봇 차단 → Piped API로 우회
- getBasicInfo() → getInfo() 변경 (자막 추출 가능)
- oEmbed 제거 → getInfo() 하나로 통합

### 최종 fallback 체인 (구현 완료, 배포+테스트 대기)
1. Piped API (3개 인스턴스: kavin.rocks, piped.yt, lunar.icu)
2. youtubei.js getInfo() (WEB → TV_EMBEDDED)
3. yt-dlp
4. 제목+설명만 분석

### 커밋 이력
- 05a3eec: getBasicInfo→getInfo, oEmbed 제거
- b0a3331: 다중 클라이언트 + HTML 파싱 fallback
- (다음): Piped API 1순위 구현 — 빌드 성공, push+배포 대기

### 배포 후 테스트
- VPS: `git pull && cd deploy && docker compose -f docker-compose.prod.yml up -d --build`
- 테스트 URL: https://www.youtube.com/watch?v=TJ3uAYxPY5k
- 로그: `docker logs deploy-nexus-1 --tail 80`
- 확인: `[piped] 메타데이터 성공` + `[piped] 자막 성공` 로그 나오는지

## 링크 분석 — 다음 구현 순서
1. ~~자막 추출 수정~~ → 완료
2. 사업성 점수 시스템 (1~100점)
3. "이 아이디어로 프로젝트 생성" 버튼
4. 유사 아이디어 감지
5. 트위터/X 지원

## 방향
- B → C (Nexus로 SaaS 런칭 → Nexus 자체 제품화)

## 운영 정보
- VPS: 146.190.50.42 (2GB RAM + 2GB swap)
- Nexus: https://ongye.org | 최신 커밋: push 대기
- INFLUX: https://www.influx-lab.com
- n8n: https://n8n.ongye.org
