import { YoutubeTranscript } from 'youtube-transcript';
import { SourceMetadata } from '@/types/kwip';

export function extractYoutubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // Handle direct 11 character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    // Standard URL regex matching
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = trimmed.match(regExp);

    if (match && match[2].length === 11) {
      return match[2];
    }
  } catch {
    // Fallback URL parsing
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] || null;
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || null;
      }
      const vParam = parsed.searchParams.get('v');
      if (vParam && vParam.length === 11) {
        return vParam;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function isValidYoutubeUrl(url: string): boolean {
  return extractYoutubeVideoId(url) !== null;
}

export interface TranscriptItem {
  text: string;
  duration: number;
  offset: number;
}

export interface YoutubeFetchResult {
  videoId: string;
  metadata: SourceMetadata;
  rawTranscript: string;
  transcriptLength: number;
}

export async function fetchYoutubeVideoDetails(url: string): Promise<SourceMetadata> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL provided.');
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const defaultMeta: SourceMetadata = {
    videoId,
    videoTitle: `YouTube Video (${videoId})`,
    channelTitle: 'YouTube Content',
    videoUrl,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    // Fetch YouTube OEMBED data
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const res = await fetch(oembedUrl, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      return {
        ...defaultMeta,
        videoTitle: data.title || defaultMeta.videoTitle,
        channelTitle: data.author_name || defaultMeta.channelTitle,
        thumbnailUrl: data.thumbnail_url || defaultMeta.thumbnailUrl,
      };
    }
  } catch (err) {
    console.warn('OEMBED fetch warning:', err);
  }

  return defaultMeta;
}

export async function fetchYoutubeVideoDuration(videoId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/) || html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
      if (match && match[1]) {
        const val = parseInt(match[1], 10);
        return normalizeDurationToSeconds(val);
      }
    }
  } catch (err) {
    console.warn('[YouTube Duration Pre-check warning]:', err);
  }
  return null;
}

export function normalizeDurationToSeconds(input: unknown): number | null {
  if (input === null || input === undefined) return null;

  if (typeof input === 'number') {
    if (isNaN(input) || input < 0) return null;
    // If > 15,000, it's in milliseconds (15,000s = 4.1 hours, whereas 2h limit is 7,200s)
    if (input > 15000) {
      return Math.round(input / 1000);
    }
    return Math.round(input);
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return normalizeDurationToSeconds(parseFloat(trimmed));
    }

    if (/^PT/i.test(trimmed)) {
      const hoursMatch = trimmed.match(/(\d+)H/i);
      const minsMatch = trimmed.match(/(\d+)M/i);
      const secsMatch = trimmed.match(/(\d+)S/i);

      const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
      const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
      const secs = secsMatch ? parseInt(secsMatch[1], 10) : 0;

      return hours * 3600 + mins * 60 + secs;
    }

    if (/^(\d+h)?\s*(\d+m)?\s*(\d+s)?$/i.test(trimmed) && (trimmed.includes('h') || trimmed.includes('m') || trimmed.includes('s'))) {
      const hoursMatch = trimmed.match(/(\d+)h/i);
      const minsMatch = trimmed.match(/(\d+)m/i);
      const secsMatch = trimmed.match(/(\d+)s/i);

      const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
      const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
      const secs = secsMatch ? parseInt(secsMatch[1], 10) : 0;

      return hours * 3600 + mins * 60 + secs;
    }

    const parts = trimmed.split(':').map((p) => parseInt(p, 10));
    if (parts.every((p) => !isNaN(p))) {
      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      }
    }
  }

  return null;
}

export async function fetchYoutubeTranscript(url: string): Promise<YoutubeFetchResult> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL. Please enter a valid YouTube link.');
  }

  const metadata = await fetchYoutubeVideoDetails(url);

  // 0. Pre-check Video Duration before transcript fetching
  try {
    const preDuration = await fetchYoutubeVideoDuration(videoId);
    if (preDuration !== null && preDuration > 1800) {
      console.log(`[YouTube Duration Pre-check] videoId=${videoId}, preDuration=${preDuration}s > 1800s limit. Stopping immediately.`);
      throw new Error(
        'VIDEO_TOO_LONG: KWIP currently supports videos up to 30 minutes.'
      );
    }
  } catch (err: any) {
    if (err.message?.includes('VIDEO_TOO_LONG')) {
      throw err;
    }
  }

  let transcriptItems: TranscriptItem[] = [];

  try {
    // Strategy 1: YoutubeTranscript npm package
    transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' }).catch(() =>
      YoutubeTranscript.fetchTranscript(videoId)
    );
  } catch (err1) {
    console.warn('YoutubeTranscript package failed, attempting HTML scraping fallback:', err1);
    // Strategy 2: Scrape timedtext tracks directly from youtube watch page HTML
    try {
      transcriptItems = await scrapeYoutubeCaptions(videoId);
    } catch (err2) {
      console.warn('Scraping fallback failed:', err2);
    }
  }

  if (!transcriptItems || transcriptItems.length === 0) {
    throw new Error(
      'TRANSCRIPT_UNAVAILABLE: We couldn\'t access a transcript for this video. KWIP currently needs an available YouTube transcript or captions to understand the video.'
    );
  }

  // 1. Duration Check: Max 30 Minutes (1,800 seconds)
  const rawMaxDuration = transcriptItems.reduce((max, item) => Math.max(max, (item.offset || 0) + (item.duration || 0)), 0);
  const normalizedDurationSeconds = normalizeDurationToSeconds(rawMaxDuration) ?? 0;
  const isOverLimit = normalizedDurationSeconds > 1800;

  console.log(
    `[YouTube Duration Check] videoId=${videoId}, rawDuration=${rawMaxDuration}, normalizedDurationSeconds=${normalizedDurationSeconds}s (${Math.floor(normalizedDurationSeconds / 60)}m ${normalizedDurationSeconds % 60}s), limit=1800s, isOverLimit=${isOverLimit}`
  );

  if (isOverLimit) {
    throw new Error(
      'VIDEO_TOO_LONG: KWIP currently supports videos up to 30 minutes.'
    );
  }

  // Normalize transcript text: clean HTML entities, join lines, remove repetitive music timestamps
  const cleanedLines = transcriptItems
    .map(item => item.text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim())
    .filter(text => text.length > 0 && !text.match(/^\[.*\]$/)); // Filter out [Music] / [Applause]

  const rawTranscript = cleanedLines.join(' ');

  if (rawTranscript.trim().length < 50) {
    throw new Error(
      'TRANSCRIPT_TOO_SHORT: The video transcript is too short or empty to extract meaningful insights.'
    );
  }

  return {
    videoId,
    metadata: {
      ...metadata,
      duration: normalizedDurationSeconds > 0 ? `${Math.floor(normalizedDurationSeconds / 60)}m ${Math.round(normalizedDurationSeconds % 60)}s` : undefined,
    },
    rawTranscript,
    transcriptLength: rawTranscript.length,
  };
}

async function scrapeYoutubeCaptions(videoId: string): Promise<TranscriptItem[]> {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to load YouTube page.');
  }

  const html = await response.text();
  const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
  if (!captionTracksMatch) {
    throw new Error('No caption tracks found in YouTube page HTML.');
  }

  const captionTracks = JSON.parse(captionTracksMatch[1]);
  if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
    throw new Error('Empty caption tracks.');
  }

  // Prefer English or first track
  const englishTrack = captionTracks.find((track: any) => track.languageCode === 'en' || track.vssId?.includes('en')) || captionTracks[0];
  const xmlUrl = englishTrack.baseUrl;

  const xmlResponse = await fetch(xmlUrl);
  if (!xmlResponse.ok) {
    throw new Error('Failed to fetch caption XML.');
  }

  const xmlText = await xmlResponse.text();

  // Simple regex parser for <text start="12.3" dur="4.5">text content</text>
  const textMatches = Array.from(xmlText.matchAll(/<text start="([^"]+)" dur="([^"]+)">([^<]+)<\/text>/g));

  return textMatches.map(match => ({
    offset: parseFloat(match[1]),
    duration: parseFloat(match[2]),
    text: match[3],
  }));
}
