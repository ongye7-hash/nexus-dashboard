// YouTube 자막/메타데이터 추출
// proxy 있으면(VPS) → ProxyAgent 경유, 없으면(로컬) → 직접 fetch
// 단일 경로: Innertube getInfo() → 메타데이터 + 자막

import { Innertube } from 'youtubei.js';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getSetting } from '@/lib/database';
import { decrypt } from '@/lib/crypto';

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
  method: 'youtubei' | 'none';
}

export interface YouTubeData {
  metadata: VideoMetadata;
  transcript: TranscriptResult;
}

const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

// ============================================================
// Proxy fetch 생성
// ============================================================

/**
 * settings DB에서 프록시 URL을 읽어 proxied fetch 생성
 * 프록시 없으면 undefined 반환 (기본 fetch 사용)
 */
function createProxiedFetch(): typeof fetch | undefined {
  const encrypted = getSetting('youtube_proxy_url');
  if (!encrypted) return undefined;

  let proxyUrl: string;
  try {
    proxyUrl = decrypt(encrypted);
  } catch {
    console.warn('[youtube] 프록시 URL 복호화 실패');
    return undefined;
  }

  console.log(`[youtube] 프록시 사용: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`);
  const agent = new ProxyAgent(proxyUrl);

  return ((input: string | URL | Request, init?: RequestInit) => {
    // undici.fetch는 Request 객체를 직접 못 받음 — URL 문자열로 변환
    if (input instanceof Request) {
      const headers: Record<string, string> = {};
      input.headers.forEach((v, k) => { headers[k] = v; });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return undiciFetch(input.url as any, {
        method: input.method,
        headers,
        body: input.body as any,
        ...((init || {}) as any),
        dispatcher: agent,
      } as any);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return undiciFetch(input as any, {
      ...((init || {}) as any),
      dispatcher: agent,
    } as any);
  }) as unknown as typeof fetch;
}

// ============================================================
// 메인 함수
// ============================================================

/**
 * YouTube 데이터 추출 — getInfo() 단일 경로
 * proxy 설정 시 residential IP 경유, 로컬에서는 직접 연결
 */
export async function getYouTubeData(videoId: string): Promise<YouTubeData> {
  const defaultMeta: VideoMetadata = {
    title: '제목 없음', channel: '채널 없음',
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    description: '', viewCount: '', publishDate: '',
  };
  const defaultTranscript: TranscriptResult = { text: '', language: '', method: 'none' };

  if (!SAFE_VIDEO_ID.test(videoId)) {
    console.warn('[youtube] 유효하지 않은 videoId:', videoId);
    return { metadata: defaultMeta, transcript: defaultTranscript };
  }

  try {
    const proxiedFetch = createProxiedFetch();

    const opts: Parameters<typeof Innertube.create>[0] = {
      generate_session_locally: true,
    };
    if (proxiedFetch) {
      opts.fetch = proxiedFetch;
    }

    const yt = await Innertube.create(opts);
    const info = await yt.getInfo(videoId);

    // 메타데이터 추출
    const metadata: VideoMetadata = {
      title: info.basic_info.title || '',
      channel: info.basic_info.channel?.name || info.basic_info.author || '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      description: info.basic_info.short_description || '',
      viewCount: String(info.basic_info.view_count || ''),
      publishDate: info.basic_info.start_timestamp?.toISOString() || '',
    };

    if (!metadata.title) {
      console.warn('[youtube] getInfo() 메타데이터 빈 값');
      return { metadata: defaultMeta, transcript: defaultTranscript };
    }
    console.log(`[youtube] 메타데이터 성공: "${metadata.title}"`);

    // 자막 추출 — caption_tracks에서 base_url 직접 fetch (프록시 경유 보장)
    let transcript: TranscriptResult = { ...defaultTranscript };
    console.log(`[youtube] captions 존재: ${!!info.captions}, caption_tracks: ${info.captions?.caption_tracks?.length ?? 'undefined'}`);
    const captionTracks = info.captions?.caption_tracks;

    if (captionTracks && captionTracks.length > 0) {
      const track = captionTracks.find(t => t.language_code === 'ko')
        || captionTracks.find(t => t.language_code === 'en')
        || captionTracks[0];

      console.log(`[youtube] caption_tracks ${captionTracks.length}개 발견, 선택: ${track.language_code} (${track.kind || 'manual'})`);

      try {
        const subUrl = track.base_url + (track.base_url.includes('?') ? '&' : '?') + 'fmt=json3';
        const fetchFn = proxiedFetch || globalThis.fetch;
        const subRes = await fetchFn(subUrl);

        if (subRes.ok) {
          const json3 = await subRes.json();
          if (json3.events) {
            const text = (json3.events as Array<{ segs?: Array<{ utf8?: string }> }>)
              .flatMap(e => e.segs?.map(s => s.utf8 || '') || [])
              .join('')
              .replace(/\n/g, ' ')
              .trim();
            if (text.length > 50) {
              transcript = { text, language: track.language_code, method: 'youtubei' };
              console.log(`[youtube] 자막 성공 (${track.language_code}): ${text.length}자`);
            }
          }
        } else {
          console.warn(`[youtube] 자막 다운로드 HTTP ${subRes.status}`);
        }
      } catch (err) {
        console.warn('[youtube] 자막 다운로드 실패:', (err as Error).message);
      }
    } else {
      console.log('[youtube] caption_tracks 없음 (자막 미제공 영상)');
    }

    return { metadata, transcript };
  } catch (err) {
    console.error('[youtube] getInfo() 실패:', (err as Error).message);
    return { metadata: defaultMeta, transcript: defaultTranscript };
  }
}
