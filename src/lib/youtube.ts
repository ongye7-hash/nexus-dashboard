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
    return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: agent,
    });
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
      retrieve_player: false,
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

    // 자막 추출
    let transcript: TranscriptResult = { ...defaultTranscript };
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
          transcript = { text, language: 'auto', method: 'youtubei' };
          console.log(`[youtube] 자막 성공: ${text.length}자`);
        }
      }
    } catch (err) {
      console.warn('[youtube] 자막 추출 실패:', (err as Error).message);
    }

    return { metadata, transcript };
  } catch (err) {
    console.error('[youtube] getInfo() 실패:', (err as Error).message);
    return { metadata: defaultMeta, transcript: defaultTranscript };
  }
}
