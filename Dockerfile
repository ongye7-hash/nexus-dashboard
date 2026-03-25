# ============================================
# Stage 1: 의존성 설치 + 네이티브 모듈 빌드
# ============================================
FROM node:20-slim AS deps

# 네이티브 모듈 빌드에 필요한 패키지
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ============================================
# Stage 2: Next.js 빌드
# ============================================
FROM node:20-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# standalone 빌드
RUN npm run build

# ============================================
# Stage 3: 프로덕션 실행 (최소 이미지)
# ============================================
FROM node:20-slim AS runner

# node-pty 런타임 의존성 (PTY spawn에 필요)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8507

# standalone 출력 복사
COPY --from=builder /app/.next/standalone ./
# 정적 파일 복사
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# node-pty는 serverExternalPackages라 standalone에 미포함 → 별도 설치
RUN npm init -y > /dev/null 2>&1 && \
    npm install node-pty@1.1.0 && \
    rm package.json package-lock.json

# .nexus-data 디렉토리 (volume 마운트 포인트)
RUN mkdir -p /app/.nexus-data

# Next.js (8507) + WebSocket 터미널 (8508)
EXPOSE 8507 8508

# standalone server.js의 경로가 Windows 빌드 구조를 반영할 수 있으므로 확인 필요
# standalone 빌드에서 실제 server.js 위치를 사용
CMD ["node", "server.js"]
