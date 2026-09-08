export interface TranscriptChunk {
  index: number;
  totalChunks: number;
  text: string;
  charCount: number;
  sectionLabel: string;
  timeRangeLabel?: string;
}

export interface ChunkingOptions {
  maxChunkChars?: number;
  overlapChars?: number;
  totalDurationSeconds?: number;
}

/**
 * Intelligently splits a raw transcript into overlapping chunks for chunked AI analysis.
 * Target chunk size defaults to ~10,000 characters (~1,800-2,500 words / ~6-8 minutes of speech).
 * Overlap defaults to ~1,000 characters (~150-200 words) to ensure context continuity across boundaries.
 */
export function splitTranscriptIntoChunks(
  rawTranscript: string,
  options: ChunkingOptions = {}
): TranscriptChunk[] {
  const maxChunkChars = options.maxChunkChars ?? 10000;
  const overlapChars = options.overlapChars ?? 1000;
  const totalDuration = options.totalDurationSeconds || 0;

  const trimmed = rawTranscript.trim();
  if (trimmed.length <= maxChunkChars) {
    return [
      {
        index: 1,
        totalChunks: 1,
        text: trimmed,
        charCount: trimmed.length,
        sectionLabel: 'Full Transcript',
        timeRangeLabel: totalDuration > 0 ? `00:00–${formatSeconds(totalDuration)}` : undefined,
      },
    ];
  }

  // Split into sentence or word-boundary chunks
  const chunks: TranscriptChunk[] = [];
  let startIndex = 0;

  while (startIndex < trimmed.length) {
    let endIndex = Math.min(startIndex + maxChunkChars, trimmed.length);

    // If not at the end of text, find a natural boundary (period, question mark, or newline)
    if (endIndex < trimmed.length) {
      const boundaryMatch = trimmed.slice(startIndex, endIndex).search(/([.!?]\s+[A-Z0-9])/g);
      if (boundaryMatch !== -1 && boundaryMatch > maxChunkChars * 0.6) {
        endIndex = startIndex + boundaryMatch + 1;
      } else {
        const lastSpace = trimmed.lastIndexOf(' ', endIndex);
        if (lastSpace > startIndex + maxChunkChars * 0.6) {
          endIndex = lastSpace;
        }
      }
    }

    const chunkText = trimmed.slice(startIndex, endIndex).trim();
    if (chunkText.length > 0) {
      chunks.push({
        index: chunks.length + 1,
        totalChunks: 1, // Updated below
        text: chunkText,
        charCount: chunkText.length,
        sectionLabel: `Section ${chunks.length + 1}`,
      });
    }

    // Move startIndex forward by chunk length minus overlap
    if (endIndex >= trimmed.length) {
      break;
    }
    startIndex = endIndex - overlapChars;
  }

  const total = chunks.length;

  // Calculate estimated time range for each section if totalDuration is provided
  return chunks.map((c) => {
    let timeRangeLabel: string | undefined = undefined;
    if (totalDuration > 0) {
      const startSec = Math.floor(((c.index - 1) / total) * totalDuration);
      const endSec = Math.min(Math.floor((c.index / total) * totalDuration), totalDuration);
      timeRangeLabel = `${formatSeconds(startSec)}–${formatSeconds(endSec)}`;
    }

    return {
      ...c,
      totalChunks: total,
      sectionLabel: `Section ${c.index} of ${total}`,
      timeRangeLabel,
    };
  });
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
