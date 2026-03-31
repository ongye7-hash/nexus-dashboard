// YouTube 자막/메타데이터 추출 유틸리티
// Fallback 체인: Piped API → youtubei.js → yt-dlp → 제목+설명만

import { Innertube, ClientType } from 'youtubei.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * URL에서 YouTube video ID 추출
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export interface VideoMetadata {
  title: string;
  channel: string;
  thumbnail: string;
  description: string;
  viewCount: string;
  publishDate: string;
}

export interface TranscriptResult {
  text: string;
  language: string;
  method: 'piped' | 'youtubei' | 'ytdlp' | 'metadata-only' | 'none';
}

export interface YouTubeData {
  metadata: VideoMetadata;
  transcript: TranscriptResult;
}

const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

const EMPTY_METADATA: VideoMetadata = {
  title: '', channel: '', thumbnail: '', description: '', viewCount: '', publishDate: '',
};

// ============================================================
// 1순위: Piped API — 데이터센터 IP 차단 없음, 키 불필요
// ============================================================

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://piped-api.lunar.icu',
];

/**
 * Piped API에서 메타데이터 + 자막 추출
 * 여러 인스턴스를 순회하며 첫 성공 결과 반환
 */
async function getFromPiped(videoId: string): Promise<YouTubeData | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) {
        console.warn(`[piped] ${instance} HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();

      // 메타데이터
      const metadata: VideoMetadata = {
        title: data.title || '',
        channel: data.uploaderName || data.uploader || '',
        thumbnail: data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        description: data.description || '',
        viewCount: String(data.views || ''),
        publishDate: data.uploadDate || '',
      };

      if (!metadata.title) {
        console.warn(`[piped] ${instance} 메타데이터 빈 값, 다음 인스턴스 시도`);
        continue;
      }
      console.log(`[piped] ${instance} 메타데이터 성공: "${metadata.title}"`);

      // 자막 추출
      let transcript: TranscriptResult = { text: '', language: '', method: 'none' };

      if (data.subtitles && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
        // 한국어 → 영어 → 첫 번째 자막
        const sub = data.subtitles.find((s: { code?: string }) => s.code === 'ko')
          || data.subtitles.find((s: { code?: string }) => s.code === 'en')
          || data.subtitles[0];

        if (sub?.url) {
          try {
            const subRes = await fetch(sub.url, {
              signal: AbortSignal.timeout(10000),
            });
            if (subRes.ok) {
              const subText = await subRes.text();
              const contentType = subRes.headers.get('content-type') || '';
              const parsed = parseSubtitleText(subText, contentType);
              if (parsed.length > 50) {
                transcript = { text: parsed, language: sub.code || 'auto', method: 'piped' };
                console.log(`[piped] 자막 성공 (${sub.code || 'auto'}): ${parsed.length}자`);
              }
            }
          } catch (subErr) {
            console.warn(`[piped] 자막 다운로드 실패:`, (subErr as Error).message);
          }
        }
      }

      return { metadata, transcript };
    } catch (err) {
      console.warn(`[piped] ${instance} 실패:`, (err as Error).message);
      continue;
    }
  }

  console.warn('[piped] 모든 인스턴스 실패');
  return null;
}

/**
 * 자막 텍스트 파싱 — TTML(XML), VTT, SRT 모두 지원
 */
function parseSubtitleText(raw: string, contentType: string): string {
  const trimmed = raw.trim();

  // TTML/XML 포맷 (Piped에서 주로 반환)
  if (contentType.includes('xml') || contentType.includes('ttml') || trimmed.startsWith('<?xml') || trimmed.startsWith('<tt')) {
    return parseTTML(trimmed);
  }

  // VTT 포맷
  if (contentType.includes('vtt') || trimmed.startsWith('WEBVTT')) {
    return parseVTT(trimmed);
  }

  // SRT 포맷 (숫자로 시작)
  if (/^\d+\s*\n/.test(trimmed)) {
    return parseSRT(trimmed);
  }

  // JSON3 포맷
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      if (json.events) {
        return (json.events as Array<{ segs?: Array<{ utf8?: string }> }>)
          .flatMap(e => e.segs?.map(s => s.utf8 || '') || [])
          .join('')
          .replace(/\n/g, ' ')
          .trim();
      }
    } catch {
      // JSON 아님
    }
  }

  // 알 수 없는 포맷 — 태그/타임코드 제거 후 반환
  return trimmed
    .replace(/<[^>]+>/g, '')
    .replace(/\d{2}:\d{2}[\d:.,\->\s]+/g, '')
    .replace(/\n{2,}/g, ' ')
    .trim();
}

/**
 * TTML(XML) 자막 파싱 — <p> 태그에서 텍스트 추출
 */
function parseTTML(xml: string): string {
  // <p> 태그 내 텍스트 추출 (중첩 <span> 포함)
  const segments: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const text = match[1]
      .replace(/<[^>]+>/g, '') // 내부 태그 제거
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (text) segments.push(text);
  }
  return segments.join(' ');
}

/**
 * VTT 자막 파싱
 */
function parseVTT(vtt: string): string {
  return vtt
    .replace(/WEBVTT[\s\S]*?\n\n/, '') // 헤더 제거
    .replace(/\d{2}:\d{2}[\d:.,\->\s]+\n/g, '') // 타임코드 제거
    .replace(/<[^>]+>/g, '') // HTML 태그 제거
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

/**
 * SRT 자막 파싱
 */
function parseSRT(srt: string): string {
  return srt
    .replace(/^\d+\s*$/gm, '') // 순번 제거
    .replace(/\d{2}:\d{2}[\d:.,\->\s]+/g, '') // 타임코드 제거
    .replace(/<[^>]+>/g, '') // HTML 태그 제거
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

// ============================================================
// 2순위: youtubei.js — 로컬(가정용 IP)에서는 잘 동작
// ============================================================

/**
 * youtubei.js getInfo()에서 자막 텍스트 추출
 */
async function extractTranscriptFromInfo(info: Awaited<ReturnType<Innertube['getInfo']>>): Promise<TranscriptResult | null> {
  try {
    const transcriptData = await info.getTranscript();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = transcriptData as any;
    if (data?.transcript?.content?.body?.initial_segments) {
      const segments = data.transcript.content.body.initial_segments;
      const text = segments
        .map((s: unknown) => {
          const seg = s as { snippet?: { text?: string } };
          return seg.snippet?.text || '';
        })
        .filter(Boolean)
        .join(' ');
      if (text.length > 50) {
        return { text, language: 'auto', method: 'youtubei' };
      }
    }
  } catch (err) {
    console.warn('[youtube] getTranscript() 실패:', (err as Error).message || err);
  }
  return null;
}

/**
 * youtubei.js getInfo()에서 메타데이터 추출
 */
function extractMetadataFromInfo(info: Awaited<ReturnType<Innertube['getInfo']>>, videoId: string): VideoMetadata {
  return {
    title: info.basic_info.title || '',
    channel: info.basic_info.channel?.name || info.basic_info.author || '',
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    description: info.basic_info.short_description || '',
    viewCount: String(info.basic_info.view_count || ''),
    publishDate: info.basic_info.start_timestamp?.toISOString() || '',
  };
}

/**
 * youtubei.js로 메타데이터 + 자막 추출 (다중 클라이언트)
 */
async function getFromInnertube(videoId: string): Promise<YouTubeData | null> {
  const clientConfigs: Array<{ name: string; opts: Parameters<typeof Innertube.create>[0] }> = [
    { name: 'WEB', opts: { generate_session_locally: true, retrieve_player: false } },
    { name: 'TV_EMBEDDED', opts: { client_type: ClientType.TV_EMBEDDED, generate_session_locally: true, retrieve_player: false } },
  ];

  let metadata: VideoMetadata = { ...EMPTY_METADATA };
  let transcript: TranscriptResult = { text: '', language: '', method: 'none' };

  for (const { name, opts } of clientConfigs) {
    try {
      const yt = await Innertube.create(opts);
      const info = await yt.getInfo(videoId);

      const meta = extractMetadataFromInfo(info, videoId);
      if (meta.title && !metadata.title) {
        metadata = meta;
        console.log(`[youtube] ${name} 메타데이터 성공: "${metadata.title}"`);
      }

      if (transcript.method === 'none') {
        const transcriptResult = await extractTranscriptFromInfo(info);
        if (transcriptResult) {
          transcript = transcriptResult;
          console.log(`[youtube] ${name} 자막 성공: ${transcript.text.length}자`);
        }
      }

      if (metadata.title && transcript.method !== 'none') {
        return { metadata, transcript };
      }
    } catch (err) {
      console.warn(`[youtube] ${name} 실패:`, (err as Error).message || err);
    }
  }

  // 메타데이터만이라도 있으면 반환
  if (metadata.title) {
    return { metadata, transcript };
  }

  return null;
}

// ============================================================
// 3순위: yt-dlp (Docker에 설치된 경우)
// ============================================================

async function getTranscriptViaYtDlp(videoId: string): Promise<TranscriptResult> {
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--write-auto-sub', '--sub-lang', 'ko,en',
      '--skip-download', '--sub-format', 'json3',
      '--print-json', '--no-warnings',
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });

    const data = JSON.parse(stdout);
    const subs = data.requested_subtitles;
    if (subs) {
      const lang = subs.ko ? 'ko' : subs.en ? 'en' : Object.keys(subs)[0];
      if (lang && subs[lang]?.data) {
        const json3 = JSON.parse(subs[lang].data);
        const text = (json3.events || [])
          .flatMap((e: Record<string, unknown>) => {
            const segs = e.segs as Array<{ utf8?: string }> | undefined;
            return segs?.map(s => s.utf8 || '') || [];
          })
          .join('')
          .replace(/\n/g, ' ')
          .trim();
        if (text.length > 50) {
          return { text, language: lang, method: 'ytdlp' };
        }
      }
    }

    if (data.subtitles || data.automatic_captions) {
      const caps = { ...data.subtitles, ...data.automatic_captions };
      const lang = caps.ko ? 'ko' : caps.en ? 'en' : Object.keys(caps)[0];
      if (lang && caps[lang]?.[0]?.url) {
        const subRes = await fetch(caps[lang][0].url);
        if (subRes.ok) {
          const subText = await subRes.text();
          const cleanText = parseVTT(subText);
          if (cleanText.length > 50) {
            return { text: cleanText, language: lang, method: 'ytdlp' };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[youtube] yt-dlp 실패:', (err as Error).message || err);
  }

  return { text: '', language: '', method: 'none' };
}

// ============================================================
// 통합 함수 — 전체 fallback 체인
// ============================================================

/**
 * YouTube 데이터 통합 추출
 *
 * Fallback 체인:
 * 1. Piped API (3개 인스턴스, 데이터센터 IP 문제 없음)
 * 2. youtubei.js (로컬 IP에서 동작)
 * 3. yt-dlp (로컬 IP에서 동작)
 * 4. 제목+설명만으로 분석 (최후)
 */
export async function getYouTubeData(videoId: string): Promise<YouTubeData> {
  if (!SAFE_VIDEO_ID.test(videoId)) {
    console.warn('[youtube] 유효하지 않은 videoId:', videoId);
    return {
      metadata: { title: '제목 없음', channel: '채널 없음', thumbnail: '', description: '', viewCount: '', publishDate: '' },
      transcript: { text: '', language: '', method: 'none' },
    };
  }

  // === 1순위: Piped API ===
  console.log(`[youtube] ${videoId}: Piped API 시도`);
  const pipedResult = await getFromPiped(videoId);
  if (pipedResult && pipedResult.metadata.title) {
    // Piped에서 자막까지 성공하면 바로 반환
    if (pipedResult.transcript.method !== 'none') {
      return pipedResult;
    }
    // 메타데이터만 성공 — 자막은 다음 단계에서 시도
    console.log('[youtube] Piped 메타데이터만 성공, 자막 fallback 시도');
  }

  // === 2순위: youtubei.js (로컬에서 동작) ===
  console.log(`[youtube] ${videoId}: youtubei.js 시도`);
  const innertubeResult = await getFromInnertube(videoId);

  // 결과 병합: 메타데이터는 가장 먼저 성공한 것, 자막도 마찬가지
  const metadata = pipedResult?.metadata.title
    ? pipedResult.metadata
    : innertubeResult?.metadata || { title: '제목 없음', channel: '채널 없음', thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, description: '', viewCount: '', publishDate: '' };

  let transcript = pipedResult?.transcript.method !== 'none'
    ? pipedResult!.transcript
    : innertubeResult?.transcript || { text: '', language: '', method: 'none' as const };

  // === 3순위: yt-dlp (자막만 없을 때) ===
  if (transcript.method === 'none') {
    console.log(`[youtube] ${videoId}: yt-dlp fallback 시도`);
    transcript = await getTranscriptViaYtDlp(videoId);
  }

  return { metadata, transcript };
}
