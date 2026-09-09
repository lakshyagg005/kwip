const express = require('express');
const { YoutubeTranscript } = require('youtube-transcript');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const WORKER_SECRET = process.env.TRANSCRIPT_WORKER_SECRET || '';

function extractVideoId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = trimmed.match(regExp);
    if (match && match[2].length === 11) return match[2];
  } catch {}
  return null;
}

function decodeHtmlEntities(text) {
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

function parseTranscriptXml(xmlText) {
  const items = [];
  const classicMatches = Array.from(xmlText.matchAll(/<text start="([^"]+)" dur="([^"]+)">([\s\S]*?)<\/text>/g));
  if (classicMatches.length > 0) {
    for (const match of classicMatches) {
      const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '')).trim();
      if (text) items.push(text);
    }
    if (items.length > 0) return items;
  }

  const pMatches = Array.from(xmlText.matchAll(/<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g));
  if (pMatches.length > 0) {
    for (const match of pMatches) {
      const inner = match[3];
      const sMatches = Array.from(inner.matchAll(/<s[^>]*>([\s\S]*?)<\/s>/g));
      const text = decodeHtmlEntities(sMatches.length > 0 ? sMatches.map(m => m[1]).join('') : inner.replace(/<[^>]+>/g, '')).trim();
      if (text) items.push(text);
    }
    if (items.length > 0) return items;
  }

  const wMatches = Array.from(xmlText.matchAll(/<w\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/w>/g));
  if (wMatches.length > 0) {
    for (const match of wMatches) {
      const word = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '')).trim();
      if (word) items.push(word);
    }
  }

  return items;
}

async function fetchVideoMetadata(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const defaultMeta = {
    videoId,
    videoTitle: `YouTube Video (${videoId})`,
    channelTitle: 'YouTube Content',
    videoUrl,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const res = await fetch(oembedUrl);
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
    console.warn('[Worker Metadata Warning]:', err);
  }
  return defaultMeta;
}

async function fetchInnerTubeTracks(videoId, clientName = 'ANDROID', clientVersion = '20.10.38', ua = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)') {
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ua,
        'X-Youtube-Client-Name': clientName === 'ANDROID' ? '3' : clientName === 'ANDROID_VR' ? '28' : '1',
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

    const httpStatus = response.status;
    if (!response.ok) {
      console.log(`[Worker Diagnostics] InnerTube (${clientName}) HTTP Status: ${httpStatus} for videoId=${videoId}`);
      return { tracks: [], httpStatus };
    }

    const data = await response.json();
    const playabilityStatus = data?.playabilityStatus?.status || 'N/A';
    const reason = data?.playabilityStatus?.reason || data?.playabilityStatus?.errorScreen?.playerErrorMessageRenderer?.reason?.runs?.[0]?.text || 'N/A';
    const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const hasCaptions = Array.isArray(captionTracks) && captionTracks.length > 0;
    const count = hasCaptions ? captionTracks.length : 0;
    const isBotRestricted = playabilityStatus === 'LOGIN_REQUIRED' || reason.toLowerCase().includes('bot') || reason.toLowerCase().includes('sign in');

    console.log(`[Worker Diagnostics] Strategy InnerTube (${clientName}): videoId=${videoId}, httpStatus=${httpStatus}, playerResponseReceived=true, playabilityStatus="${playabilityStatus}", reason="${reason}", captionsExist=${hasCaptions}, captionTracksCount=${count}, isBotRestricted=${isBotRestricted}`);

    if (!hasCaptions) {
      return { tracks: [], httpStatus, playabilityStatus, reason };
    }

    const tracks = captionTracks.map((t) => ({
      baseUrl: t.baseUrl ? t.baseUrl.replace(/\\u0026/g, '&').replace(/&amp;/g, '&') : '',
      languageCode: t.languageCode || 'en',
      kind: t.kind,
      vssId: t.vssId,
      name: t.name?.runs?.[0]?.text || t.name?.simpleText,
    })).filter(t => Boolean(t.baseUrl));

    return { tracks, httpStatus, playabilityStatus, reason };
  } catch (err) {
    console.warn(`[Worker Diagnostics] Strategy InnerTube (${clientName}) Exception: videoId=${videoId}, error="${err?.message || err}"`);
    return { tracks: [], httpStatus: 500 };
  }
}

async function fetchWatchPageTracks(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+410; SOCS=CAESEwgDEgk0ODE3Nzk3MjAaAmVuIAEaBgiA_LyaBg',
      },
    });

    const httpStatus = response.status;
    if (!response.ok) {
      console.log(`[Worker Diagnostics] Strategy Watch Page HTTP Status: ${httpStatus} for videoId=${videoId}`);
      return { tracks: [], httpStatus };
    }

    const html = await response.text();
    const captchaDetected = html.includes('class="g-recaptcha"') || html.includes('/sorry/image');
    const captionTracksMatch = html.match(/"captionTracks":\s*(\[.*?\])/) || html.match(/\\"captionTracks\\":\s*(\[.*?\])/);
    let tracks = [];

    if (captionTracksMatch) {
      try {
        const unescaped = captionTracksMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const parsed = JSON.parse(unescaped);
        if (Array.isArray(parsed) && parsed.length > 0) {
          tracks = parsed.map((t) => ({
            baseUrl: t.baseUrl ? t.baseUrl.replace(/\\u0026/g, '&').replace(/&amp;/g, '&') : '',
            languageCode: t.languageCode || 'en',
            kind: t.kind,
            vssId: t.vssId,
            name: t.name?.runs?.[0]?.text || t.name?.simpleText,
          })).filter(t => Boolean(t.baseUrl));
        }
      } catch (e) {
        // Continue
      }
    }

    console.log(`[Worker Diagnostics] Strategy Watch Page: videoId=${videoId}, httpStatus=${httpStatus}, htmlLength=${html.length}, captchaDetected=${captchaDetected}, matchedCaptions=${tracks.length > 0}, captionTracksCount=${tracks.length}`);

    return { tracks, httpStatus };
  } catch (err) {
    console.warn(`[Worker Diagnostics] Strategy Watch Page Exception: videoId=${videoId}, error="${err?.message || err}"`);
    return { tracks: [], httpStatus: 500 };
  }
}

async function extractRawTranscriptFromTracks(videoId, tracks, methodLabel) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

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
    if (!track.languageCode?.toLowerCase().startsWith('en') && !targetXmlUrl.includes('&tlang=')) {
      targetXmlUrl = `${targetXmlUrl}&tlang=en`;
    }

    try {
      const xmlRes = await fetch(targetXmlUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      console.log(`[Worker Diagnostics] XML Fetch: videoId=${videoId}, lang=${track.languageCode}, status=${xmlRes.status}, method=${methodLabel}`);

      if (xmlRes.ok) {
        const xmlText = await xmlRes.text();
        if (xmlText.trim().length > 0) {
          const textLines = parseTranscriptXml(xmlText);
          if (textLines.length > 0) {
            const rawTranscript = textLines.join(' ');
            console.log(`[Worker Diagnostics] XML Extract Success: videoId=${videoId}, lang=${track.languageCode}, textLinesCount=${textLines.length}, rawLength=${rawTranscript.length} chars`);
            return rawTranscript;
          }
        }
      }
    } catch (err) {
      console.warn(`[Worker Diagnostics] XML Fetch Warning for lang=${track.languageCode}: videoId=${videoId}, error="${err?.message || err}"`);
    }
  }

  return null;
}

const handleTranscriptRequest = async (req, res) => {
  if (WORKER_SECRET) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    if (token !== WORKER_SECRET) {
      console.warn('[Worker Auth Warning] Secret mismatch or missing Bearer token');
      return res.status(401).json({ success: false, error: 'Unauthorized worker secret' });
    }
  }

  const { videoId: reqVideoId, url } = req.body || {};
  const videoId = reqVideoId || extractVideoId(url);

  console.log(`[Worker Incoming Request] videoId=${videoId || 'NULL'}, url=${url || 'NULL'}`);

  if (!videoId) {
    return res.status(400).json({ success: false, error: 'Invalid or missing YouTube videoId/URL' });
  }

  const metadata = await fetchVideoMetadata(videoId);
  let extractionMethod = '';

  // Strategy 1: InnerTube API (ANDROID 20.10.38)
  const res1 = await fetchInnerTubeTracks(videoId, 'ANDROID', '20.10.38', 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)');
  if (res1.tracks.length > 0) {
    const raw1 = await extractRawTranscriptFromTracks(videoId, res1.tracks, 'InnerTube (ANDROID)');
    if (raw1) {
      extractionMethod = 'InnerTube (ANDROID)';
      console.log(`[Worker Success] videoId=${videoId}, length=${raw1.length} chars, method="${extractionMethod}"`);
      return res.json({ success: true, rawTranscript: raw1, metadata });
    }
  }

  // Strategy 2: InnerTube API (ANDROID_VR 1.54.1)
  const res2 = await fetchInnerTubeTracks(videoId, 'ANDROID_VR', '1.54.1', 'com.google.android.youtube.vr/1.54.1 (Linux; U; Android 12)');
  if (res2.tracks.length > 0) {
    const raw2 = await extractRawTranscriptFromTracks(videoId, res2.tracks, 'InnerTube (ANDROID_VR)');
    if (raw2) {
      extractionMethod = 'InnerTube (ANDROID_VR)';
      console.log(`[Worker Success] videoId=${videoId}, length=${raw2.length} chars, method="${extractionMethod}"`);
      return res.json({ success: true, rawTranscript: raw2, metadata });
    }
  }

  // Strategy 3: Direct Watch Page Scraping
  const res3 = await fetchWatchPageTracks(videoId);
  if (res3.tracks.length > 0) {
    const raw3 = await extractRawTranscriptFromTracks(videoId, res3.tracks, 'Watch Page HTML');
    if (raw3) {
      extractionMethod = 'Watch Page HTML';
      console.log(`[Worker Success] videoId=${videoId}, length=${raw3.length} chars, method="${extractionMethod}"`);
      return res.json({ success: true, rawTranscript: raw3, metadata });
    }
  }

  // Strategy 4: youtube-transcript package fallback
  try {
    console.log(`[Worker Diagnostics] Strategy 4 (youtube-transcript package) attempting for videoId=${videoId}`);
    const pkgItems = await YoutubeTranscript.fetchTranscript(videoId).catch((e) => {
      console.warn(`[Worker Diagnostics] Strategy 4 (youtube-transcript package) failed for videoId=${videoId}: ${e?.message || e}`);
      return null;
    });

    if (pkgItems && Array.isArray(pkgItems) && pkgItems.length > 0) {
      const rawTranscript = pkgItems.map(i => i.text).join(' ');
      extractionMethod = 'youtube-transcript package';
      console.log(`[Worker Success] videoId=${videoId}, length=${rawTranscript.length} chars, method="${extractionMethod}"`);
      return res.json({ success: true, rawTranscript, metadata });
    }
  } catch (err) {
    console.warn(`[Worker Diagnostics] Strategy 4 Exception for videoId=${videoId}:`, err?.message || err);
  }

  console.error(`[Worker Failed] All 4 caption extraction strategies returned zero tracks for videoId=${videoId}`);
  return res.status(422).json({
    success: false,
    error: 'We couldn\'t access a transcript for this video. YouTube caption data was empty across all extraction strategies.',
  });
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/api/transcript', handleTranscriptRequest);
app.post('/transcript', handleTranscriptRequest);

app.listen(PORT, () => {
  console.log(`🚀 KWIP Transcript Worker listening on port ${PORT}`);
});
