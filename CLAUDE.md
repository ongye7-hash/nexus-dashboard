# Nexus Dashboard

개발자용 로컬 프로젝트 관리 대시보드. 내 PC의 모든 개발 프로젝트를 한눈에 보고 관리한다.

## 기술 스택
- **Framework**: Next.js 16 (Turbopack)
- **UI**: React 19, Tailwind CSS 4, Framer Motion
- **DB**: SQLite (better-sqlite3) - 로컬 저장
- **Icons**: Lucide React
- **기타**: date-fns, react-markdown, cmdk (커맨드 팔레트)

## 프로젝트 구조
```
src/
├── app/
│   ├── api/           # API 라우트 (git, scan, stats, audit 등)
│   └── page.tsx       # 메인 대시보드
├── components/        # UI 컴포넌트
├── hooks/             # 커스텀 훅 (useStats, useEasterEggs 등)
└── lib/
    └── db.ts          # SQLite 데이터베이스
cli/                   # CLI 도구 (별도 npm 프로젝트)
```

## 빌드 & 실행
```bash
npm install          # 의존성 설치
npm run dev          # 개발 서버 (localhost:8507)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint 실행
```

## 핵심 기능
- 프로젝트 스캔 (Desktop 폴더 내 package.json 있는 폴더)
- Git 연동 (브랜치, 커밋, 상태 표시)
- 프로젝트 실행/열기 (npm run dev, VSCode, 폴더)
- 통계 (활동 히트맵, 스트릭, 뱃지)
- AI 커밋 메시지 생성 (Ollama 연동)
- 의존성 보안 감사 (npm audit)

## 코딩 규칙

### 반드시 지켜야 할 것
- 새 API 라우트는 `src/app/api/` 하위에 `route.ts`로 생성
- 컴포넌트는 'use client' 명시 (클라이언트 컴포넌트일 경우)
- 파일 시스템/쉘 명령어는 API 라우트에서만 실행 (클라이언트 X)
- Windows 경로 사용 (`C:\Users\...`)

### 절대 하지 마라
- 기존 작동하는 코드 구조 임의 변경 금지
- package.json 의존성 임의 추가/삭제 금지
- .env 파일이나 시크릿 하드코딩 금지
- 사용자 확인 없이 파일 대량 삭제 금지

## 컨텍스트 보존 규칙
- 작업이 10턴 이상 길어지면, 현재까지의 결정사항/진행상태를 docs/progress.md에 자동 저장하라
- 사용자가 중요하다고 강조한 내용은 즉시 해당 문서에 기록하라
- 새 작업 시작 전에 docs/progress.md를 먼저 읽어라
- compact 전에 핵심 상태를 파일로 먼저 저장하라
- docs/progress.md는 "현재 상태"만 유지하라. 히스토리를 쌓지 마라.
- 항상 최신 상태로 덮어쓰고, 50줄을 넘기지 마라.

## 커밋 전 리뷰 규칙
- 커밋 전에 리뷰 필요 여부를 판단하라
- **리뷰 필요** → "리뷰 필요 — 이유: ~~" 먼저 말하고 리뷰 실행
  - DB 스키마 변경
  - 인증/보안 관련 수정
  - 기존 API 동작 변경
  - 프론트엔드 구조 변경 (라우팅, 사이드바 등)
  - 5개 이상 파일 동시 수정
- **리뷰 불필요** → 바로 커밋+푸시
  - 새 파일 생성만
  - 버그 수정, 오타
  - 스타일/디자인 변경
  - 기존 기능에 영향 없는 추가

## 참고
@AGENTS.md
