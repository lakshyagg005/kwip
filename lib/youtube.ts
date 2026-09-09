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
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+410; SOCS=CAESEwgDEgk0ODE3Nzk3MjAaAmVuIAEaBgiA_LyaBg',
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

export function parseTranscriptXml(xmlText: string): TranscriptItem[] {
  const items: TranscriptItem[] = [];

  // Parse classic XML format: <text start="s" dur="s">content</text>
  const classicMatches = Array.from(xmlText.matchAll(/<text start="([^"]+)" dur="([^"]+)">([\s\S]*?)<\/text>/g));
  if (classicMatches.length > 0) {
    for (const match of classicMatches) {
      const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '')).trim();
      if (text) {
        items.push({
          offset: parseFloat(match[1]) || 0,
          duration: parseFloat(match[2]) || 0,
          text,
        });
      }
    }
    if (items.length > 0) return items;
  }

  // Parse timedtext v3 format: <p t="ms" d="ms"><s>text</s>...</p> or <p t="ms" d="ms">text</p>
  const pMatches = Array.from(xmlText.matchAll(/<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g));
  if (pMatches.length > 0) {
    for (const match of pMatches) {
      const startMs = parseInt(match[1], 10);
      const durMs = parseInt(match[2], 10);
      const inner = match[3];

      let text = '';
      const sMatches = Array.from(inner.matchAll(/<s[^>]*>([\s\S]*?)<\/s>/g));
      if (sMatches.length > 0) {
        text = sMatches.map(m => m[1]).join('');
      } else {
        text = inner.replace(/<[^>]+>/g, '');
      }

      text = decodeHtmlEntities(text).trim();
      if (text) {
        items.push({
          offset: startMs / 1000,
          duration: durMs / 1000,
          text,
        });
      }
    }
    if (items.length > 0) return items;
  }

  // Parse timedtext word format: <w t="ms" d="ms">word</w>
  const wMatches = Array.from(xmlText.matchAll(/<w\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/w>/g));
  if (wMatches.length > 0) {
    for (const match of wMatches) {
      const startMs = parseInt(match[1], 10);
      const durMs = parseInt(match[2], 10);
      const word = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '')).trim();
      if (word) {
        items.push({
          offset: startMs / 1000,
          duration: durMs / 1000,
          text: word,
        });
      }
    }
  }

  return items;
}

interface CaptionTrackInfo {
  baseUrl: string;
  languageCode: string;
  kind?: string; // 'asr' or undefined
  vssId?: string;
  name?: string;
}

function selectBestCaptionTrack(tracks: CaptionTrackInfo[]): CaptionTrackInfo | null {
  if (!tracks || tracks.length === 0) return null;

  // 1. Manual English track (kind !== 'asr', lang starts with 'en')
  const manualEnglish = tracks.find(t => t.kind !== 'asr' && t.languageCode?.toLowerCase().startsWith('en'));
  if (manualEnglish) return manualEnglish;

  // 2. Auto-generated English track (kind === 'asr', lang starts with 'en' or vssId includes 'en')
  const autoEnglish = tracks.find(t => t.languageCode?.toLowerCase().startsWith('en') || t.vssId?.toLowerCase().includes('en'));
  if (autoEnglish) return autoEnglish;

  // 3. Manual track in any language
  const manualAny = tracks.find(t => t.kind !== 'asr');
  if (manualAny) return manualAny;

  // 4. Any track
  return tracks[0] || null;
}

// Strategy 1: InnerTube API
async function fetchCaptionTracksInnerTube(videoId: string, clientName: string = 'ANDROID', clientVersion: string = '20.10.38'): Promise<{ tracks: CaptionTrackInfo[]; playabilityStatus?: string }> {
  const uaMap: Record<string, string> = {
    ANDROID: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
    TVHTML5: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
    WEB: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };

  const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': uaMap[clientName] || uaMap['ANDROID'],
      'X-Youtube-Client-Name': clientName === 'ANDROID' ? '3' : '1',
      'X-Youtube-Client-Version': clientVersion,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName,
          clientVersion,
          hl: 'en',
          gl: 'US',
        },
      },
      videoId,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new YoutubeExtractionError('YouTube rate limit reached. Please try again later.', 'YOUTUBE_RATE_LIMITED', 429);
    }
    return { tracks: [] };
  }

  const data = await response.json();
  const playabilityStatus = data?.playabilityStatus?.status;

  if (playabilityStatus === 'UNPLAYABLE' || playabilityStatus === 'ERROR' || playabilityStatus === 'LOGIN_REQUIRED') {
    return { tracks: [], playabilityStatus };
  }

  const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
    return { tracks: [], playabilityStatus };
  }

  const tracks: CaptionTrackInfo[] = captionTracks.map((t: any) => ({
    baseUrl: t.baseUrl,
    languageCode: t.languageCode || 'en',
    kind: t.kind,
    vssId: t.vssId,
    name: t.name?.runs?.[0]?.text || t.name?.simpleText,
  }));

  return { tracks, playabilityStatus };
}

// Strategy 2: Direct Watch Page Scraping with Anti-Consent Headers
async function fetchCaptionTracksWatchPage(videoId: string): Promise<{ tracks: CaptionTrackInfo[]; playabilityStatus?: string }> {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+410; SOCS=CAESEwgDEgk0ODE3Nzk3MjAaAmVuIAEaBgiA_LyaBg',
    },
  });

  if (!response.ok) {
    return { tracks: [] };
  }

  const html = await response.text();

  if (html.includes('class="g-recaptcha"') || html.includes('/sorry/image')) {
    throw new YoutubeExtractionError('YouTube requested CAPTCHA verification.', 'YOUTUBE_RATE_LIMITED', 429);
  }

  const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
  if (!captionTracksMatch) {
    return { tracks: [] };
  }

  try {
    const captionTracks = JSON.parse(captionTracksMatch[1]);
    if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
      return { tracks: [] };
    }

    const tracks: CaptionTrackInfo[] = captionTracks.map((t: any) => ({
      baseUrl: t.baseUrl,
      languageCode: t.languageCode || 'en',
      kind: t.kind,
      vssId: t.vssId,
      name: t.name?.runs?.[0]?.text || t.name?.simpleText,
    }));

    return { tracks };
  } catch {
    return { tracks: [] };
  }
}

export async function fetchYoutubeTranscript(url: string): Promise<YoutubeFetchResult> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new YoutubeExtractionError('Please enter a valid YouTube URL (e.g. youtube.com/watch?v=... or youtu.be/...)', 'INVALID_YOUTUBE_URL', 400);
  }

  console.log(`[YouTube Transcript] Request started for videoId=${videoId}`);

  const metadata = await fetchYoutubeVideoDetails(url);

  // 0. Pre-check Video Duration before transcript fetching
  try {
    const preDuration = await fetchYoutubeVideoDuration(videoId);
    if (preDuration !== null && preDuration > 1800) {
      console.log(`[YouTube Duration Pre-check] videoId=${videoId}, preDuration=${preDuration}s > 1800s limit.`);
      throw new YoutubeExtractionError(
        'KWIP currently supports videos up to 30 minutes.',
        'VIDEO_TOO_LONG',
        400
      );
    }
  } catch (err: any) {
    if (err instanceof YoutubeExtractionError) {
      throw err;
    }
  }

  let tracks: CaptionTrackInfo[] = [];
  let extractionMethod = '';
  let playabilityStatus: string | undefined;

  // Strategy 1: InnerTube ANDROID Client Context
  try {
    const res1 = await fetchCaptionTracksInnerTube(videoId, 'ANDROID', '20.10.38');
    tracks = res1.tracks;
    playabilityStatus = res1.playabilityStatus;
    if (tracks.length > 0) {
      extractionMethod = 'InnerTube (ANDROID)';
    }
  } catch (err: any) {
    if (err.code === 'YOUTUBE_RATE_LIMITED') throw err;
  }

  // Strategy 2: InnerTube TVHTML5 Client Context (Fallback)
  if (tracks.length === 0) {
    try {
      const res2 = await fetchCaptionTracksInnerTube(videoId, 'TVHTML5', '7.20230405.08.00');
      tracks = res2.tracks;
      if (tracks.length > 0) {
        extractionMethod = 'InnerTube (TVHTML5)';
      }
    } catch (err: any) {
      if (err.code === 'YOUTUBE_RATE_LIMITED') throw err;
    }
  }

  // Strategy 3: Watch Page HTML Scraping (Fallback)
  if (tracks.length === 0) {
    try {
      const res3 = await fetchCaptionTracksWatchPage(videoId);
      tracks = res3.tracks;
      if (tracks.length > 0) {
        extractionMethod = 'Watch Page HTML';
      }
    } catch (err: any) {
      if (err.code === 'YOUTUBE_RATE_LIMITED') throw err;
    }
  }

  // Strategy 4: npm package youtube-transcript (Fallback)
  let packageItems: TranscriptItem[] = [];
  if (tracks.length === 0) {
    try {
      const pkgResult = await YoutubeTranscript.fetchTranscript(videoId).catch(() => null);
      if (pkgResult && Array.isArray(pkgResult) && pkgResult.length > 0) {
        packageItems = pkgResult.map(item => ({
          offset: item.offset || 0,
          duration: item.duration || 0,
          text: item.text || '',
        }));
        extractionMethod = 'youtube-transcript package';
      }
    } catch (err: any) {
      console.warn('[YouTube Transcript] Package fallback warning:', err?.message || err);
    }
  }

  if (tracks.length === 0 && packageItems.length === 0) {
    console.error(`[YouTube Transcript] Failed to find transcript tracks for videoId=${videoId}, playability=${playabilityStatus}`);
    if (playabilityStatus === 'UNPLAYABLE' || playabilityStatus === 'ERROR' || playabilityStatus === 'LOGIN_REQUIRED') {
      throw new YoutubeExtractionError(
        'This YouTube video is unavailable, private, or age-restricted.',
        'YOUTUBE_VIDEO_UNAVAILABLE',
        404
      );
    }
    throw new YoutubeExtractionError(
      'We couldn\'t access a transcript for this video. KWIP currently needs an available YouTube transcript or captions to understand the video.',
      'TRANSCRIPT_NOT_FOUND',
      422
    );
  }

  let transcriptItems: TranscriptItem[] = [];

  if (packageItems.length > 0) {
    transcriptItems = packageItems;
  } else {
    const selectedTrack = selectBestCaptionTrack(tracks);
    if (!selectedTrack) {
      throw new YoutubeExtractionError(
        'No compatible transcript tracks available for this video.',
        'TRANSCRIPT_NOT_FOUND',
        422
      );
    }

    console.log(
      `[YouTube Transcript] Selected track: lang=${selectedTrack.languageCode}, kind=${selectedTrack.kind || 'manual'}, vssId=${selectedTrack.vssId}, method=${extractionMethod}`
    );

    // If selected track is non-English and translatable, try auto-translating to English by adding &tlang=en
    let targetXmlUrl = selectedTrack.baseUrl;
    if (!selectedTrack.languageCode.toLowerCase().startsWith('en') && !targetXmlUrl.includes('&tlang=')) {
      targetXmlUrl = `${targetXmlUrl}&tlang=en`;
    }

    try {
      const xmlRes = await fetch(targetXmlUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!xmlRes.ok) {
        // Fallback to original track URL if translation fetch failed
        const originalRes = await fetch(selectedTrack.baseUrl);
        if (!originalRes.ok) {
          throw new YoutubeExtractionError('Failed to fetch YouTube caption track XML.', 'TRANSCRIPT_UNAVAILABLE', 422);
        }
        const xmlText = await originalRes.text();
        transcriptItems = parseTranscriptXml(xmlText);
      } else {
        const xmlText = await xmlRes.text();
        transcriptItems = parseTranscriptXml(xmlText);
      }
    } catch (err: any) {
      if (err instanceof YoutubeExtractionError) throw err;
      throw new YoutubeExtractionError('Failed to download or parse YouTube transcript XML.', 'TRANSCRIPT_PARSE_FAILED', 422);
    }
  }

  if (!transcriptItems || transcriptItems.length === 0) {
    throw new YoutubeExtractionError(
      'We couldn\'t access a transcript for this video. The transcript XML contained no text content.',
      'TRANSCRIPT_PARSE_FAILED',
      422
    );
  }

  // Duration Check: Max 30 Minutes (1,800 seconds)
  const rawMaxDuration = transcriptItems.reduce((max, item) => Math.max(max, (item.offset || 0) + (item.duration || 0)), 0);
  const normalizedDurationSeconds = normalizeDurationToSeconds(rawMaxDuration) ?? 0;
  const isOverLimit = normalizedDurationSeconds > 1800;

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

  // Clean HTML entities, join lines, filter out [Music], [Applause], [Laughter]
  const cleanedLines = transcriptItems
    .map(item => decodeHtmlEntities(item.text).trim())
    .filter(text => text.length > 0 && !text.match(/^\[.*\]$/));

  const rawTranscript = cleanedLines.join(' ');

  if (rawTranscript.trim().length < 50) {
    throw new YoutubeExtractionError(
      'The video transcript is too short or empty to extract meaningful insights.',
      'TRANSCRIPT_TOO_SHORT',
      422
    );
  }

  console.log(
    `[YouTube Transcript Success] videoId=${videoId}, method="${extractionMethod}", transcriptLength=${rawTranscript.length} chars`
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

