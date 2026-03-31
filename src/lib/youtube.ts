// YouTube 자막/메타데이터 추출 유틸리티
// stock_yt_crawler.py의 핵심 로직을 TypeScript로 포팅

import { YoutubeTranscript } from 'youtube-transcript';

/**
 * URL에서 YouTube video ID 추출
 * 지원: youtube.com/watch?v=X, youtu.be/X, /embed/X, /shorts/X, 순수 ID
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * YouTube oEmbed API로 메타데이터 추출 (API 키 불필요)
 */
export async function getVideoMetadata(videoId: string): Promise<{
  title: string;
  channel: string;
  thumbnail: string;
} | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || '',
      channel: data.author_name || '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return null;
  }
}

/**
 * YouTube 자막 추출 (한국어 우선 fallback)
 * stock_yt_crawler.py의 get_transcript() 패턴 재사용
 */
export async function getTranscript(videoId: string): Promise<{
  text: string;
  language: string;
  type: 'manual' | 'auto' | 'fallback' | 'none';
} > {
  // 1차: 한국어 자막 시도
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
    if (segments.length > 0) {
      return {
        text: segments.map(s => s.text).join(' '),
        language: 'ko',
        type: 'manual',
      };
    }
  } catch {
    // 한국어 없음 — 계속
  }

  // 2차: 영어 자막 시도
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    if (segments.length > 0) {
      return {
        text: segments.map(s => s.text).join(' '),
        language: 'en',
        type: 'manual',
      };
    }
  } catch {
    // 영어도 없음 — 계속
  }

  // 3차: 언어 지정 없이 아무 자막
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    if (segments.length > 0) {
      return {
        text: segments.map(s => s.text).join(' '),
        language: 'unknown',
        type: 'fallback',
      };
    }
  } catch {
    // 자막 완전히 없음
  }

  return { text: '', language: '', type: 'none' };
}
