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

  try {
    // Strategy 1: InnerTube API Context
    const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
        'X-Youtube-Client-Name': '3',
        'X-Youtube-Client-Version': '20.10.38',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en', gl: 'US' } },
        videoId,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(captionTracks) && captionTracks.length > 0) {
        const track = captionTracks.find(t => t.languageCode?.startsWith('en')) || captionTracks[0];
        if (track?.baseUrl) {
          const xmlUrl = track.baseUrl.replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
          const xmlRes = await fetch(xmlUrl);
          if (xmlRes.ok) {
            const xmlText = await xmlRes.text();
            const textLines = parseTranscriptXml(xmlText);
            if (textLines.length > 0) {
              const rawTranscript = textLines.join(' ');
              console.log(`[Worker Success] videoId=${videoId}, length=${rawTranscript.length} chars (Strategy: InnerTube)`);
              return res.json({
                success: true,
                rawTranscript,
                metadata,
              });
            }
          }
        }
      }
    }

    // Strategy 2: youtube-transcript package
    const pkgItems = await YoutubeTranscript.fetchTranscript(videoId).catch(() => null);
    if (pkgItems && Array.isArray(pkgItems) && pkgItems.length > 0) {
      const rawTranscript = pkgItems.map(i => i.text).join(' ');
      console.log(`[Worker Success] videoId=${videoId}, length=${rawTranscript.length} chars (Strategy: youtube-transcript)`);
      return res.json({
        success: true,
        rawTranscript,
        metadata,
      });
    }

    console.warn(`[Worker Failed] No transcript tracks found for videoId=${videoId}`);
    return res.status(422).json({ success: false, error: 'No transcript found for video' });
  } catch (err) {
    console.error('[Worker Error]:', err);
    return res.status(500).json({ success: false, error: err.message || 'Worker processing error' });
  }
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/api/transcript', handleTranscriptRequest);
app.post('/transcript', handleTranscriptRequest);

app.listen(PORT, () => {
  console.log(`🚀 KWIP Transcript Worker listening on port ${PORT}`);
});
