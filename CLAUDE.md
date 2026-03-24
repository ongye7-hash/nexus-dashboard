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

## 참고
@AGENTS.md
