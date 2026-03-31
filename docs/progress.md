# 현재 진행 상태

## 완료
- Phase 0~8b: n8n 보안, INFLUX, AI 채팅, 트렌드, 프로젝트 등록/설계/생성
- Chapter 8b: 코드 생성 파이프라인 완성 (템플릿 시스템)
- 링크 분석 MVP: 구현+배포 완료
- 링크 분석 자막: residential proxy + caption_tracks 직접 fetch로 해결

## 링크 분석 — 현재 상태 (자막 성공!)
- 프록시: Webshare residential proxy 동작 확인
- 메타데이터: getInfo()로 제목/채널/설명 추출 성공
- 자막: caption_tracks base_url → proxiedFetch로 json3 직접 다운로드 성공
- 분석: max_tokens 32000, 오늘 날짜 프롬프트 주입

### 남은 이슈
- 자막 209자로 짧음 — json3 파싱에서 일부 세그먼트만 추출된 가능성
- 다음 배포에서 다른 영상으로 자막 길이 확인 필요

## 링크 분석 — 다음 구현 순서
1. ~~자막 추출 수정~~ → 완료
2. 자막 길이 확인 (전체 자막 가져오는지)
3. 사업성 점수 시스템 (1~100점)
4. "이 아이디어로 프로젝트 생성" 버튼
5. 유사 아이디어 감지
6. 트위터/X 지원

## 방향
- B → C (Nexus로 SaaS 런칭 → Nexus 자체 제품화)

## 운영 정보
- VPS: 146.190.50.42 (2GB RAM + 2GB swap)
- Nexus: https://ongye.org | 최신: 9e9262e
- INFLUX: https://www.influx-lab.com
- n8n: https://n8n.ongye.org
- Proxy: Webshare residential (settings DB 암호화 저장)
