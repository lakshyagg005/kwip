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
    let res = await fetch(oembedUrl, { next: { revalidate: 3600 } });

    if (!res.ok) {
      const shortsOembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/shorts/${videoId}`)}&format=json`;
      const shortsRes = await fetch(shortsOembedUrl, { next: { revalidate: 3600 } });
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



// Strategy 1: InnerTube API Context (Most reliable for signed caption URLs)
async function fetchCaptionTracksInnerTube(videoId: string, clientName: string = 'ANDROID', clientVersion: string = '20.10.38'): Promise<{ tracks: CaptionTrackInfo[]; isPrivateOrBlocked?: boolean; isIpBlocked?: boolean; playabilityStatus?: string; reason?: string }> {
  const uaMap: Record<string, string> = {
    ANDROID: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
    TVHTML5: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
    WEB: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };

  try {
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
      console.warn(`[YouTube Diagnostics] Strategy InnerTube (${clientName}) HTTP Error: status=${response.status}, videoId=${videoId}`);
      if (response.status === 429) {
        throw new YoutubeExtractionError('YouTube rate limit reached. Please try again later.', 'YOUTUBE_RATE_LIMITED', 429);
      }
      return { tracks: [], isIpBlocked: response.status === 403 || response.status === 402 };
    }

    const data = await response.json();
    const playabilityStatus = data?.playabilityStatus?.status;
    const reason = data?.playabilityStatus?.reason || data?.playabilityStatus?.errorScreen?.playerErrorMessageRenderer?.reason?.runs?.[0]?.text;

    const isIpBlocked = playabilityStatus === 'LOGIN_REQUIRED' || Boolean(reason && (reason.toLowerCase().includes('bot') || reason.toLowerCase().includes('sign in')));
    const isPrivateOrBlocked = playabilityStatus === 'ERROR' || playabilityStatus === 'LOGIN_REQUIRED';

    const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const hasCaptions = Array.isArray(captionTracks) && captionTracks.length > 0;

    console.log(`[YouTube Diagnostics] Strategy InnerTube (${clientName}): videoId=${videoId}, status=${response.status}, playabilityStatus="${playabilityStatus || 'OK'}", reason="${reason || 'N/A'}", captionTracksCount=${hasCaptions ? captionTracks.length : 0}, isIpBlocked=${isIpBlocked}`);

    if (!hasCaptions) {
      return { tracks: [], isPrivateOrBlocked, isIpBlocked, playabilityStatus, reason };
    }

    const tracks: CaptionTrackInfo[] = captionTracks.map((t: any) => ({
      baseUrl: t.baseUrl ? t.baseUrl.replace(/\\u0026/g, '&').replace(/&amp;/g, '&') : '',
      languageCode: t.languageCode || 'en',
      kind: t.kind,
      vssId: t.vssId,
      name: t.name?.runs?.[0]?.text || t.name?.simpleText,
    })).filter((t: any) => Boolean(t.baseUrl));

    return { tracks, isPrivateOrBlocked, isIpBlocked, playabilityStatus, reason };
  } catch (err: any) {
    if (err instanceof YoutubeExtractionError) throw err;
    console.warn(`[YouTube Diagnostics] Strategy InnerTube (${clientName}) Exception: videoId=${videoId}, error="${err?.message || err}"`);
    return { tracks: [] };
  }
}

// Strategy 3: Direct Watch Page Scraping with Anti-Consent Headers (Fallback)
async function fetchCaptionTracksWatchPage(videoId: string): Promise<{ tracks: CaptionTrackInfo[]; isPrivateOrBlocked?: boolean; isIpBlocked?: boolean }> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+410; SOCS=CAESEwgDEgk0ODE3Nzk3MjAaAmVuIAEaBgiA_LyaBg',
      },
    });

    if (!response.ok) {
      console.warn(`[YouTube Diagnostics] Strategy Watch Page HTTP Error: status=${response.status}, videoId=${videoId}`);
      if (response.status === 404 || response.status === 401) {
        return { tracks: [], isPrivateOrBlocked: true };
      }
      return { tracks: [], isIpBlocked: response.status === 429 || response.status === 403 };
    }

    const html = await response.text();
    const hasCaptcha = html.includes('class="g-recaptcha"') || html.includes('/sorry/image');

    if (hasCaptcha) {
      console.warn(`[YouTube Diagnostics] Strategy Watch Page CAPTCHA detected for videoId=${videoId}`);
      return { tracks: [], isIpBlocked: true };
    }

    if (html.includes('This video is private') || html.includes('This video has been removed')) {
      return { tracks: [], isPrivateOrBlocked: true };
    }

    // Regex Matchers
    const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/) || html.match(/\\"captionTracks\\":\s*(\[.*?\])/);
    if (captionTracksMatch) {
      try {
        const unescaped = captionTracksMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const captionTracks = JSON.parse(unescaped);
        if (Array.isArray(captionTracks) && captionTracks.length > 0) {
          const tracks: CaptionTrackInfo[] = captionTracks.map((t: any) => ({
            baseUrl: t.baseUrl ? t.baseUrl.replace(/\\u0026/g, '&').replace(/&amp;/g, '&') : '',
            languageCode: t.languageCode || 'en',
            kind: t.kind,
            vssId: t.vssId,
            name: t.name?.runs?.[0]?.text || t.name?.simpleText,
          })).filter((t: any) => Boolean(t.baseUrl));

          console.log(`[YouTube Diagnostics] Strategy Watch Page: videoId=${videoId}, captionTracksCount=${tracks.length}`);
          return { tracks };
        }
      } catch {
        // Continue
      }
    }

    console.log(`[YouTube Diagnostics] Strategy Watch Page: videoId=${videoId}, no captionTracks matched in HTML (htmlLength=${html.length})`);
    return { tracks: [] };
  } catch (err: any) {
    if (err instanceof YoutubeExtractionError) throw err;
    console.warn(`[YouTube Diagnostics] Strategy Watch Page Exception: videoId=${videoId}, error="${err?.message || err}"`);
    return { tracks: [] };
  }
}

export async function fetchYoutubeTranscript(url: string): Promise<YoutubeFetchResult> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new YoutubeExtractionError('Please enter a valid YouTube URL (e.g. youtube.com/watch?v=... or youtu.be/...)', 'INVALID_YOUTUBE_URL', 400);
  }

  console.log(`[YouTube Transcript] Request started for videoId=${videoId}`);

  // Pluggable External Worker Option (e.g. Railway/Render worker for non-datacenter IP execution)
  const workerUrl = process.env.TRANSCRIPT_WORKER_URL;
  if (workerUrl && workerUrl.trim().length > 0) {
    try {
      console.log(`[YouTube Worker] Routing transcript request for videoId=${videoId} to worker: ${workerUrl.trim()}`);
      const workerSecret = process.env.TRANSCRIPT_WORKER_SECRET || '';
      const workerRes = await fetch(`${workerUrl.trim().replace(/\/$/, '')}/api/transcript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workerSecret ? { Authorization: `Bearer ${workerSecret}` } : {}),
        },
        body: JSON.stringify({ videoId, url }),
      });

      if (workerRes.ok) {
        const workerData = await workerRes.json();
        if (workerData?.success && workerData?.rawTranscript) {
          console.log(`[YouTube Worker Success] videoId=${videoId}, transcriptLength=${workerData.rawTranscript.length} chars`);
          return {
            videoId,
            metadata: workerData.metadata || {
              videoId,
              videoTitle: `YouTube Video (${videoId})`,
              channelTitle: 'YouTube Content',
              videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
              thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            },
            rawTranscript: workerData.rawTranscript,
            transcriptLength: workerData.rawTranscript.length,
          };
        }
      } else {
        console.warn(`[YouTube Worker Warning] Worker returned status=${workerRes.status} for videoId=${videoId}. Falling back to direct extraction.`);
      }
    } catch (workerErr: any) {
      console.warn(`[YouTube Worker Warning] Exception connecting to worker for videoId=${videoId}: ${workerErr?.message || workerErr}. Falling back to direct extraction.`);
    }
  }

  let isVerifiedPublic = false;
  let metadata: SourceMetadata;

  try {
    metadata = await fetchYoutubeVideoDetails(url);
    if (metadata && metadata.videoTitle && !metadata.videoTitle.includes('YouTube Video (')) {
      isVerifiedPublic = true;
    }
  } catch (err: any) {
    if (err instanceof YoutubeExtractionError) {
      throw err;
    }
    metadata = {
      videoId,
      videoTitle: `YouTube Video (${videoId})`,
      channelTitle: 'YouTube Content',
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }

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
  let isPrivateOrBlocked = false;
  let isIpBlocked = false;

  // Strategy 1: InnerTube ANDROID Client Context (Primary: signed caption URLs)
  try {
    const res1 = await fetchCaptionTracksInnerTube(videoId, 'ANDROID', '20.10.38');
    tracks = res1.tracks;
    if (res1.isPrivateOrBlocked) isPrivateOrBlocked = true;
    if (res1.isIpBlocked) isIpBlocked = true;
    if (tracks.length > 0) {
      extractionMethod = 'InnerTube (ANDROID)';
    }
  } catch (err: any) {
    if (err.code === 'YOUTUBE_RATE_LIMITED') throw err;
  }

  // Strategy 2: InnerTube TVHTML5 Client Context (Fallback)
  if (tracks.length === 0 && !isPrivateOrBlocked) {
    try {
      const res2 = await fetchCaptionTracksInnerTube(videoId, 'TVHTML5', '7.20230405.08.00');
      tracks = res2.tracks;
      if (res2.isPrivateOrBlocked) isPrivateOrBlocked = true;
      if (res2.isIpBlocked) isIpBlocked = true;
      if (tracks.length > 0) {
        extractionMethod = 'InnerTube (TVHTML5)';
      }
    } catch (err: any) {
      if (err.code === 'YOUTUBE_RATE_LIMITED') throw err;
    }
  }

  // Strategy 3: Watch Page HTML Scraping with Anti-Consent Headers (Fallback)
  if (tracks.length === 0 && !isPrivateOrBlocked) {
    try {
      const res3 = await fetchCaptionTracksWatchPage(videoId);
      tracks = res3.tracks;
      if (res3.isPrivateOrBlocked) isPrivateOrBlocked = true;
      if (res3.isIpBlocked) isIpBlocked = true;
      if (tracks.length > 0) {
        extractionMethod = 'Watch Page HTML';
      }
    } catch (err: any) {
      if (err.code === 'YOUTUBE_RATE_LIMITED') throw err;
    }
  }

  // Strategy 4: npm package youtube-transcript (Fallback)
  let packageItems: TranscriptItem[] = [];
  if (tracks.length === 0 && !isPrivateOrBlocked) {
    try {
      const pkgResult = await YoutubeTranscript.fetchTranscript(videoId).catch((pkgErr) => {
        console.warn(`[YouTube Diagnostics] Strategy youtube-transcript package failed for videoId=${videoId}: ${pkgErr?.message || pkgErr}`);
        return null;
      });

      if (pkgResult && Array.isArray(pkgResult) && pkgResult.length > 0) {
        packageItems = pkgResult.map(item => ({
          offset: item.offset || 0,
          duration: item.duration || 0,
          text: item.text || '',
        }));
        extractionMethod = 'youtube-transcript package';
        console.log(`[YouTube Diagnostics] Strategy youtube-transcript package: videoId=${videoId}, itemsCount=${packageItems.length}`);
      }
    } catch (err: any) {
      console.warn('[YouTube Transcript] Package fallback warning:', err?.message || err);
    }
  }

  if (tracks.length === 0 && packageItems.length === 0) {
    console.error(`[YouTube Diagnostics Summary] Failed to extract transcript tracks for videoId=${videoId}, isVerifiedPublic=${isVerifiedPublic}, isPrivateOrBlocked=${isPrivateOrBlocked}, isIpBlocked=${isIpBlocked}`);

    if (isIpBlocked && isVerifiedPublic) {
      throw new YoutubeExtractionError(
        'YouTube temporarily restricted serverless access for this request. Please try again in a few moments or use a worker endpoint.',
        'YOUTUBE_IP_BLOCKED',
        503
      );
    }

    if (isPrivateOrBlocked && !isVerifiedPublic) {
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
    // Iterate over available tracks to find one that returns valid XML content
    const orderedTracks = [...tracks].sort((a, b) => {
      const aEng = a.languageCode?.toLowerCase().startsWith('en');
      const bEng = b.languageCode?.toLowerCase().startsWith('en');
      if (aEng && !bEng) return -1;
      if (!aEng && bEng) return 1;
      if (a.kind !== 'asr' && b.kind === 'asr') return -1;
      if (a.kind === 'asr' && b.kind !== 'asr') return 1;
      return 0;
    });

    for (const track of orderedTracks) {
      let targetXmlUrl = track.baseUrl;
      if (!track.languageCode.toLowerCase().startsWith('en') && !targetXmlUrl.includes('&tlang=')) {
        targetXmlUrl = `${targetXmlUrl}&tlang=en`;
      }

      try {
        const xmlRes = await fetch(targetXmlUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        if (xmlRes.ok) {
          const xmlText = await xmlRes.text();
          if (xmlText.trim().length > 0) {
            const parsed = parseTranscriptXml(xmlText);
            if (parsed.length > 0) {
              transcriptItems = parsed;
              console.log(
                `[YouTube Transcript] Successfully extracted track: lang=${track.languageCode}, kind=${track.kind || 'manual'}, method=${extractionMethod}`
              );
              break;
            }
          }
        } else {
          console.warn(`[YouTube Diagnostics] XML Fetch status=${xmlRes.status} for lang=${track.languageCode}, videoId=${videoId}`);
          if (xmlRes.status === 403 || xmlRes.status === 429) {
            isIpBlocked = true;
          }
        }
      } catch (err: any) {
        console.warn(`[YouTube Transcript] Track fetch warning for lang=${track.languageCode}:`, err?.message || err);
      }
    }
  }

  if (!transcriptItems || transcriptItems.length === 0) {
    if (isIpBlocked) {
      throw new YoutubeExtractionError(
        'YouTube temporarily restricted serverless access for this request. Please try again in a few moments.',
        'YOUTUBE_IP_BLOCKED',
        503
      );
    }

    if (isVerifiedPublic) {
      throw new YoutubeExtractionError(
        'We couldn\'t fetch caption data for this video. The YouTube caption service returned an empty track.',
        'TRANSCRIPT_FETCH_FAILED',
        502
      );
    }

    throw new YoutubeExtractionError(
      'We couldn\'t access a transcript for this video. KWIP currently needs an available YouTube transcript or captions to understand the video.',
      'TRANSCRIPT_NOT_FOUND',
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


