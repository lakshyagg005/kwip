import { KwipAnalysisResult } from '@/types/kwip';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function cleanGenericPrefix(text: string | undefined): string {
  if (!text) return '';
  let cleaned = text.trim();
  const prefixes = [
    /^in this video\s*(,|:|—|-)?\s*/i,
    /^this video\s*(,|:|—|-)?\s*/i,
    /^this summary\s*(,|:|—|-)?\s*/i,
    /^an in-depth synthesis of\s*(,|:|—|-)?\s*/i,
    /^an executive summary synthesizing\s*(,|:|—|-)?\s*/i,
    /^this presentation\s*(,|:|—|-)?\s*/i,
    /^in this tutorial\s*(,|:|—|-)?\s*/i,
    /^this guide\s*(,|:|—|-)?\s*/i,
  ];
  for (const p of prefixes) {
    cleaned = cleaned.replace(p, '').trim();
  }
  const verbs = /^(we learn that|the speaker|speaker)?\s*(discusses|covers|explores|breaks down|provides|presents|synthesizes|explains|delves into|examines|outlines)\s*(how|why|that|the)?\s*/i;
  cleaned = cleaned.replace(verbs, '').trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

const FORBIDDEN_FILLER_PHRASES = [
  'essential breakdown of the core insights',
  'key visual breakdown and key takeaways',
  'primary value proposition placeholder',
  'key insight #',
];

/**
 * Validates generated content for completeness, lack of generic filler, and distinct key ideas.
 */
export function validateAnalysisResult(data: Partial<KwipAnalysisResult>): ValidationResult {
  if (!data) {
    return { valid: false, reason: 'Analysis result is null or undefined' };
  }

  const hookCleaned = cleanGenericPrefix(data.hook);
  const summaryCleaned = cleanGenericPrefix(data.executiveSummary);
  const takeawayCleaned = cleanGenericPrefix(data.finalTakeaway);

  // 1. Title validation
  if (!data.title || data.title.trim().length < 4) {
    return { valid: false, reason: 'Title is missing or suspiciously short' };
  }

  // 2. Hook validation
  if (!hookCleaned || hookCleaned.length < 10) {
    return { valid: false, reason: 'Hook is missing or suspiciously short' };
  }

  // 3. Executive Summary validation
  if (!summaryCleaned || summaryCleaned.length < 15) {
    return { valid: false, reason: 'Executive summary is missing or suspiciously short' };
  }

  // 4. Final Takeaway validation
  if (!takeawayCleaned || takeawayCleaned.length < 8) {
    return { valid: false, reason: 'Final takeaway is missing or suspiciously short' };
  }

  // 5. Key Ideas validation
  if (!Array.isArray(data.keyIdeas) || data.keyIdeas.length < 2) {
    return { valid: false, reason: 'Must contain at least 2 distinct key ideas' };
  }

  for (const idea of data.keyIdeas) {
    if (!idea.title || idea.title.trim().length < 3) {
      return { valid: false, reason: `Key idea #${idea.number} has empty or short title` };
    }
    if (!idea.summary || idea.summary.trim().length < 8) {
      return { valid: false, reason: `Key idea #${idea.number} summary is empty or too short` };
    }
    if (!idea.explanation || idea.explanation.trim().length < 8) {
      return { valid: false, reason: `Key idea #${idea.number} explanation is empty or too short` };
    }
  }

  // 6. Title repetition check: Core thesis and executive summary must NOT be identical to video title
  const videoTitleLower = (data.source?.videoTitle || data.title || '').trim().toLowerCase();
  if (videoTitleLower.length > 8) {
    if (hookCleaned.toLowerCase() === videoTitleLower) {
      return { valid: false, reason: 'Core thesis repeats or restates the video title' };
    }
    if (summaryCleaned.toLowerCase() === videoTitleLower) {
      return { valid: false, reason: 'Executive summary repeats or restates the video title' };
    }
  }

  // 7. Statistics fidelity validation (must contain real quantitative numbers if present)
  if (Array.isArray(data.statistics)) {
    for (const stat of data.statistics) {
      if (stat.value && !/\d|\$|%/.test(stat.value)) {
        return { valid: false, reason: `Statistic "${stat.value}" lacks quantitative numeric data` };
      }
    }
  }

  // 8. Generic filler phrases check
  const allText = [
    data.title,
    hookCleaned,
    summaryCleaned,
    takeawayCleaned,
    ...data.keyIdeas.flatMap((i) => [i.title, i.summary, i.explanation, i.example || '']),
  ]
    .join(' ')
    .toLowerCase();

  for (const phrase of FORBIDDEN_FILLER_PHRASES) {
    if (allText.includes(phrase)) {
      return { valid: false, reason: `Contains forbidden generic filler phrase: "${phrase}"` };
    }
  }

  // 9. Check for duplicate key idea titles
  const titles = data.keyIdeas.map((i) => i.title.trim().toLowerCase());
  const uniqueTitles = new Set(titles);
  if (uniqueTitles.size < titles.length) {
    return { valid: false, reason: 'Duplicate key idea titles detected' };
  }

  // Check Jaccard similarity across key idea summaries
  for (let i = 0; i < data.keyIdeas.length; i++) {
    for (let j = i + 1; j < data.keyIdeas.length; j++) {
      const wordsA = new Set(data.keyIdeas[i].summary.toLowerCase().split(/\W+/).filter(Boolean));
      const wordsB = new Set(data.keyIdeas[j].summary.toLowerCase().split(/\W+/).filter(Boolean));
      const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
      const union = new Set([...wordsA, ...wordsB]);
      const similarity = intersection.size / union.size;

      if (similarity > 0.88) {
        return {
          valid: false,
          reason: `Key ideas #${data.keyIdeas[i].number} and #${data.keyIdeas[j].number} are nearly identical (${Math.round(similarity * 100)}% word overlap)`,
        };
      }
    }
  }

  return { valid: true };
}

