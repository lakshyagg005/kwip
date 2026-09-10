import { z } from 'zod';
import { executeAICompletion } from './orchestrator';
import { validateAnalysisResult } from './validator';
import { splitTranscriptIntoChunks, TranscriptChunk } from './chunker';
import { KwipAnalysisResult, TemplateStyle, OutputFormat, SourceMetadata, KeyIdea, Statistic, Quote, ActionStep } from '@/types/kwip';
import { normalizeDurationToSeconds } from '@/lib/youtube';

export const KwipAnalysisSchema = z.object({
  contentType: z.enum(['educational', 'podcast', 'tutorial', 'business', 'documentary']),
  title: z.string().min(3),
  hook: z.string().min(5),
  executiveSummary: z.string().min(10),
  keyIdeas: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      summary: z.string(),
      explanation: z.string(),
      example: z.string().optional(),
      tag: z.string().optional(),
    })
  ).min(2).max(14),
  framework: z
    .object({
      title: z.string(),
      subtitle: z.string().optional(),
      steps: z.array(
        z.object({
          stepNumber: z.number(),
          title: z.string(),
          description: z.string(),
        })
      ),
    })
    .optional(),
  statistics: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      context: z.string(),
    })
  ).default([]),
  quotes: z.array(
    z.object({
      text: z.string(),
      speaker: z.string().optional(),
      context: z.string().optional(),
    })
  ).default([]),
  actionSteps: z.array(
    z.object({
      stepNumber: z.number(),
      action: z.string(),
      impact: z.string().optional(),
    })
  ).default([]),
  finalTakeaway: z.string().min(5),
});

interface ChunkAnalysisResult {
  sectionIndex: number;
  sectionLabel: string;
  timeRangeLabel?: string;
  summary: string;
  keyIdeas: KeyIdea[];
  statistics: Statistic[];
  quotes: Quote[];
  actionSteps: ActionStep[];
}

export async function generateAIAnalysis(
  transcript: string,
  metadata: SourceMetadata,
  style: TemplateStyle = 'editorial',
  formats: OutputFormat[] = ['brief', 'carousel', 'pdf'],
  requestId?: string,
  deadlineMs?: number
): Promise<KwipAnalysisResult> {
  const isLongVideo = transcript.length > 18000;

  if (isLongVideo) {
    console.log(`[AI Pipeline] [${requestId ?? '-'}] Transcript ${transcript.length} chars → Long-Video pipeline.`);
    return generateLongVideoAnalysis(transcript, metadata, style, formats, requestId, deadlineMs);
  }

  console.log(`[AI Pipeline] [${requestId ?? '-'}] Transcript ${transcript.length} chars → Direct pipeline.`);
  return generateDirectAIAnalysis(transcript, metadata, style, formats, requestId, deadlineMs);
}

async function generateDirectAIAnalysis(
  transcript: string,
  metadata: SourceMetadata,
  style: TemplateStyle,
  formats: OutputFormat[],
  requestId?: string,
  deadlineMs?: number
): Promise<KwipAnalysisResult> {
  const preparedText = prepareTranscriptText(transcript, 18000);

  const systemPrompt = `You are KWIP, an elite content strategist and source-grounded visual summary engine.
Your task is to analyze a YouTube video transcript and transform it into high-impact visual assets.

CRITICAL ACCURACY & FIDELITY INSTRUCTIONS:
1. Output MUST be ONLY valid JSON adhering strictly to the JSON schema structure below. No markdown wrappers (\`\`\`json).
2. SOURCE FIDELITY & NO HALLUCINATION:
   - Use ONLY facts, claims, metrics, and quotes explicitly present in or directly supported by the transcript.
   - NEVER invent facts, statistics, metrics, examples, quotes, timestamps, names, or conclusions.
   - DO NOT fabricate statistics, metrics, or dollar figures. Quantitative evidence MUST exist explicitly in the transcript; otherwise return an empty array [].
   - DO NOT fabricate quotes or speaker names. Quotes MUST be verbatim from the transcript or return an empty array [].
   - DO NOT use generic filler phrases like "essential breakdown", "comprehensive overview", "key visual breakdown", or "primary value proposition".
3. CONTENT-FIRST EXTRACTION & NO TEMPLATE FORCING:
   - CORE THESIS ("hook"): Write the single core thesis answering "What is the most important idea this video is actually communicating?" in 1–2 sentences. Do NOT repeat, paraphrase, or restate the video title.
   - EXECUTIVE SUMMARY ("executiveSummary"): Explain what happened, what was learned, and why it matters in 2–4 concise sentences. Do NOT begin with "This video...", "An in-depth synthesis of...", or restate the title.
   - KEY CONCEPTS ("keyIdeas"): Extract 2 to 12 distinct substantive concepts grounded in the transcript based on actual content depth. Do NOT force a fixed count (like 6) or invent concepts to fill space.
   - EXAMPLES ("example"): Include an example ONLY if explicitly mentioned in the video transcript; otherwise omit the field or set to null/undefined.
   - ACTIONABLE TAKEAWAYS ("actionSteps"): Derive recommendations strictly from what the speaker actually recommends. Do NOT invent generic startup or productivity advice unless discussed in the transcript.
   - FINAL SYNTHESIS ("finalTakeaway"): Concise synthesis of actual content and implications in 1 memorable sentence without title duplication or boilerplate.
   - If transcript lacks evidence for statistics, quotes, or examples, return [] or omit rather than generating filler.

JSON SCHEMA STRUCTURE:
{
  "contentType": "educational" | "podcast" | "tutorial" | "business" | "documentary",
  "title": "A sharp, compelling title reflecting exact video topic (max 10 words)",
  "hook": "Single powerful sentence stating the core thesis or central argument of this video",
  "executiveSummary": "Concise 2-4 sentence overview explaining what happened, what was learned, and why it matters",
  "keyIdeas": [
    {
      "number": 1,
      "title": "Action-Oriented Concept Title",
      "summary": "1-2 complete sentences explaining the core concept directly from transcript",
      "explanation": "2-3 complete sentences providing context or principle directly from transcript",
      "example": "Real-world example, case study, or metric explicitly mentioned in the video (omit if absent)",
      "tag": "Short 1-2 word concept tag like 'Strategy' or 'Tools'"
    }
  ],
  "framework": {
    "title": "Named Framework / Process (if explicitly present in video, else omit)",
    "subtitle": "Brief subtitle explaining the process",
    "steps": [
      { "stepNumber": 1, "title": "Step Name", "description": "What happens in this step" }
    ]
  },
  "statistics": [
    { "value": "Exact stat or %", "label": "Short label", "context": "Context from video" }
  ],
  "quotes": [
    { "text": "Verbatim quote", "speaker": "Speaker name if known", "context": "When or why this was said" }
  ],
  "actionSteps": [
    { "stepNumber": 1, "action": "Actionable takeaway derived from video", "impact": "Expected outcome" }
  ],
  "finalTakeaway": "One memorable, lingering concluding takeaway sentence."
};."
}`;

  const userPrompt = `VIDEO TITLE: "${metadata.videoTitle}"
CHANNEL: "${metadata.channelTitle}"

TRANSCRIPT TO ANALYZE:
${preparedText}`;

  let completion = await executeAICompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    // Direct analysis: schema output is ~1200–1800 tokens; cap at 2400 for safety
    max_tokens: 2400,
    requestId,
    deadlineMs,
  });

  let cleanedJson = sanitizeJsonString(completion.content);
  let parsedData: any;

  try {
    parsedData = JSON.parse(cleanedJson);
  } catch (parseError) {
    console.error(`[${requestId ?? '-'}] Failed to parse JSON from AI model (${completion.providerName}):`, parseError);
    parsedData = {};
  }

  let valCheck = validateAnalysisResult(parsedData);

  if (!valCheck.valid) {
    console.warn(`[${requestId ?? '-'}] [Validator] Initial output failed validation (${valCheck.reason}). Retrying with targeted prompt...`);

    const retryPrompt = `${userPrompt}

IMPORTANT RETRY NOTICE:
Your previous response was rejected because: ${valCheck.reason}.
Please re-analyze the transcript and ensure:
1. Provide 2 to 12 substantive, distinct key ideas based on actual content depth.
2. Every field contains specific facts, metrics, and insights directly from the transcript.
3. No generic filler phrases or template text are used.
4. Output strictly valid JSON matching the schema without codeblocks.`;

    try {
      completion = await executeAICompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: retryPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2400,
        requestId,
        deadlineMs,
      });

      cleanedJson = sanitizeJsonString(completion.content);
      try {
        const retryParsed = JSON.parse(cleanedJson);
        const retryValCheck = validateAnalysisResult(retryParsed);

        if (retryValCheck.valid) {
          parsedData = retryParsed;
          valCheck = retryValCheck;
        }
      } catch (retryParseErr) {
        console.warn(`[${requestId ?? '-'}] [Validator] Retry JSON parse failed:`, retryParseErr);
      }
    } catch (retryErr) {
      console.warn(`[${requestId ?? '-'}] [Validator] Retry completion failed:`, retryErr);
    }
  }

  const sanitizedData = sanitizeAndRepairParsedData(parsedData, metadata.videoTitle);

  return {
    id: 'kwip_' + Math.random().toString(36).substring(2, 9),
    createdAt: new Date().toISOString(),
    contentType: sanitizedData.contentType || 'educational',
    title: sanitizedData.title || metadata.videoTitle,
    hook: sanitizedData.hook,
    executiveSummary: sanitizedData.executiveSummary,
    keyIdeas: sanitizedData.keyIdeas || [],
    framework: sanitizedData.framework?.steps?.length ? sanitizedData.framework : undefined,
    statistics: sanitizedData.statistics || [],
    quotes: sanitizedData.quotes || [],
    actionSteps: sanitizedData.actionSteps || [],
    finalTakeaway: sanitizedData.finalTakeaway,
    source: metadata,
    style,
    selectedFormats: formats,
    isPublic: false,
  };
}

async function generateLongVideoAnalysis(
  transcript: string,
  metadata: SourceMetadata,
  style: TemplateStyle,
  formats: OutputFormat[],
  requestId?: string,
  deadlineMs?: number
): Promise<KwipAnalysisResult> {
  const durationSec = normalizeDurationToSeconds(metadata.duration) ?? 0;
  const chunks = splitTranscriptIntoChunks(transcript, {
    maxChunkChars: 10000,
    overlapChars: 1000,
    totalDurationSeconds: durationSec,
  });

  console.log(`[Long-Video] [${requestId ?? '-'}] ${chunks.length} chunks | deadline=${deadlineMs ? new Date(deadlineMs).toISOString() : 'none'}`);

  const chunkResults: ChunkAnalysisResult[] = [];
  const MIN_REMAINING_FOR_CHUNK_MS = 30_000;

  for (let i = 0; i < chunks.length; i++) {
    const remainingMs = deadlineMs ? deadlineMs - Date.now() : Infinity;
    if (remainingMs < MIN_REMAINING_FOR_CHUNK_MS) {
      console.warn(`[Long-Video] [${requestId ?? '-'}] Deadline near (${Math.round(remainingMs / 1000)}s left). Stopping at chunk ${i + 1}/${chunks.length}.`);
      break;
    }

    console.log(`[Long-Video] [${requestId ?? '-'}] chunk ${i + 1}/${chunks.length} start remaining=${Math.round(remainingMs / 1000)}s`);
    const result = await analyzeSingleChunk(chunks[i], metadata, requestId, deadlineMs);
    if (result) chunkResults.push(result);
    console.log(`[Long-Video] [${requestId ?? '-'}] chunk ${i + 1}/${chunks.length} ${result ? 'ok' : 'failed'}`);

    if (i < chunks.length - 1 && (deadlineMs ? deadlineMs - Date.now() : Infinity) > MIN_REMAINING_FOR_CHUNK_MS) {
      await new Promise((res) => setTimeout(res, 600));
    }
  }

  const successfulCount = chunkResults.length;
  const failedCount = chunks.length - successfulCount;
  console.log(`[Long-Video] [${requestId ?? '-'}] chunks: ${successfulCount} ok / ${failedCount} failed / ${chunks.length} total`);

  if (successfulCount < Math.ceil(chunks.length * 0.7)) {
    console.error(`[Long-Video] [${requestId ?? '-'}] Only ${successfulCount}/${chunks.length} chunks succeeded (<70%). Aborting.`);
    throw new Error('ANALYSIS_INCOMPLETE: Unable to analyze enough sections.');
  }

  chunkResults.sort((a, b) => a.sectionIndex - b.sectionIndex);
  console.log(`[Long-Video] [${requestId ?? '-'}] Starting synthesis pass...`);
  const synthesizedData = await synthesizeChunkResults(chunkResults, metadata, requestId, deadlineMs);

  const sanitizedData = sanitizeAndRepairParsedData(synthesizedData, metadata.videoTitle);

  return {
    id: 'kwip_' + Math.random().toString(36).substring(2, 9),
    createdAt: new Date().toISOString(),
    contentType: sanitizedData.contentType || 'educational',
    title: sanitizedData.title || metadata.videoTitle,
    hook: sanitizedData.hook,
    executiveSummary: sanitizedData.executiveSummary,
    keyIdeas: sanitizedData.keyIdeas || [],
    framework: sanitizedData.framework?.steps?.length ? sanitizedData.framework : undefined,
    statistics: sanitizedData.statistics || [],
    quotes: sanitizedData.quotes || [],
    actionSteps: sanitizedData.actionSteps || [],
    finalTakeaway: sanitizedData.finalTakeaway,
    source: metadata,
    style,
    selectedFormats: formats,
    isPublic: false,
  };
}

function parseLooseChunkJson(text: string): any {
  const summaryMatch = text.match(/"summary"\s*:\s*"([^"]+)"/i) || text.match(/"summary"\s*:\s*"([\s\S]*?)"\s*,/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : 'Section overview from source video.';

  const keyIdeas: KeyIdea[] = [];
  const ideaRegex = /"title"\s*:\s*"([^"]+)"[\s\S]*?"summary"\s*:\s*"([^"]+)"/gi;
  let match: RegExpExecArray | null;
  let idx = 1;

  while ((match = ideaRegex.exec(text)) !== null) {
    if (match[1] && match[2]) {
      keyIdeas.push({
        number: idx++,
        title: match[1].trim(),
        summary: match[2].trim(),
        explanation: match[2].trim(),
        tag: 'Insight',
      });
    }
  }

  return {
    summary,
    keyIdeas,
    statistics: [],
    quotes: [],
    actionSteps: [],
  };
}

async function analyzeSingleChunk(
  chunk: TranscriptChunk,
  metadata: SourceMetadata,
  requestId?: string,
  deadlineMs?: number
): Promise<ChunkAnalysisResult | null> {
  const systemPrompt = `You are KWIP Section Analyzer. Analyze section ${chunk.index} of ${chunk.totalChunks} (${chunk.timeRangeLabel || chunk.sectionLabel}) of a YouTube video transcript. Extract ONLY facts present in the text. Output strict valid JSON (no markdown).

SCHEMA: {"summary":"1-2 sentences","keyIdeas":[{"number":1,"title":"","summary":"","explanation":"","example":"","tag":""}],"statistics":[{"value":"","label":"","context":""}],"quotes":[{"text":"","speaker":"","context":""}],"actionSteps":[{"stepNumber":1,"action":"","impact":""}]}

Rules: No hallucination. If no stats/quotes exist, return []. Do NOT explain your reasoning.`;
  const userPrompt = `VIDEO TITLE: "${metadata.videoTitle}"\nTRANSCRIPT SECTION:\n${chunk.text}`;

  try {
    const completion = await executeAICompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1500,
      requestId,
      deadlineMs,
    });

    const cleaned = sanitizeJsonString(completion.content);
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      parsed = parseLooseChunkJson(cleaned);
    }

    return {
      sectionIndex: chunk.index,
      sectionLabel: chunk.sectionLabel,
      timeRangeLabel: chunk.timeRangeLabel,
      summary: parsed.summary || '',
      keyIdeas: Array.isArray(parsed.keyIdeas) ? parsed.keyIdeas : [],
      statistics: Array.isArray(parsed.statistics) ? parsed.statistics : [],
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
      actionSteps: Array.isArray(parsed.actionSteps) ? parsed.actionSteps : [],
    };
  } catch (err) {
    return null;
  }
}

async function synthesizeChunkResults(
  chunkResults: ChunkAnalysisResult[],
  metadata: SourceMetadata,
  requestId?: string,
  deadlineMs?: number
): Promise<any> {
  const mergedSectionDetails = chunkResults
    .map(
      (c) =>
        `--- SECTION ${c.sectionIndex} ${c.timeRangeLabel ? `(${c.timeRangeLabel})` : ''} ---
Summary: ${c.summary}
Key Ideas: ${JSON.stringify(c.keyIdeas)}
Stats: ${JSON.stringify(c.statistics)}
Quotes: ${JSON.stringify(c.quotes)}
Actions: ${JSON.stringify(c.actionSteps)}`
    )
    .join('\n\n');

  const systemPrompt = `You are KWIP Master Synthesizer. Merge section findings into one unified analysis. Output strict valid JSON.

JSON SCHEMA:
{"contentType":"educational|podcast|tutorial|business|documentary","title":"max 10 words","hook":"1-2 sentences","executiveSummary":"2-4 sentences","keyIdeas":[{"number":1,"title":"","summary":"","explanation":"","example":"","tag":""}],"framework":{"title":"","subtitle":"","steps":[{"stepNumber":1,"title":"","description":""}]},"statistics":[{"value":"","label":"","context":""}],"quotes":[{"text":"","speaker":"","context":""}],"actionSteps":[{"stepNumber":1,"action":"","impact":""}],"finalTakeaway":""}`;

  const userPrompt = `VIDEO: "${metadata.videoTitle}" by ${metadata.channelTitle}\n\nSECTION FINDINGS:\n${mergedSectionDetails}`;

  try {
    const completion = await executeAICompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      // Synthesis schema output is ~1500–2500 tokens; cap at 3200 for safety
      max_tokens: 3200,
      requestId,
      deadlineMs,
    });

    const cleaned = sanitizeJsonString(completion.content);
    try {
      const parsed = JSON.parse(cleaned);
      console.log(`[Synthesizer] [${requestId ?? '-'}] SUCCESS: title="${parsed.title}" keyIdeas=${parsed.keyIdeas?.length ?? 0}`);
      return parsed;
    } catch (parseErr) {
      console.warn(`[Synthesizer] [${requestId ?? '-'}] JSON parse failed, using local fallback.`);
    }
  } catch (err) {
    console.warn(`[Synthesizer] [${requestId ?? '-'}] AI call failed, using local fallback:`, err);
  }

  // Local fallback — merge chunk results without AI
  const mergedKeyIdeas = chunkResults.flatMap((c) => c.keyIdeas);
  const mergedStats = chunkResults.flatMap((c) => c.statistics);
  const mergedQuotes = chunkResults.flatMap((c) => c.quotes);
  const mergedActions = chunkResults.flatMap((c) => c.actionSteps);

  const deduplicatedIdeas = mergedKeyIdeas.slice(0, 10).map((idea, idx) => ({
    number: idx + 1,
    title: idea.title || `Core Insight ${idx + 1}`,
    summary: idea.summary || idea.explanation || 'Key takeaway from video section.',
    explanation: idea.explanation || idea.summary || 'Detailed insight from video discussion.',
    example: idea.example,
    tag: idea.tag || 'Insight',
  }));

  return {
    contentType: 'educational',
    title: metadata.videoTitle,
    hook: deduplicatedIdeas[0]?.summary || 'Core insight from source material.',
    executiveSummary: deduplicatedIdeas.slice(0, 3).map((i) => i.summary).join(' ') || 'Synthesis of key ideas from this video.',
    keyIdeas: deduplicatedIdeas,
    statistics: mergedStats.slice(0, 4),
    quotes: mergedQuotes.slice(0, 3),
    actionSteps: mergedActions.slice(0, 4),
    finalTakeaway: mergedActions[0]?.action || deduplicatedIdeas[deduplicatedIdeas.length - 1]?.summary || 'Primary recommendation from source analysis.',
  };
}


export function prepareTranscriptText(transcript: string, maxChars = 18000): string {
  if (transcript.length <= maxChars) {
    return transcript;
  }

  const sectionLen = Math.floor(transcript.length / 4);
  const samplePerSection = Math.floor(maxChars / 4);

  const part1 = transcript.slice(0, samplePerSection);
  const part2 = transcript.slice(sectionLen, sectionLen + samplePerSection);
  const part3 = transcript.slice(sectionLen * 2, sectionLen * 2 + samplePerSection);
  const part4 = transcript.slice(transcript.length - samplePerSection);

  return `[PART 1 - INTRODUCTION]\n${part1}\n\n[PART 2 - CORE DISCUSSION]\n${part2}\n\n[PART 3 - KEY STRATEGY]\n${part3}\n\n[PART 4 - CONCLUSION]\n${part4}`;
}

export function sanitizeJsonString(str: string): string {
  if (!str || typeof str !== 'string') return '{}';

  let cleaned = str.trim();

  // Strip markdown code block wrappers
  cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/i, '').trim();

  // Extract JSON payload bounded by outermost braces
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  // Remove trailing commas before closing braces/brackets (e.g. { "a": 1, } or [1, 2, ])
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // Replace literal unescaped control characters inside JSON strings
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? ' ' : ''));

  return cleaned;
}

const GENERIC_PLACEHOLDERS = [
  'distinct actionable concept title',
  'distinct actionable title',
  'action-oriented title',
  'core concept explanation',
  'metric or real example mentioned',
  'concept tag',
  'stat or %',
  'short label',
  'context from section',
  'verbatim quote',
  'takeaway action',
];

function isPlaceholderText(text: string | undefined): boolean {
  if (!text) return true;
  const lower = text.trim().toLowerCase();
  return GENERIC_PLACEHOLDERS.some((p) => lower.includes(p));
}

export function isTitleCopyOrGeneric(text: string | undefined, title: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 10) return true;
  if (isPlaceholderText(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  const lowerTitle = title.trim().toLowerCase();

  // Check forbidden starting or boilerplate phrases
  if (
    lower.startsWith('this video') ||
    lower.startsWith('an in-depth synthesis of') ||
    lower.startsWith('core thesis and primary lessons from') ||
    lower.startsWith('in this video') ||
    lower.startsWith('this summary') ||
    lower.startsWith('an executive summary synthesizing') ||
    lower.startsWith('apply these core insights from')
  ) {
    return true;
  }

  // If text contains the exact video title (and video title is longer than 5 chars), treat as title copy
  if (lowerTitle.length > 5 && lower.includes(lowerTitle)) {
    return true;
  }

  return false;
}

export function sanitizeAndRepairParsedData(data: any, fallbackTitle: string): any {
  const cleanTitle = data?.title && data.title.trim().length > 3 && !isPlaceholderText(data.title)
    ? data.title.trim()
    : fallbackTitle;

  const validKeyIdeas = Array.isArray(data?.keyIdeas) && data.keyIdeas.length > 0
    ? data.keyIdeas
        .filter((idea: any) => idea && idea.title && !isPlaceholderText(idea.title) && !isPlaceholderText(idea.summary))
        .map((idea: any, idx: number) => ({
          number: idx + 1,
          title: idea.title.trim(),
          summary: idea.summary?.trim() || idea.explanation?.trim() || 'Key concept from source material.',
          explanation: idea.explanation?.trim() || idea.summary?.trim() || 'Detailed insight from source transcript.',
          example: idea.example && !isPlaceholderText(idea.example) ? idea.example.trim() : undefined,
          tag: idea.tag && !isPlaceholderText(idea.tag) ? idea.tag.trim() : 'Insight',
        }))
    : [];

  const validActions = Array.isArray(data?.actionSteps)
    ? data.actionSteps.filter((a: any) => a && a.action && !isPlaceholderText(a.action))
    : [];

  let cleanHook = data?.hook?.trim();
  if (isTitleCopyOrGeneric(cleanHook, cleanTitle)) {
    cleanHook = validKeyIdeas[0]?.summary || validKeyIdeas[0]?.explanation || 'Core lesson derived directly from transcript content.';
  }

  let cleanExecutiveSummary = data?.executiveSummary?.trim();
  if (isTitleCopyOrGeneric(cleanExecutiveSummary, cleanTitle)) {
    cleanExecutiveSummary = validKeyIdeas.slice(0, 3).map((i: any) => i.summary).join(' ') || 'Synthesis of core ideas and insights presented in the source video.';
  }

  let cleanFinalTakeaway = data?.finalTakeaway?.trim();
  if (isTitleCopyOrGeneric(cleanFinalTakeaway, cleanTitle)) {
    cleanFinalTakeaway = validActions[0]?.action || validKeyIdeas[validKeyIdeas.length - 1]?.summary || 'Primary recommendation derived directly from source analysis.';
  }

  const validStatistics = Array.isArray(data?.statistics)
    ? data.statistics.filter((s: any) => s && s.value && s.label && !isPlaceholderText(s.value) && !isPlaceholderText(s.label))
    : [];

  const validQuotes = Array.isArray(data?.quotes)
    ? data.quotes.filter((q: any) => q && q.text && !isPlaceholderText(q.text))
    : [];

  return {
    contentType: ['educational', 'podcast', 'tutorial', 'business', 'documentary'].includes(data?.contentType)
      ? data.contentType
      : 'educational',
    title: cleanTitle,
    hook: cleanHook,
    executiveSummary: cleanExecutiveSummary,
    keyIdeas: validKeyIdeas,
    framework: data?.framework && Array.isArray(data?.framework?.steps) ? data.framework : undefined,
    statistics: validStatistics,
    quotes: validQuotes,
    actionSteps: validActions,
    finalTakeaway: cleanFinalTakeaway,
  };
}
