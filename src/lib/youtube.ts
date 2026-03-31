// YouTube 자막/메타데이터 추출 유틸리티
// Fallback 체인: youtubei.js getInfo() → yt-dlp → 제목+설명란만

import { Innertube } from 'youtubei.js';
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
    console.warn('[youtube] getInfo().getTranscript() 실패:', err);
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
 * YouTube 데이터 통합 추출 — getInfo() 1회 호출로 메타데이터 + 자막 동시 추출
 * 자막 fallback: youtubei.js → yt-dlp → none
 */
export async function getYouTubeData(videoId: string): Promise<YouTubeData> {
  if (!SAFE_VIDEO_ID.test(videoId)) {
    console.warn('[youtube] 유효하지 않은 videoId:', videoId);
    return {
      metadata: { title: '제목 없음', channel: '채널 없음', thumbnail: '', description: '', viewCount: '', publishDate: '' },
      transcript: { text: '', language: '', method: 'none' },
    };
  }

  let metadata: VideoMetadata = { title: '제목 없음', channel: '채널 없음', thumbnail: '', description: '', viewCount: '', publishDate: '' };
  let transcript: TranscriptResult = { text: '', language: '', method: 'none' };

  // === 1차: youtubei.js getInfo() — 메타데이터 + 자막 한 번에 ===
  try {
    const yt = await Innertube.create();
    const info = await yt.getInfo(videoId);

    // 메타데이터 추출 (getInfo()가 성공하면 항상 가능)
    metadata = extractMetadataFromInfo(info, videoId);
    console.log(`[youtube] getInfo() 메타데이터 성공: "${metadata.title}"`);

    // 자막 추출 시도
    const transcriptResult = await extractTranscriptFromInfo(info);
    if (transcriptResult) {
      transcript = transcriptResult;
      console.log(`[youtube] getInfo() 자막 성공: ${transcript.text.length}자`);
      return { metadata, transcript };
    }
    console.warn('[youtube] getInfo() 자막 없음, yt-dlp fallback 시도');
  } catch (err) {
    console.warn('[youtube] getInfo() 실패:', err);
  }

  // === 2차: yt-dlp fallback (자막만) ===
  if (transcript.method === 'none') {
    transcript = await getTranscriptViYtDlp(videoId);
  }

  return { metadata, transcript };
}

/**
 * yt-dlp를 통한 자막 추출 (fallback용)
 */
async function getTranscriptViYtDlp(videoId: string): Promise<TranscriptResult> {
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
    console.warn('[youtube] yt-dlp 자막 실패:', err);
  }

  return { text: '', language: '', method: 'none' };
}
