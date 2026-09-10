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
  requestId?: string
): Promise<KwipAnalysisResult> {
  const isLongVideo = transcript.length > 18000;

  if (isLongVideo) {
    console.log(`[AI Pipeline] [${requestId ?? '-'}] Video "${metadata.videoTitle}" transcript is ${transcript.length} chars. Executing Long-Video pipeline.`);
    return generateLongVideoAnalysis(transcript, metadata, style, formats, requestId);
  }

  // Short/medium video direct pipeline
  return generateDirectAIAnalysis(transcript, metadata, style, formats, requestId);
}

async function generateDirectAIAnalysis(
  transcript: string,
  metadata: SourceMetadata,
  style: TemplateStyle,
  formats: OutputFormat[],
  requestId?: string
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
    max_tokens: 3000,
    requestId,
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
        max_tokens: 3000,
        requestId,
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

/**
 * Long-Video Analysis Pipeline: Chunk -> Analyze Each Chunk -> Merge & Synthesize Entire Video
 */
async function generateLongVideoAnalysis(
  transcript: string,
  metadata: SourceMetadata,
  style: TemplateStyle,
  formats: OutputFormat[],
  requestId?: string
): Promise<KwipAnalysisResult> {
  const durationSec = normalizeDurationToSeconds(metadata.duration) ?? 0;
  const chunks = splitTranscriptIntoChunks(transcript, {
    maxChunkChars: 10000,
    overlapChars: 1000,
    totalDurationSeconds: durationSec,
  });

  console.log(`\n====================================================`);
  console.log(`🔍 [TRACE 1] RAW TRANSCRIPT CHAR COUNT: ${transcript.length} chars`);
  console.log(`🔍 [TRACE 2] RAW TRANSCRIPT APPROX TOKEN COUNT: ~${Math.round(transcript.length / 4)} tokens`);
  console.log(`🔍 [TRACE 3] ESTIMATED TRANSCRIPT SENTENCE SEGMENTS: ${transcript.split(/(?<=[.!?])\s+/).length}`);
  console.log(`🔍 [TRACE 4] NUMBER OF GENERATED CHUNKS: ${chunks.length}`);
  chunks.forEach((c) => {
    console.log(`🔍 [TRACE 5&6] Chunk #${c.index}/${c.totalChunks}: ${c.charCount} chars (~${Math.round(c.charCount / 4)} tokens) | Time Range: ${c.timeRangeLabel || 'N/A'}`);
  });
  console.log(`====================================================\n`);

  // 1. Analyze chunks SEQUENTIALLY with 600ms inter-chunk delay to prevent Groq RPM bursts.
  // Concurrency = 1: one chunk at a time.
  const chunkResults: ChunkAnalysisResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const result = await analyzeSingleChunk(chunks[i], metadata, requestId);
    if (result) chunkResults.push(result);

    // Pacing delay between chunks (skip after the last one)
    if (i < chunks.length - 1) {
      await new Promise((res) => setTimeout(res, 600));
    }
  }

  const successfulCount = chunkResults.length;
  const failedCount = chunks.length - successfulCount;

  console.log(`\n====================================================`);
  console.log(`🔍 [TRACE 7] SUCCESSFUL CHUNK ANALYSES: ${successfulCount}/${chunks.length}`);
  console.log(`🔍 [TRACE 8] FAILED CHUNK ANALYSES: ${failedCount}/${chunks.length}`);

  // Verify that at least 70% of chunk analyses succeeded
  if (successfulCount < Math.ceil(chunks.length * 0.7)) {
    console.error(`[Long-Video Pipeline] Only ${successfulCount}/${chunks.length} chunks succeeded (<70%). Aborting analysis to prevent incomplete output.`);
    throw new Error('ANALYSIS_INCOMPLETE: Unable to analyze enough sections of this video due to API rate limits or network issues. Please try again in a few moments.');
  }

  let partialAnalysisWarning: string | undefined = undefined;
  if (successfulCount < chunks.length) {
    partialAnalysisWarning = `Note: ${failedCount} section(s) could not be fully analyzed due to temporary rate limits, but the remaining ${successfulCount} sections were successfully processed and synthesized.`;
    console.warn(`[Long-Video Pipeline] ${partialAnalysisWarning}`);
  }

  // Sort chunk results by section index to guarantee sequential order and prevent overwriting
  chunkResults.sort((a, b) => a.sectionIndex - b.sectionIndex);

  console.log(`🔍 [TRACE 9] CHUNK COVERAGE SUMMARY: ${chunkResults.map((c) => `Sec ${c.sectionIndex} (${c.timeRangeLabel || 'N/A'}): ${c.keyIdeas.length} ideas`).join(' | ')}`);

  // 2. Perform Final Synthesis Pass over all merged chunk findings (Beginning, Middle, and End)
  console.log(`[Long-Video Pipeline] [${requestId ?? '-'}] Synthesis pass for ${chunkResults.length}/${chunks.length} completed chunks...`);
  const synthesizedData = await synthesizeChunkResults(chunkResults, metadata, requestId);

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
    partialAnalysisWarning,
  };
}

function parseLooseChunkJson(text: string): any {
  const summaryMatch = text.match(/"summary"\s*:\s*"([^"]+)"/i) || text.match(/"summary"\s*:\s*"([\s\S]*?)"\s*,/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : 'Section overview from source video.';

  // Extract key ideas using regex pattern matching
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
  requestId?: string
): Promise<ChunkAnalysisResult | null> {
  const systemPrompt = `You are KWIP Section Analyzer.
Analyze section ${chunk.index} of ${chunk.totalChunks} (${chunk.timeRangeLabel || chunk.sectionLabel}) of a YouTube video transcript.
Extract key insights, core ideas, facts/statistics, verbatim quotes, and actionable steps ONLY from this section text.

CRITICAL INSTRUCTIONS:
1. OUTPUT FORMAT: Strict valid JSON without markdown formatting (\`\`\`json).
2. NO HALLUCINATION: Only extract facts, claims, metrics, or verbatim quotes present in THIS section.
3. If no statistics exist in this section, return empty array [].
4. If no verbatim quotes exist in this section, return empty array [].

JSON SCHEMA:
{
  "summary": "1-2 complete sentences summarizing what is discussed in this section",
  "keyIdeas": [
    {
      "number": 1,
      "title": "Distinct Actionable Concept Title",
      "summary": "Core concept explanation from this section",
      "explanation": "Deeper context or principle from this section",
      "example": "Metric or real example mentioned (if any)",
      "tag": "Concept tag"
    }
  ],
  "statistics": [
    { "value": "Stat or %", "label": "Short label", "context": "Context from section" }
  ],
  "quotes": [
    { "text": "Verbatim quote", "speaker": "Speaker name if known", "context": "Context" }
  ],
  "actionSteps": [
    { "stepNumber": 1, "action": "Takeaway action from this section", "impact": "Outcome" }
  ]
}`;

  const userPrompt = `VIDEO TITLE: "${metadata.videoTitle}"
SECTION: ${chunk.sectionLabel} ${chunk.timeRangeLabel ? `(${chunk.timeRangeLabel})` : ''}

TRANSCRIPT SECTION TEXT:
${chunk.text}`;

  try {
    const completion = await executeAICompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1800,
      requestId,
    });

    const cleaned = sanitizeJsonString(completion.content);
    let parsed: any;

    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn(`[${requestId ?? '-'}] [Chunk Analyzer] JSON.parse error on section ${chunk.index}, attempting loose regex repair...`);
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
    console.warn(`[${requestId ?? '-'}] [Chunk Analyzer] Section ${chunk.index}/${chunk.totalChunks} failed:`, err);
    return null;
  }
}

async function synthesizeChunkResults(
  chunkResults: ChunkAnalysisResult[],
  metadata: SourceMetadata,
  requestId?: string
): Promise<any> {
  // Format section summaries and findings across Beginning, Middle, and End of video
  const mergedSectionDetails = chunkResults
    .map(
      (c) =>
        `--- SECTION ${c.sectionIndex} ${c.timeRangeLabel ? `(${c.timeRangeLabel})` : ''} ---
Section Summary: ${c.summary}
Section Key Ideas (${c.keyIdeas.length}):
${JSON.stringify(c.keyIdeas, null, 2)}
Section Stats: ${JSON.stringify(c.statistics)}
Section Quotes: ${JSON.stringify(c.quotes)}
Section Actions: ${JSON.stringify(c.actionSteps)}`
    )
    .join('\n\n');

  const systemPrompt = `You are KWIP Master Synthesizer.
You are given section-by-section analysis findings from a long YouTube video ("${metadata.videoTitle}").
Your task is to merge, deduplicate, rank, and synthesize these findings into a unified, executive-grade analysis of the ENTIRE video.

CRITICAL SYNTHESIS REQUIREMENTS:
1. Output strictly valid JSON matching the exact schema below. No markdown wrappers (\`\`\`json).
2. MULTI-SECTION COVERAGE: Ensure the key ideas represent the ENTIRE video arc (Beginning, Middle, and End). Do NOT focus only on the opening section.
3. Produce 2 to 12 distinct, high-impact Key Ideas depending on actual video depth. Deduplicate overlapping ideas from adjacent sections.
4. Core Thesis ("hook"): State the central argument or main lesson of the video in 1–2 sentences. Do NOT repeat, paraphrase, or mention the video title.
5. Executive Summary ("executiveSummary"): Synthesize what the speaker actually teaches/argues in 2–4 sentences. Do NOT begin with "This video...", "An in-depth synthesis of...", or simply restate the title.
6. Statistics & Quotes: Select up to 4 genuine statistics and up to 3 verbatim quotes ONLY if present in the section data. If none exist, return empty arrays [].
7. Action Steps: Select 3 to 5 clear actionable takeaways derived from the video recommendations.
8. Final Synthesis ("finalTakeaway"): Single memorable concluding takeaway sentence synthesizing actual content. Do NOT repeat the title or generic boilerplate.

JSON SCHEMA:
{
  "contentType": "educational" | "podcast" | "tutorial" | "business" | "documentary",
  "title": "A sharp, compelling title reflecting full video content (max 10 words)",
  "hook": "Single powerful sentence stating the central thesis of the video",
  "executiveSummary": "Concise 2-4 sentence overview synthesizing the entire video discussion",
  "keyIdeas": [
    {
      "number": 1,
      "title": "Action-Oriented Title",
      "summary": "1-2 complete sentences core concept explanation",
      "explanation": "2-3 complete sentences deeper principle or takeaway",
      "example": "Real example or metric if present",
      "tag": "Concept Tag"
    }
  ],
  "framework": {
    "title": "Framework Title (if present across sections, else omit)",
    "subtitle": "Subtitle",
    "steps": [
      { "stepNumber": 1, "title": "Step Name", "description": "Description" }
    ]
  },
  "statistics": [
    { "value": "Stat", "label": "Label", "context": "Context" }
  ],
  "quotes": [
    { "text": "Quote", "speaker": "Speaker", "context": "Context" }
  ],
  "actionSteps": [
    { "stepNumber": 1, "action": "Actionable takeaway", "impact": "Impact" }
  ],
  "finalTakeaway": "One memorable lingering concluding takeaway sentence."
}`;

  console.log(`🔍 [TRACE 10] FINAL SYNTHESIS INPUT SIZE: ${mergedSectionDetails.length} chars (~${Math.round(mergedSectionDetails.length / 4)} tokens)`);

  const userPrompt = `VIDEO TITLE: "${metadata.videoTitle}"
CHANNEL: "${metadata.channelTitle}"

SECTION-BY-SECTION ANALYSIS FINDINGS (${chunkResults.length} SECTIONS COVERED):
${mergedSectionDetails}`;

  try {
    const completion = await executeAICompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
      requestId,
    });

    console.log(`🔍 [TRACE 11] FINAL SYNTHESIS OUTPUT LENGTH: ${completion.content.length} chars (~${Math.round(completion.content.length / 4)} tokens) | Model: ${completion.providerName}`);
    const cleaned = sanitizeJsonString(completion.content);
    const parsed = JSON.parse(cleaned);

    console.log(`🔍 [TRACE 12] FINAL STRUCTURED OBJECT CREATED: Title="${parsed.title}", Key Ideas=${parsed.keyIdeas?.length || 0}, Stats=${parsed.statistics?.length || 0}, Quotes=${parsed.quotes?.length || 0}`);
    return parsed;
  } catch (err) {
    console.warn('[Synthesizer] AI synthesis pass failed, building deduplicated local synthesis:', err);

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

    const fallbackHook = deduplicatedIdeas[0]?.summary || 'Core insight and central lesson from source material.';
    const fallbackExecSummary = deduplicatedIdeas.slice(0, 3).map((i) => i.summary).join(' ') || 'Comprehensive synthesis of principles discussed across sections.';
    const fallbackFinalTakeaway = mergedActions[0]?.action || deduplicatedIdeas[deduplicatedIdeas.length - 1]?.summary || 'Primary practical recommendation from source analysis.';

    return {
      contentType: 'educational',
      title: metadata.videoTitle,
      hook: fallbackHook,
      executiveSummary: fallbackExecSummary,
      keyIdeas: deduplicatedIdeas,
      statistics: mergedStats.slice(0, 4),
      quotes: mergedQuotes.slice(0, 3),
      actionSteps: mergedActions.slice(0, 4),
      finalTakeaway: fallbackFinalTakeaway,
    };
  }
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
