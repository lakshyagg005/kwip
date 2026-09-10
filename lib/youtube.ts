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

export class YoutubeExtractionError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number = 422) {
    super(message);
    this.name = 'YoutubeExtractionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function fetchYoutubeVideoDetails(url: string): Promise<SourceMetadata> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new YoutubeExtractionError('Please enter a valid YouTube URL.', 'INVALID_YOUTUBE_URL', 400);
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
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    let res = await fetch(oembedUrl, { next: { revalidate: 3600 } } as any);

    if (!res.ok) {
      const shortsOembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/shorts/${videoId}`)}&format=json`;
      const shortsRes = await fetch(shortsOembedUrl, { next: { revalidate: 3600 } } as any);
      if (shortsRes.ok) {
        res = shortsRes;
      }
    }

    if (res.ok) {
      const data = await res.json();
      return {
        ...defaultMeta,
        videoTitle: data.title || defaultMeta.videoTitle,
        channelTitle: data.author_name || defaultMeta.channelTitle,
        thumbnailUrl: data.thumbnail_url || defaultMeta.thumbnailUrl,
      };
    }
    if (res.status === 404 || res.status === 401) {
      throw new YoutubeExtractionError('This YouTube video is unavailable, private, or age-restricted.', 'YOUTUBE_VIDEO_UNAVAILABLE', 404);
    }
  } catch (err) {
    if (err instanceof YoutubeExtractionError) throw err;
    console.warn('[YouTube OEMBED Warning]:', err);
  }

  return defaultMeta;
}

export async function fetchYoutubeVideoDuration(videoId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
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
    console.warn('[YouTube Duration Pre-check Warning]:', err);
  }
  return null;
}

export function normalizeDurationToSeconds(input: unknown): number | null {
  if (input === null || input === undefined) return null;

  if (typeof input === 'number') {
    if (isNaN(input) || input < 0) return null;
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

export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

// Server-side in-memory transcript cache to eliminate redundant Supadata API credits
interface TranscriptCacheEntry {
  result: YoutubeFetchResult;
  timestamp: number;
}
const transcriptCache = new Map<string, TranscriptCacheEntry>();
const inFlightTranscriptPromises = new Map<string, Promise<YoutubeFetchResult>>();

export async function fetchYoutubeTranscript(url: string): Promise<YoutubeFetchResult> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new YoutubeExtractionError(
      'Please enter a valid YouTube URL (e.g. youtube.com/watch?v=... or youtu.be/...)',
      'INVALID_YOUTUBE_URL',
      400
    );
  }

  // 1. Check in-memory cache (TTL: 2 hours)
  const cached = transcriptCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < 7200000) {
    console.log(`[Supadata Transcript Cache] HIT for videoId=${videoId}. Reusing cached transcript (0 Supadata API credits used).`);
    return cached.result;
  }

  // 2. Check in-flight promise (Deduplicate simultaneous requests for same video)
  const existingInFlight = inFlightTranscriptPromises.get(videoId);
  if (existingInFlight) {
    console.log(`[Supadata Transcript In-Flight] Joining existing transcript request for videoId=${videoId} (0 extra Supadata API credits used).`);
    return existingInFlight;
  }

  // 3. Execute single-flight fetch & cache result
  const fetchPromise = (async () => {
    try {
      const result = await fetchYoutubeTranscriptFromSupadata(videoId, url);
      transcriptCache.set(videoId, { result, timestamp: Date.now() });
      return result;
    } finally {
      inFlightTranscriptPromises.delete(videoId);
    }
  })();

  inFlightTranscriptPromises.set(videoId, fetchPromise);
  return fetchPromise;
}

async function fetchYoutubeTranscriptFromSupadata(videoId: string, url: string): Promise<YoutubeFetchResult> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.error('[Supadata Transcript Error] SUPADATA_API_KEY environment variable is not configured.');
    throw new YoutubeExtractionError(
      'SUPADATA_API_KEY environment variable is missing on server. Please configure SUPADATA_API_KEY in environment variables.',
      'SUPADATA_KEY_MISSING',
      500
    );
  }

  // Retrieve basic video metadata via public YouTube oEmbed
  let metadata: SourceMetadata;
  try {
    metadata = await fetchYoutubeVideoDetails(url);
  } catch {
    metadata = {
      videoId,
      videoTitle: `YouTube Video (${videoId})`,
      channelTitle: 'YouTube Content',
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }

  // Pre-check video duration before calling Supadata to save API credits if video > 30 mins
  const preDuration = await fetchYoutubeVideoDuration(videoId);
  if (preDuration !== null && preDuration > 1800) {
    console.warn(`[YouTube Duration Pre-check] videoId=${videoId} preDuration=${preDuration}s > 1800s. Rejecting before Supadata call.`);
    throw new YoutubeExtractionError(
      'KWIP currently supports videos up to 30 minutes.',
      'VIDEO_TOO_LONG',
      400
    );
  }

  const targetUrl = `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
  console.log(`[Supadata Transcript API Call] Requesting transcript from Supadata API for videoId=${videoId}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey.trim(),
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[Supadata Transcript Error] Request timed out for videoId=${videoId}`);
      throw new YoutubeExtractionError(
        'Transcript service request timed out. Please try again in a few moments.',
        'SUPADATA_TIMEOUT',
        504
      );
    }
    console.error(`[Supadata Transcript Error] Connection failure for videoId=${videoId}: ${err?.message || err}`);
    throw new YoutubeExtractionError(
      'Failed to connect to transcript service.',
      'TRANSCRIPT_FETCH_FAILED',
      503
    );
  } finally {
    clearTimeout(timeoutId);
  }

  console.log(`[Supadata Transcript API Response] Response status: ${res.status} for videoId=${videoId}`);

  if (res.status === 401 || res.status === 403) {
    console.error(`[Supadata Transcript Error] Authentication or quota error (HTTP ${res.status}) for videoId=${videoId}`);
    throw new YoutubeExtractionError(
      'Transcript service configuration or quota error. Please contact administrator.',
      'SUPADATA_AUTH_ERROR',
      500
    );
  }

  if (res.status === 404) {
    console.warn(`[Supadata Transcript Warning] Transcript not found or video unavailable (HTTP 404) for videoId=${videoId}`);
    throw new YoutubeExtractionError(
      "We couldn't access a transcript for this video. KWIP currently needs an available YouTube transcript or captions to understand the video.",
      'TRANSCRIPT_NOT_FOUND',
      422
    );
  }

  if (res.status === 429) {
    console.warn(`[Supadata Transcript Warning] Rate limit hit (HTTP 429) for videoId=${videoId}`);
    throw new YoutubeExtractionError(
      'Transcript service rate limit reached. Please try again in a few moments.',
      'UPSTREAM_RATE_LIMIT',
      429
    );
  }

  if (!res.ok) {
    console.error(`[Supadata Transcript Error] Supadata returned status HTTP ${res.status} for videoId=${videoId}`);
    throw new YoutubeExtractionError(
      'Transcript service is temporarily unavailable. Please try again later.',
      'SUPADATA_SERVER_ERROR',
      503
    );
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    console.error(`[Supadata Transcript Error] Failed to parse JSON response for videoId=${videoId}`);
    throw new YoutubeExtractionError(
      'Transcript service returned an invalid response structure.',
      'SUPADATA_MALFORMED_RESPONSE',
      502
    );
  }

  if (!data || !Array.isArray(data.content)) {
    console.error(`[Supadata Transcript Error] Missing content array in response payload for videoId=${videoId}`);
    throw new YoutubeExtractionError(
      'Transcript service returned an invalid response structure.',
      'SUPADATA_MALFORMED_RESPONSE',
      502
    );
  }

  if (data.content.length === 0) {
    console.warn(`[Supadata Transcript Warning] Empty transcript content for videoId=${videoId}`);
    throw new YoutubeExtractionError(
      "We couldn't access a transcript for this video. KWIP currently needs an available YouTube transcript or captions to understand the video.",
      'TRANSCRIPT_NOT_FOUND',
      422
    );
  }

  // Calculate video duration from transcript items
  const rawMaxDuration = data.content.reduce((max: number, item: any) => {
    const offset = Number(item.offset) || 0;
    const duration = Number(item.duration) || 0;
    return Math.max(max, offset + duration);
  }, 0);

  const normalizedDurationSeconds = normalizeDurationToSeconds(rawMaxDuration) ?? 0;
  const isOverLimit = normalizedDurationSeconds > 1800; // 30 minute limit

  console.log(
    `[YouTube Duration Check] videoId=${videoId}, normalizedDurationSeconds=${normalizedDurationSeconds}s (${Math.floor(normalizedDurationSeconds / 60)}m ${normalizedDurationSeconds % 60}s), limit=1800s, isOverLimit=${isOverLimit}`
  );

  if (isOverLimit) {
    throw new YoutubeExtractionError(
      'KWIP currently supports videos up to 30 minutes.',
      'VIDEO_TOO_LONG',
      400
    );
  }

  // Process transcript lines into clean text
  const cleanedLines = data.content
    .map((item: any) => decodeHtmlEntities(String(item.text || '')).trim())
    .filter((text: string) => text.length > 0 && !text.match(/^\[.*\]$/));

  const rawTranscript = cleanedLines.join(' ');

  if (rawTranscript.trim().length < 50) {
    throw new YoutubeExtractionError(
      'The video transcript is too short or empty to extract meaningful insights.',
      'TRANSCRIPT_TOO_SHORT',
      422
    );
  }

  console.log(
    `[Supadata Transcript Success] videoId=${videoId}, transcriptLength=${rawTranscript.length} chars, duration=${normalizedDurationSeconds}s`
  );

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
