import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { extractVideoId, getVideoMetadata, getTranscript } from '@/lib/youtube';
import { decrypt } from '@/lib/crypto';
import { getSetting } from '@/lib/database';
import crypto from 'crypto';

const ANALYSIS_PROMPT = (title: string, channel: string, transcript: string) => `너는 비즈니스 분석가이자 스타트업 전략가다.
아래 YouTube 영상의 자막을 분석하고, 비즈니스 관점에서 인사이트를 추출하라.
항상 한국어로 작성하라.

영상 정보:
- 제목: ${title}
- 채널: ${channel}

자막:
${transcript.slice(0, 8000)}

아래 형식으로 분석하라:

## 핵심 요약
(영상 내용 3줄 요약)

## 비즈니스 아이디어
(이 영상에서 추출 가능한 비즈니스 아이디어 1~3개. 각각 구체적으로.)

## 수익화 모델
(각 아이디어의 수익화 방법 — 구독, 광고, 커미션, 라이선스 등)

## 시장 분석
- 시장 규모 추정
- 주요 경쟁사
- 진입 장벽

## 한국 시장 적용성
(한국에서 이 아이디어가 먹히는지, 현지화 포인트)

## MVP 실행 로드맵
- 필요 기술 스택
- 예상 개발 기간
- 초기 투자 비용
- 첫 번째 마일스톤

## 태그
(관련 키워드를 JSON 배열로 출력. 예: ["SaaS", "AI", "자동화"])`;

// POST — 링크 분석 실행
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 });
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return NextResponse.json({ error: '유효한 URL 형식이 아닙니다.' }, { status: 400 });
    }
    const videoId = extractVideoId(trimmedUrl);
    if (!videoId) {
      return NextResponse.json({ error: '유효한 YouTube URL이 아닙니다.' }, { status: 400 });
    }

    const encryptedKey = getSetting('claude_api_key');
    if (!encryptedKey) {
      return NextResponse.json({ error: 'Claude API 키가 설정되지 않았습니다.' }, { status: 401 });
    }
    let apiKey: string;
    try { apiKey = decrypt(encryptedKey); } catch { return NextResponse.json({ error: 'API 키 복호화 실패' }, { status: 500 }); }

    // 메타데이터 추출
    const metadata = await getVideoMetadata(videoId);
    const title = metadata?.title || '제목 없음';
    const channel = metadata?.channel || '채널 없음';
    const thumbnail = metadata?.thumbnail || '';

    // 자막 추출
    const transcript = await getTranscript(videoId);
    if (transcript.type === 'none' || !transcript.text) {
      return NextResponse.json({ error: '이 영상에서 자막을 추출할 수 없습니다.' }, { status: 422 });
    }

    // DB에 pending 상태로 저장
    const db = getDb();
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO link_analyses (id, url, video_id, title, channel, thumbnail, transcript, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'analyzing', datetime('now'), datetime('now'))
    `).run(id, url.trim(), videoId, title, channel, thumbnail, transcript.text);

    // Claude API 분석 (동기 — MVP에서는 기다림)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages: [{ role: 'user', content: ANALYSIS_PROMPT(title, channel, transcript.text) }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Claude API ${res.status}`);
      }

      const data = await res.json();
      const analysis = data.content?.[0]?.text || '';

      // 태그 추출 (분석 결과에서 JSON 배열 파싱)
      let tags: string | null = null;
      const tagMatch = analysis.match(/\[[\s\S]*?\]/);
      if (tagMatch) {
        try {
          const parsed = JSON.parse(tagMatch[0]);
          if (Array.isArray(parsed)) tags = JSON.stringify(parsed);
        } catch { /* 태그 파싱 실패 무시 */ }
      }

      db.prepare(`
        UPDATE link_analyses SET analysis = ?, tags = ?, status = 'done', updated_at = datetime('now') WHERE id = ?
      `).run(analysis, tags, id);

      return NextResponse.json({
        id, title, channel, thumbnail, status: 'done',
        tags: tags ? JSON.parse(tags) : [],
      });
    } catch (err) {
      db.prepare("UPDATE link_analyses SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(id);
      return NextResponse.json({
        error: `분석 실패: ${err instanceof Error ? err.message : 'unknown'}`,
        id, title, status: 'failed',
      }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ error: `요청 처리 실패: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 });
  }
}

// GET — 분석 히스토리 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const id = searchParams.get('id');

    const db = getDb();

    // 단일 분석 조회 (transcript 제외)
    if (id) {
      const row = db.prepare(`
        SELECT id, url, video_id, title, channel, thumbnail, analysis, tags, status, created_at, updated_at
        FROM link_analyses WHERE id = ?
      `).get(id);
      if (!row) return NextResponse.json({ error: '분석을 찾을 수 없습니다.' }, { status: 404 });
      return NextResponse.json({ analysis: row });
    }

    // 목록 조회 (analysis 본문 제외 — 목록에선 불필요)
    const analyses = db.prepare(`
      SELECT id, url, video_id, title, channel, thumbnail, tags, status, created_at, updated_at
      FROM link_analyses
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = (db.prepare('SELECT COUNT(*) as cnt FROM link_analyses').get() as { cnt: number }).cnt;

    return NextResponse.json({ analyses, total });
  } catch (err) {
    return NextResponse.json({ error: `조회 실패: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 });
  }
}

// DELETE — 분석 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const db = getDb();
    const result = db.prepare('DELETE FROM link_analyses WHERE id = ?').run(id);
    if (result.changes === 0) {
      return NextResponse.json({ error: '해당 분석을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: `삭제 실패: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 });
  }
}
