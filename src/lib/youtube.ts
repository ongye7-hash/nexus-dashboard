// YouTube 자막/메타데이터 추출 유틸리티
// Fallback 체인: youtubei.js → yt-dlp → 제목+설명란만

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

/**
 * YouTube 메타데이터 추출 (youtubei.js → oEmbed fallback)
 */
export async function getVideoMetadata(videoId: string): Promise<{
  title: string;
  channel: string;
  thumbnail: string;
  description: string;
  viewCount: string;
  publishDate: string;
}> {
  // 1차: youtubei.js로 상세 메타데이터
  try {
    const yt = await Innertube.create();
    const info = await yt.getBasicInfo(videoId);
    return {
      title: info.basic_info.title || '',
      channel: info.basic_info.channel?.name || info.basic_info.author || '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      description: info.basic_info.short_description || '',
      viewCount: String(info.basic_info.view_count || ''),
      publishDate: info.basic_info.start_timestamp?.toISOString() || '',
    };
  } catch (err) {
    console.warn('[youtube] youtubei.js 메타데이터 실패, oEmbed fallback:', err);
  }

  // 2차: oEmbed fallback
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || '',
        channel: data.author_name || '',
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        description: '',
        viewCount: '',
        publishDate: '',
      };
    }
  } catch {
    // oEmbed도 실패
  }

  return { title: '제목 없음', channel: '채널 없음', thumbnail: '', description: '', viewCount: '', publishDate: '' };
}

export interface TranscriptResult {
  text: string;
  language: string;
  method: 'youtubei' | 'ytdlp' | 'metadata-only' | 'none';
}

/**
 * YouTube 자막 추출 — fallback 체인
 * 1) youtubei.js 자막 (한국어 → 영어 → 아무 언어)
 * 2) yt-dlp --write-auto-sub (Docker에 설치 시)
 * 3) 실패 시 method='none' 반환 (호출자가 제목+설명으로 분석)
 */
const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export async function getTranscript(videoId: string): Promise<TranscriptResult> {
  if (!SAFE_VIDEO_ID.test(videoId)) {
    console.warn('[youtube] 유효하지 않은 videoId:', videoId);
    return { text: '', language: '', method: 'none' };
  }

  // === 1차: youtubei.js ===
  try {
    const yt = await Innertube.create();
    const info = await yt.getBasicInfo(videoId);
    const transcriptData = await info.getTranscript();

    if (transcriptData?.transcript?.content?.body?.initial_segments) {
      const segments = transcriptData.transcript.content.body.initial_segments;
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
    console.warn('[youtube] youtubei.js 자막 실패:', err);
  }

  // === 2차: yt-dlp fallback ===
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--write-auto-sub', '--sub-lang', 'ko,en',
      '--skip-download', '--sub-format', 'json3',
      '--print-json', '--no-warnings',
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });

    // yt-dlp는 자막 파일을 별도로 쓰는데, --print-json에서 requested_subtitles 확인
    const data = JSON.parse(stdout);
    const subs = data.requested_subtitles;
    if (subs) {
      const lang = subs.ko ? 'ko' : subs.en ? 'en' : Object.keys(subs)[0];
      if (lang && subs[lang]?.data) {
        // json3 포맷 파싱
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

    // yt-dlp --print-json에 automatic_captions가 있을 수 있음
    if (data.subtitles || data.automatic_captions) {
      const caps = { ...data.subtitles, ...data.automatic_captions };
      const lang = caps.ko ? 'ko' : caps.en ? 'en' : Object.keys(caps)[0];
      if (lang && caps[lang]?.[0]?.url) {
        const subRes = await fetch(caps[lang][0].url);
        if (subRes.ok) {
          const subText = await subRes.text();
          // VTT/SRT에서 텍스트만 추출
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
