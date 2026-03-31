import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { extractVideoId, getYouTubeData } from '@/lib/youtube';
import { decrypt } from '@/lib/crypto';
import { getSetting } from '@/lib/database';
import crypto from 'crypto';

// ============================================================
// 프롬프트 정의
// ============================================================

const today = () => new Date().toISOString().split('T')[0];

// Step 1: 아이디어 추출 (Haiku — 저렴, 빠름)
const STEP1_PROMPT = (title: string, channel: string, content: string) => `영상 자막을 분석하여 다음을 JSON으로 출력하라. JSON만 출력. 다른 텍스트 금지.

영상: "${title}" (${channel})
자막:
${content.slice(0, 8000)}

{
  "content_summary": "영상 핵심 내용 3줄 요약",
  "business_ideas": [
    { "name": "아이디어명", "one_liner": "한 줄 설명", "keywords": ["시장조사용 키워드1", "키워드2"] }
  ],
  "search_queries": ["시장 규모 조사용 검색 쿼리 5~10개"]
}`;

// Step 2: Perplexity 시장 조사
const STEP2_PROMPT = (ideaName: string, oneLiner: string, keywords: string) => `다음 비즈니스 아이디어에 대해 조사해줘. 반드시 출처 URL을 포함해라. 한국어로 답변.

1. 시장 규모 — TAM(전체), SAM(접근 가능), SOM(1년 내 확보 가능) 각각 수치와 출처
2. 주요 경쟁사 5개 — 이름, 매출/사용자 규모, 핵심 특징, 가격 정책
3. 최근 1년 관련 규제/정책 변화
4. 최근 6개월 관련 뉴스/트렌드

아이디어: ${ideaName} - ${oneLiner}
관련 키워드: ${keywords}`;

// Step 3: 심층 분석 (Opus — 최고 품질)
const STEP3_PROMPT = (title: string, channel: string, transcript: string, step1Result: string, step2Result: string) => `당신은 글로벌 전략 컨설팅펌의 시니어 비즈니스 애널리스트다.
아래 영상 자막과 실시간 시장 조사 데이터를 기반으로, 투자 판단이 가능한 수준의 분석 리포트를 작성하라.
추정치는 반드시 "추정"으로 명시하고, 실제 데이터가 있으면 출처를 밝혀라.
항상 한국어로 작성하라.

오늘 날짜: ${today()}

=== 영상 정보 ===
제목: ${title}
채널: ${channel}

=== 영상 자막 ===
${transcript.slice(0, 50000)}

=== 아이디어 추출 결과 ===
${step1Result}

=== 시장 조사 데이터 (실시간) ===
${step2Result || "시장 조사 데이터 없음 — 학습 데이터 기반으로 최선의 추정치를 제공하되, 추정임을 반드시 명시하라."}

## 리포트 포맷 (반드시 이 순서)

### 1. 핵심 요약 (3줄)

### 2. 크리에이터 신뢰도 평가
- 주장 중 객관적으로 검증된 것 vs 검증 안 된 것
- 생존자 편향 가능성
- "100명이 따라하면 몇 명이 성공하나" 현실적 추정

### 3. 비즈니스 아이디어 (최대 3개)
각 아이디어별:
- 한 줄 설명
- 핵심 수익 메커니즘
- 기존 경쟁사 대비 차별점
- 실행 가능성 점수 (1~10, 근거 필수)

### 4. 수익화 모델
아이디어별 수익화 방법, 예상 ARPU, 과금 구조를 표로 정리.

### 5. 시장 분석
- TAM / SAM / SOM (숫자 + 출처. 출처 없으면 "추정" 명시)
- 경쟁사 비교 표 (5개 이상)
- 진입 장벽 (규제/자본/기술/네트워크 각각 높음/중간/낮음 평가)

### 6. 핵심 리스크 & 실패 시나리오
이 아이디어가 실패하는 가장 현실적인 이유 3가지.
각 리스크별 발생 확률(높음/중간/낮음)과 대응 전략.

### 7. 한국 시장 적용성
- 적용 가능성 (높음/중간/낮음 + 근거)
- 현지화 포인트 3~5개
- 한국 특화 기회 (한국에서만 가능하거나 유리한 점)

### 8. MVP 실행 로드맵
- 추천 MVP 범위
- 필요 기술 스택
- 단계별 타임라인 (주 단위)
- 초기 투자 비용
- 첫 번째 마일스톤 (D+90 목표)`;

// Step 4: 실행 계획 + 사업성 점수 (Sonnet)
const STEP4_PROMPT = (step3Result: string) => `아래 분석 리포트를 기반으로 다음을 출력하라. 한국어로 작성.

=== 분석 리포트 ===
${step3Result.slice(0, 30000)}

## 출력 포맷

먼저 JSON 블록:
---SCORE_JSON---
{
  "business_score": 0~100 사이 정수,
  "breakdown": {
    "market_size": 0~20 사이 정수,
    "competition": 0~20 사이 정수,
    "execution_feasibility": 0~20 사이 정수,
    "revenue_potential": 0~20 사이 정수,
    "risk_level": 0~20 사이 정수
  },
  "verdict": "강력 추천" 또는 "추천" 또는 "검토 필요" 또는 "비추천",
  "one_line": "이 아이디어를 한 줄로 평가"
}
---SCORE_JSON_END---

그 다음 마크다운:

### 실행 가이드
- 이 아이디어를 실행한다면 가장 먼저 할 일 3가지
- 24시간 내에 검증할 수 있는 최소 실험
- 가장 저렴하게 시작하는 방법
- 3개월 내 첫 매출을 만드는 경로

### 자동화 가능 영역
- AI/자동화로 대체 가능한 부분
- 수동으로 해야 하는 핵심 부분

### 유사 성공 사례
- 비슷한 모델로 성공한 실제 서비스/사람

### 태그
(관련 키워드를 JSON 배열로 출력. 예: ["SaaS", "AI", "자동화"])`;

// ============================================================
// Claude API 호출 헬퍼
// ============================================================

async function callClaude(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ============================================================
// Perplexity API 호출
// ============================================================

async function callPerplexity(apiKey: string, prompt: string): Promise<{ text: string; citations: string[] }> {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Perplexity API ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const citations: string[] = data.citations || [];
  return { text, citations };
}

// ============================================================
// DB status 업데이트 헬퍼
// ============================================================

function updateStatus(db: ReturnType<typeof getDb>, id: string, status: string) {
  db.prepare(`UPDATE link_analyses SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
}

// ============================================================
// 백그라운드 분석 — 4단계 체인
// ============================================================

async function analyzeInBackground(id: string, videoId: string, url: string, apiKey: string): Promise<void> {
  const db = getDb();

  try {
    // === 자막 + 메타데이터 추출 ===
    const { metadata, transcript } = await getYouTubeData(videoId);
    const { title, channel, thumbnail, description } = metadata;

    db.prepare(`
      UPDATE link_analyses SET title = ?, channel = ?, thumbnail = ?, status = 'extracting', updated_at = datetime('now') WHERE id = ?
    `).run(title, channel, thumbnail, id);

    const hasTranscript = transcript.method !== 'none' && transcript.text.length > 50;
    const analysisContent = hasTranscript ? transcript.text : `제목: ${title}\n설명: ${description}`;

    if (hasTranscript) {
      db.prepare(`UPDATE link_analyses SET transcript = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(transcript.text, id);
    }

    console.log(`[analyze] ${id}: ${hasTranscript ? `자막 ${transcript.method} (${transcript.text.length}자)` : '제목+설명만 분석'}`);

    // === Step 1: 아이디어 추출 (Haiku) ===
    updateStatus(db, id, 'step1_keywords');
    console.log(`[analyze] ${id}: Step 1 — 아이디어 추출 (Haiku)`);

    const step1Raw = await callClaude(apiKey, 'claude-haiku-4-5-20251001', STEP1_PROMPT(title, channel, analysisContent), 2000);

    // JSON 파싱 (코드블록 안에 있을 수 있음)
    let step1Data: { content_summary?: string; business_ideas?: Array<{ name: string; one_liner: string; keywords: string[] }>; search_queries?: string[] } = {};
    try {
      const jsonMatch = step1Raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) step1Data = JSON.parse(jsonMatch[0]);
    } catch {
      console.warn(`[analyze] ${id}: Step 1 JSON 파싱 실패, 원문 사용`);
    }

    console.log(`[analyze] ${id}: Step 1 완료 — 아이디어 ${step1Data.business_ideas?.length || 0}개`);

    // === Step 2: Perplexity 시장 조사 (키 있을 때만) ===
    let step2Result = '';
    let searchData: { citations: string[]; responses: string[] } | null = null;

    const encryptedPerplexityKey = getSetting('perplexity_api_key');
    if (encryptedPerplexityKey) {
      updateStatus(db, id, 'step2_research');
      console.log(`[analyze] ${id}: Step 2 — 시장 조사 (Perplexity)`);

      let perplexityKey: string;
      try {
        perplexityKey = decrypt(encryptedPerplexityKey);
      } catch {
        console.warn(`[analyze] ${id}: Perplexity 키 복호화 실패, Step 2 스킵`);
        perplexityKey = '';
      }

      if (perplexityKey) {
        const ideas = (step1Data.business_ideas || []).slice(0, 3);
        const allCitations: string[] = [];
        const responses: string[] = [];

        for (const idea of ideas) {
          try {
            const { text, citations } = await callPerplexity(
              perplexityKey,
              STEP2_PROMPT(idea.name, idea.one_liner, idea.keywords.join(', '))
            );
            responses.push(`### ${idea.name}\n${text}`);
            allCitations.push(...citations);
          } catch (err) {
            console.warn(`[analyze] ${id}: Perplexity 호출 실패 (${idea.name}):`, (err as Error).message);
            responses.push(`### ${idea.name}\n시장 조사 실패: ${(err as Error).message}`);
          }
        }

        step2Result = responses.join('\n\n');
        searchData = { citations: [...new Set(allCitations)], responses };
        console.log(`[analyze] ${id}: Step 2 완료 — ${ideas.length}개 조사, 출처 ${allCitations.length}개`);
      }
    } else {
      console.log(`[analyze] ${id}: Step 2 스킵 — Perplexity 키 없음`);
    }

    // search_data DB 저장
    if (searchData) {
      db.prepare(`UPDATE link_analyses SET search_data = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(searchData), id);
    }

    // === Step 3: 심층 분석 (Opus) ===
    updateStatus(db, id, 'step3_analysis');
    console.log(`[analyze] ${id}: Step 3 — 심층 분석 (Opus)`);

    let step3Result: string;
    try {
      step3Result = await callClaude(
        apiKey,
        'claude-opus-4-6',
        STEP3_PROMPT(title, channel, analysisContent, step1Raw, step2Result),
        32000
      );
    } catch (err) {
      // Opus 실패 → Sonnet fallback
      console.warn(`[analyze] ${id}: Opus 실패, Sonnet fallback:`, (err as Error).message);
      step3Result = await callClaude(
        apiKey,
        'claude-sonnet-4-6',
        STEP3_PROMPT(title, channel, analysisContent, step1Raw, step2Result),
        32000
      );
    }

    console.log(`[analyze] ${id}: Step 3 완료 — ${step3Result.length}자`);

    // === Step 4: 실행 계획 + 사업성 점수 (Sonnet) ===
    updateStatus(db, id, 'step4_scoring');
    console.log(`[analyze] ${id}: Step 4 — 점수 산출 (Sonnet)`);

    const step4Result = await callClaude(apiKey, 'claude-sonnet-4-6', STEP4_PROMPT(step3Result), 4000);

    // SCORE_JSON 파싱
    let businessScore: number | null = null;
    let scoreBreakdown: string | null = null;
    let verdict: string | null = null;

    const scoreMatch = step4Result.match(/---SCORE_JSON---([\s\S]*?)---SCORE_JSON_END---/);
    if (scoreMatch) {
      try {
        const scoreData = JSON.parse(scoreMatch[1].trim());
        businessScore = Math.min(100, Math.max(0, parseInt(String(scoreData.business_score)) || 0));
        scoreBreakdown = JSON.stringify(scoreData.breakdown || {});
        verdict = scoreData.verdict || null;
      } catch {
        console.warn(`[analyze] ${id}: SCORE_JSON 파싱 실패`);
      }
    }

    // Step 4 마크다운 (SCORE_JSON 블록 제거)
    const step4Markdown = step4Result.replace(/---SCORE_JSON---[\s\S]*?---SCORE_JSON_END---/, '').trim();

    // 태그 추출 (Step 4 결과에서)
    let tags: string | null = null;
    const tagMatch = step4Markdown.match(/\[[\s\S]*?\]/);
    if (tagMatch) {
      try {
        const parsed = JSON.parse(tagMatch[0]);
        if (Array.isArray(parsed)) tags = JSON.stringify(parsed);
      } catch { /* 무시 */ }
    }

    // 최종 분석 = Step 3 + Step 4
    const finalAnalysis = `${step3Result}\n\n---\n\n${step4Markdown}`;

    console.log(`[analyze] ${id}: Step 4 완료 — 점수 ${businessScore}, 판정 ${verdict}`);

    // === DB 저장 ===
    db.prepare(`
      UPDATE link_analyses
      SET analysis = ?, tags = ?, business_score = ?, score_breakdown = ?, verdict = ?, status = 'done', updated_at = datetime('now')
      WHERE id = ?
    `).run(finalAnalysis, tags, businessScore, scoreBreakdown, verdict, id);

    console.log(`[analyze] ${id}: 완료 — ${finalAnalysis.length}자, 점수 ${businessScore}/100`);
  } catch (err) {
    console.error(`[analyze] ${id}: 실패 —`, err);
    updateStatus(db, id, 'failed');
  }
}

// ============================================================
// POST — 링크 분석 실행
// ============================================================

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

    const db = getDb();
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO link_analyses (id, url, video_id, title, channel, thumbnail, status, created_at, updated_at)
      VALUES (?, ?, ?, '추출 중...', '', '', 'pending', datetime('now'), datetime('now'))
    `).run(id, trimmedUrl, videoId);

    analyzeInBackground(id, videoId, trimmedUrl, apiKey);

    return NextResponse.json({ id, status: 'pending', videoId });
  } catch (err) {
    return NextResponse.json({ error: `요청 처리 실패: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 });
  }
}

// ============================================================
// GET — 분석 히스토리 조회
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const id = searchParams.get('id');
    if (id && !/^[0-9a-f-]{36}$/.test(id)) {
      return NextResponse.json({ error: '잘못된 id 형식' }, { status: 400 });
    }
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0'));
    const sort = searchParams.get('sort');

    const db = getDb();

    if (id) {
      const row = db.prepare(`
        SELECT id, url, video_id, title, channel, thumbnail, analysis, tags, business_score, score_breakdown, verdict, search_data, status, created_at, updated_at
        FROM link_analyses WHERE id = ?
      `).get(id);
      if (!row) return NextResponse.json({ error: '분석을 찾을 수 없습니다.' }, { status: 404 });
      return NextResponse.json({ analysis: row });
    }

    const orderBy = sort === 'score' ? 'business_score DESC NULLS LAST' : 'created_at DESC';
    const analyses = db.prepare(`
      SELECT id, url, video_id, title, channel, thumbnail, tags, business_score, verdict, status, created_at, updated_at
      FROM link_analyses
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = (db.prepare('SELECT COUNT(*) as cnt FROM link_analyses').get() as { cnt: number }).cnt;

    return NextResponse.json({ analyses, total });
  } catch (err) {
    return NextResponse.json({ error: `조회 실패: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 });
  }
}

// ============================================================
// DELETE — 분석 삭제
// ============================================================

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
