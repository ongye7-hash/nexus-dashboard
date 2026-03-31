// YouTube 자막/메타데이터 추출 유틸리티
// Fallback 체인: HTML 직접 파싱 → Piped API → youtubei.js → yt-dlp

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
  method: 'html-scrape' | 'piped' | 'youtubei' | 'ytdlp' | 'metadata-only' | 'none';
}

export interface YouTubeData {
  metadata: VideoMetadata;
  transcript: TranscriptResult;
}

const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

const EMPTY_METADATA: VideoMetadata = {
  title: '', channel: '', thumbnail: '', description: '', viewCount: '', publishDate: '',
};

const DEFAULT_TRANSCRIPT: TranscriptResult = { text: '', language: '', method: 'none' };

// ============================================================
// 1순위: YouTube HTML 직접 파싱 — 외부 서비스 의존 없음
// ============================================================

/**
 * YouTube 페이지 HTML에서 메타데이터 + 자막 트랙 URL 추출
 * OG 태그 → 메타데이터, ytInitialPlayerResponse → captionTracks → 자막
 */
async function getFromHtmlScrape(videoId: string): Promise<YouTubeData | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      console.warn(`[html-scrape] HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    // === 메타데이터: OG 태그 ===
    const ogTitle = extractMetaContent(html, 'og:title');
    const ogDesc = extractMetaContent(html, 'og:description');

    // === ytInitialPlayerResponse에서 상세 정보 ===
    let channel = '';
    let viewCount = '';
    let publishDate = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let captionTracks: any[] = [];

    const playerJson = extractJsonVar(html, 'ytInitialPlayerResponse');
    if (playerJson) {
      channel = playerJson.videoDetails?.author || '';
      viewCount = playerJson.videoDetails?.viewCount || '';
      publishDate = playerJson.microformat?.playerMicroformatRenderer?.publishDate || '';

      // captionTracks 추출
      captionTracks = playerJson.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    }

    // channel fallback
    if (!channel) {
      const channelMatch = html.match(/"ownerChannelName":"([^"]*)"/)
        || html.match(/<link\s+itemprop="name"\s+content="([^"]*)"/)
        || html.match(/"author":"([^"]*)"/);
      channel = channelMatch?.[1] || '';
    }

    const title = ogTitle || '';
    if (!title) {
      console.warn('[html-scrape] 메타데이터 추출 실패 (제목 없음)');
      return null;
    }

    const metadata: VideoMetadata = {
      title: decodeHtmlEntities(title),
      channel: decodeHtmlEntities(channel),
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      description: decodeHtmlEntities(ogDesc || ''),
      viewCount,
      publishDate,
    };
    console.log(`[html-scrape] 메타데이터 성공: "${metadata.title}" / ${metadata.channel}`);

    // === 자막: captionTracks의 baseUrl로 직접 fetch ===
    let transcript: TranscriptResult = { ...DEFAULT_TRANSCRIPT };

    if (captionTracks.length > 0) {
      console.log(`[html-scrape] captionTracks ${captionTracks.length}개 발견`);

      // 한국어 → 영어 → 첫 번째
      const track = captionTracks.find((t: { languageCode?: string }) => t.languageCode === 'ko')
        || captionTracks.find((t: { languageCode?: string }) => t.languageCode === 'en')
        || captionTracks[0];

      if (track?.baseUrl) {
        try {
          // json3 포맷으로 요청
          const subUrl = track.baseUrl + (track.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
          const subRes = await fetch(subUrl, {
            signal: AbortSignal.timeout(10000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            },
          });

          if (subRes.ok) {
            const subText = await subRes.text();
            const contentType = subRes.headers.get('content-type') || '';
            const parsed = parseSubtitleText(subText, contentType);
            if (parsed.length > 50) {
              transcript = { text: parsed, language: track.languageCode || 'auto', method: 'html-scrape' };
              console.log(`[html-scrape] 자막 성공 (${track.languageCode}): ${parsed.length}자`);
            }
          } else {
            console.warn(`[html-scrape] 자막 다운로드 HTTP ${subRes.status}`);
          }
        } catch (subErr) {
          console.warn(`[html-scrape] 자막 다운로드 실패:`, (subErr as Error).message);
        }
      }
    } else {
      console.log('[html-scrape] captionTracks 없음');
    }

    return { metadata, transcript };
  } catch (err) {
    console.warn('[html-scrape] 실패:', (err as Error).message);
    return null;
  }
}

/**
 * HTML에서 meta property 값 추출
 */
function extractMetaContent(html: string, property: string): string {
  const regex = new RegExp(
    `<meta\\s+(?:property|name)="${property}"\\s+content="([^"]*)"` +
    `|<meta\\s+content="([^"]*)"\\s+(?:property|name)="${property}"`
  );
  const match = html.match(regex);
  return match?.[1] || match?.[2] || '';
}

/**
 * HTML에서 var XXX = {...}; 형태의 JSON 변수 추출
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJsonVar(html: string, varName: string): any | null {
  // var ytInitialPlayerResponse = {...};
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*`);
  const match = html.match(regex);
  if (!match || match.index === undefined) return null;

  const startIdx = match.index + match[0].length;
  // JSON 객체의 끝을 찾기 위해 중괄호 카운팅
  let depth = 0;
  let endIdx = startIdx;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < html.length && i < startIdx + 500000; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }

  if (depth !== 0) return null;

  try {
    return JSON.parse(html.slice(startIdx, endIdx));
  } catch {
    console.warn(`[html-scrape] ${varName} JSON 파싱 실패`);
    return null;
  }
}

/**
 * HTML 엔티티 디코딩
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

// ============================================================
// 2순위: Piped API — 공개 인스턴스 (불안정할 수 있음)
// ============================================================

const PIPED_INSTANCES = [
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.private.coffee',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.kavin.rocks',
];

async function getFromPiped(videoId: string): Promise<YouTubeData | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) {
        console.warn(`[piped] ${instance} HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();

      const metadata: VideoMetadata = {
        title: data.title || '',
        channel: data.uploaderName || data.uploader || '',
        thumbnail: data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        description: data.description || '',
        viewCount: String(data.views || ''),
        publishDate: data.uploadDate || '',
      };

      if (!metadata.title) {
        console.warn(`[piped] ${instance} 메타데이터 빈 값`);
        continue;
      }
      console.log(`[piped] ${instance} 메타데이터 성공: "${metadata.title}"`);

      let transcript: TranscriptResult = { ...DEFAULT_TRANSCRIPT };

      if (data.subtitles && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
        const sub = data.subtitles.find((s: { code?: string }) => s.code === 'ko')
          || data.subtitles.find((s: { code?: string }) => s.code === 'en')
          || data.subtitles[0];

        if (sub?.url) {
          try {
            const subRes = await fetch(sub.url, { signal: AbortSignal.timeout(10000) });
            if (subRes.ok) {
              const subText = await subRes.text();
              const contentType = subRes.headers.get('content-type') || '';
              const parsed = parseSubtitleText(subText, contentType);
              if (parsed.length > 50) {
                transcript = { text: parsed, language: sub.code || 'auto', method: 'piped' };
                console.log(`[piped] 자막 성공 (${sub.code}): ${parsed.length}자`);
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

// ============================================================
// 자막 포맷 파서 (TTML, VTT, SRT, JSON3)
// ============================================================

function parseSubtitleText(raw: string, contentType: string): string {
  const trimmed = raw.trim();

  if (contentType.includes('xml') || contentType.includes('ttml') || trimmed.startsWith('<?xml') || trimmed.startsWith('<tt')) {
    return parseTTML(trimmed);
  }
  if (contentType.includes('vtt') || trimmed.startsWith('WEBVTT')) {
    return parseVTT(trimmed);
  }
  if (/^\d+\s*\n/.test(trimmed)) {
    return parseSRT(trimmed);
  }
  if (trimmed.startsWith('{')) {
    return parseJSON3(trimmed);
  }

  return trimmed
    .replace(/<[^>]+>/g, '')
    .replace(/\d{2}:\d{2}[\d:.,\->\s]+/g, '')
    .replace(/\n{2,}/g, ' ')
    .trim();
}

function parseTTML(xml: string): string {
  const segments: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const text = match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .trim();
    if (text) segments.push(text);
  }
  return segments.join(' ');
}

function parseVTT(vtt: string): string {
  return vtt
    .replace(/WEBVTT[\s\S]*?\n\n/, '')
    .replace(/\d{2}:\d{2}[\d:.,\->\s]+\n/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function parseSRT(srt: string): string {
  return srt
    .replace(/^\d+\s*$/gm, '')
    .replace(/\d{2}:\d{2}[\d:.,\->\s]+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function parseJSON3(raw: string): string {
  try {
    const json = JSON.parse(raw);
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
  return '';
}

// ============================================================
// 3순위: youtubei.js — 로컬(가정용 IP)에서 동작
// ============================================================

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

async function getFromInnertube(videoId: string): Promise<YouTubeData | null> {
  const clientConfigs: Array<{ name: string; opts: Parameters<typeof Innertube.create>[0] }> = [
    { name: 'WEB', opts: { generate_session_locally: true, retrieve_player: false } },
    { name: 'TV_EMBEDDED', opts: { client_type: ClientType.TV_EMBEDDED, generate_session_locally: true, retrieve_player: false } },
  ];

  let metadata: VideoMetadata = { ...EMPTY_METADATA };
  let transcript: TranscriptResult = { ...DEFAULT_TRANSCRIPT };

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

  if (metadata.title) {
    return { metadata, transcript };
  }
  return null;
}

// ============================================================
// 4순위: yt-dlp (Docker에 설치된 경우)
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
        const text = parseJSON3(subs[lang].data);
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

  return { ...DEFAULT_TRANSCRIPT };
}

// ============================================================
// 통합 함수 — 전체 fallback 체인
// ============================================================

/**
 * YouTube 데이터 통합 추출
 *
 * Fallback 체인:
 * 1. HTML 직접 파싱 (YouTube 페이지 fetch → OG태그 + captionTracks)
 * 2. Piped API (공개 인스턴스, 불안정할 수 있음)
 * 3. youtubei.js (로컬 IP에서 동작)
 * 4. yt-dlp (로컬 IP에서 동작)
 */
export async function getYouTubeData(videoId: string): Promise<YouTubeData> {
  if (!SAFE_VIDEO_ID.test(videoId)) {
    console.warn('[youtube] 유효하지 않은 videoId:', videoId);
    return {
      metadata: { title: '제목 없음', channel: '채널 없음', thumbnail: '', description: '', viewCount: '', publishDate: '' },
      transcript: { ...DEFAULT_TRANSCRIPT },
    };
  }

  const defaultMeta: VideoMetadata = {
    title: '제목 없음', channel: '채널 없음',
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    description: '', viewCount: '', publishDate: '',
  };

  // === 1순위: YouTube HTML 직접 파싱 ===
  console.log(`[youtube] ${videoId}: HTML 직접 파싱 시도`);
  const htmlResult = await getFromHtmlScrape(videoId);
  if (htmlResult && htmlResult.metadata.title) {
    if (htmlResult.transcript.method !== 'none') {
      return htmlResult; // 메타데이터 + 자막 둘 다 성공
    }
    console.log('[youtube] HTML 메타데이터만 성공, 자막 fallback 시도');
  }

  // === 2순위: Piped API ===
  console.log(`[youtube] ${videoId}: Piped API 시도`);
  const pipedResult = await getFromPiped(videoId);

  // === 3순위: youtubei.js ===
  console.log(`[youtube] ${videoId}: youtubei.js 시도`);
  const innertubeResult = await getFromInnertube(videoId);

  // 결과 병합 — 첫 성공 결과 사용 (null 안전)
  const metadata = [htmlResult, pipedResult, innertubeResult]
    .find(r => r && r.metadata.title)?.metadata || defaultMeta;

  let transcript = [htmlResult, pipedResult, innertubeResult]
    .find(r => r && r.transcript.method !== 'none')?.transcript || { ...DEFAULT_TRANSCRIPT };

  // === 4순위: yt-dlp (자막만 없을 때) ===
  if (transcript.method === 'none') {
    console.log(`[youtube] ${videoId}: yt-dlp fallback 시도`);
    transcript = await getTranscriptViaYtDlp(videoId);
  }

  return { metadata, transcript };
}
