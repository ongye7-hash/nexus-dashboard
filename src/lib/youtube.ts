// YouTube 자막/메타데이터 추출 유틸리티
// Fallback 체인: youtubei.js getInfo() (다중 클라이언트) → HTML 파싱 → yt-dlp

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
  method: 'youtubei' | 'ytdlp' | 'metadata-only' | 'none';
}

export interface YouTubeData {
  metadata: VideoMetadata;
  transcript: TranscriptResult;
}

const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

const EMPTY_METADATA: VideoMetadata = {
  title: '', channel: '', thumbnail: '', description: '', viewCount: '', publishDate: '',
};

/**
 * YouTube 페이지 HTML에서 메타데이터 파싱 (OG 태그 + ytInitialPlayerResponse)
 * VPS에서 Innertube가 빈 메타데이터를 반환할 때 fallback
 */
async function getMetadataFromHtml(videoId: string): Promise<VideoMetadata> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!res.ok) return EMPTY_METADATA;
    const html = await res.text();

    // OG 태그에서 메타데이터 추출
    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/)
      || html.match(/<meta\s+content="([^"]*)"\s+property="og:title"/);
    const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/)
      || html.match(/<meta\s+content="([^"]*)"\s+property="og:description"/);

    // ytInitialPlayerResponse에서 추가 정보
    const playerMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});\s*(?:var|<\/script>)/);
    let channel = '';
    let viewCount = '';
    let publishDate = '';

    if (playerMatch) {
      try {
        const player = JSON.parse(playerMatch[1]);
        channel = player.videoDetails?.author || '';
        viewCount = player.videoDetails?.viewCount || '';
        publishDate = player.microformat?.playerMicroformatRenderer?.publishDate || '';
      } catch {
        console.warn('[youtube] ytInitialPlayerResponse 파싱 실패');
      }
    }

    // channel fallback: <link itemprop="name">
    if (!channel) {
      const channelMatch = html.match(/<link\s+itemprop="name"\s+content="([^"]*)"/)
        || html.match(/"ownerChannelName":"([^"]*)"/);
      channel = channelMatch?.[1] || '';
    }

    const title = ogTitle?.[1] || '';
    const description = ogDesc?.[1] || '';

    if (title) {
      console.log(`[youtube] HTML 메타데이터 성공: "${title}"`);
    }

    return {
      title: decodeHtmlEntities(title),
      channel: decodeHtmlEntities(channel),
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      description: decodeHtmlEntities(description),
      viewCount,
      publishDate,
    };
  } catch (err) {
    console.warn('[youtube] HTML 메타데이터 실패:', err);
    return EMPTY_METADATA;
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
 * YouTube 데이터 통합 추출
 *
 * Fallback 체인:
 * 메타데이터: getInfo() → HTML OG 태그 파싱
 * 자막: getInfo() (다중 클라이언트) → yt-dlp → none
 */
export async function getYouTubeData(videoId: string): Promise<YouTubeData> {
  if (!SAFE_VIDEO_ID.test(videoId)) {
    console.warn('[youtube] 유효하지 않은 videoId:', videoId);
    return {
      metadata: { title: '제목 없음', channel: '채널 없음', thumbnail: '', description: '', viewCount: '', publishDate: '' },
      transcript: { text: '', language: '', method: 'none' },
    };
  }

  let metadata: VideoMetadata = { ...EMPTY_METADATA };
  let transcript: TranscriptResult = { text: '', language: '', method: 'none' };

  // === 1차: youtubei.js getInfo() — 다중 클라이언트 시도 ===
  const clientConfigs: Array<{ name: string; opts: Parameters<typeof Innertube.create>[0] }> = [
    { name: 'WEB', opts: { generate_session_locally: true, retrieve_player: false } },
    { name: 'TV_EMBEDDED', opts: { client_type: ClientType.TV_EMBEDDED, generate_session_locally: true, retrieve_player: false } },
    { name: 'WEB_CREATOR', opts: { client_type: ClientType.WEB_CREATOR, generate_session_locally: true, retrieve_player: false } },
  ];

  for (const { name, opts } of clientConfigs) {
    try {
      const yt = await Innertube.create(opts);
      const info = await yt.getInfo(videoId);

      // 메타데이터 추출
      const meta = extractMetadataFromInfo(info, videoId);
      if (meta.title) {
        metadata = meta;
        console.log(`[youtube] ${name} 메타데이터 성공: "${metadata.title}"`);
      }

      // 자막 추출 시도
      if (transcript.method === 'none') {
        const transcriptResult = await extractTranscriptFromInfo(info);
        if (transcriptResult) {
          transcript = transcriptResult;
          console.log(`[youtube] ${name} 자막 성공: ${transcript.text.length}자`);
        }
      }

      // 메타데이터 + 자막 둘 다 있으면 즉시 반환
      if (metadata.title && transcript.method !== 'none') {
        return { metadata, transcript };
      }
    } catch (err) {
      console.warn(`[youtube] ${name} getInfo() 실패:`, (err as Error).message || err);
    }
  }

  // === 2차: 메타데이터가 비어있으면 HTML 파싱 fallback ===
  if (!metadata.title) {
    console.log('[youtube] Innertube 메타데이터 실패, HTML 파싱 시도');
    metadata = await getMetadataFromHtml(videoId);
    if (!metadata.title) {
      metadata.title = '제목 없음';
      metadata.channel = '채널 없음';
    }
  }

  // === 3차: 자막이 없으면 yt-dlp fallback ===
  if (transcript.method === 'none') {
    console.log('[youtube] Innertube 자막 실패, yt-dlp fallback 시도');
    transcript = await getTranscriptViaYtDlp(videoId);
  }

  return { metadata, transcript };
}

/**
 * yt-dlp를 통한 자막 추출 (fallback용)
 */
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
          const cleanText = subText
            .replace(/WEBVTT.*?\n/g, '')
            .replace(/\d{2}:\d{2}[\d:.→ ]+\n/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{2,}/g, ' ')
            .trim();
          if (cleanText.length > 50) {
            return { text: cleanText, language: lang, method: 'ytdlp' };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[youtube] yt-dlp 자막 실패:', (err as Error).message || err);
  }

  return { text: '', language: '', method: 'none' };
}
