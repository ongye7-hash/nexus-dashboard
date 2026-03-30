import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/database';
import { decrypt } from '@/lib/crypto';

// Bearer 토큰 검증 (n8n 서버 간 통신용)
function verifyBearerToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.slice(7);
  const encryptedKey = getSetting('trends_api_key');
  if (!encryptedKey) return false;

  try {
    const storedKey = decrypt(encryptedKey);
    return token === storedKey;
  } catch {
    return false;
  }
}

// POST — n8n에서 트렌드 데이터 수신
export async function POST(request: NextRequest) {
  try {
    if (!verifyBearerToken(request)) {
      return NextResponse.json({ error: '인증 실패. trends_api_key를 확인하세요.' }, { status: 401 });
    }

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items 배열이 필요합니다' }, { status: 400 });
    }

    if (items.length > 50) {
      return NextResponse.json({ error: '한 번에 최대 50개까지만 가능합니다' }, { status: 400 });
    }

    const db = getDb();
    const insertStmt = db.prepare(`
      INSERT INTO trends (id, title, summary, source, source_url, tags, relevance, score, published_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const upsertStmt = db.prepare(`
      INSERT INTO trends (id, title, summary, source, source_url, tags, relevance, score, published_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(source_url) DO UPDATE SET
        title = excluded.title, summary = excluded.summary, tags = excluded.tags,
        relevance = excluded.relevance, score = excluded.score
    `);

    let count = 0;
    for (const item of items) {
      if (!item.title || !item.summary || !item.source) continue;

      const id = crypto.randomUUID();
      const rawUrl = item.sourceUrl ? String(item.sourceUrl).slice(0, 1000) : null;
      const safeUrl = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
      const params = [
        id,
        String(item.title).slice(0, 500),
        String(item.summary).slice(0, 2000),
        String(item.source).slice(0, 50),
        safeUrl,
        item.tags ? String(item.tags).slice(0, 500) : null,
        item.relevance ? JSON.stringify(item.relevance) : null,
        parseInt(String(item.score)) || 0,
        item.publishedAt ? String(item.publishedAt) : null,
      ];

      // source_url이 있으면 upsert (중복 방지), 없으면 단순 INSERT
      (safeUrl ? upsertStmt : insertStmt).run(...params);
      count++;
    }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('Trends POST error:', error);
    return NextResponse.json({ error: '트렌드 저장 실패' }, { status: 500 });
  }
}

// GET — 트렌드 조회 (JWT 인증은 proxy.ts가 처리)
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const rawDate = params.get('date') || '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : new Date().toISOString().slice(0, 10);
    const minScore = parseInt(params.get('minScore') || '0') || 0;
    const limit = Math.min(parseInt(params.get('limit') || '20') || 20, 100);

    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM trends
      WHERE date(created_at) = ? AND score >= ?
      ORDER BY score DESC, created_at DESC
      LIMIT ?
    `).all(date, minScore, limit);

    return NextResponse.json({ trends: rows, date, count: rows.length });
  } catch (error) {
    console.error('Trends GET error:', error);
    return NextResponse.json({ error: '트렌드 조회 실패' }, { status: 500 });
  }
}
