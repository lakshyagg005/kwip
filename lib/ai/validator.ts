import { KwipAnalysisResult } from '@/types/kwip';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

const FORBIDDEN_FILLER_PHRASES = [
  'essential breakdown',
  'core message',
  'detailed explanation',
  'key visual breakdown',
  'primary value proposition',
  'important concept',
  'important insights',
  'key insight #',
  'detailed breakdown of the core principle',
  'review these insights',
  'apply these insights',
  'key visual breakdown and key takeaways',
  'essential breakdown of the core insights',
  'overview of the content',
  'as discussed in the video',
  'primary takeaways',
];

/**
 * Validates generated content for completeness, lack of generic filler, and distinct key ideas.
 */
export function validateAnalysisResult(data: Partial<KwipAnalysisResult>): ValidationResult {
  if (!data) {
    return { valid: false, reason: 'Analysis result is null or undefined' };
  }

  // 1. Title validation
  if (!data.title || data.title.trim().length < 5) {
    return { valid: false, reason: 'Title is missing or suspiciously short' };
  }

  // 2. Hook validation
  if (!data.hook || data.hook.trim().length < 15) {
    return { valid: false, reason: 'Hook is missing or suspiciously short' };
  }

  // 3. Executive Summary validation
  if (!data.executiveSummary || data.executiveSummary.trim().length < 25) {
    return { valid: false, reason: 'Executive summary is missing or suspiciously short' };
  }

  // 4. Final Takeaway validation
  if (!data.finalTakeaway || data.finalTakeaway.trim().length < 10) {
    return { valid: false, reason: 'Final takeaway is missing or suspiciously short' };
  }

  // 5. Key Ideas validation
  if (!Array.isArray(data.keyIdeas) || data.keyIdeas.length < 2) {
    return { valid: false, reason: 'Must contain at least 2 distinct key ideas' };
  }

  for (const idea of data.keyIdeas) {
    if (!idea.title || idea.title.trim().length < 4) {
      return { valid: false, reason: `Key idea #${idea.number} has empty or short title` };
    }
    if (!idea.summary || idea.summary.trim().length < 10) {
      return { valid: false, reason: `Key idea #${idea.number} summary is empty or too short` };
    }
    if (!idea.explanation || idea.explanation.trim().length < 12) {
      return { valid: false, reason: `Key idea #${idea.number} explanation is empty or too short` };
    }
  }

  // 6. Check forbidden generic opening phrases in hook or executive summary
  const forbiddenStarters = [
    'this video',
    'an in-depth synthesis of',
    'in this video',
    'this summary',
    'core thesis and primary lessons from',
    'an executive summary synthesizing',
  ];

  const hookLower = data.hook.trim().toLowerCase();
  const summaryLower = data.executiveSummary.trim().toLowerCase();

  for (const starter of forbiddenStarters) {
    if (hookLower.startsWith(starter)) {
      return { valid: false, reason: `Hook begins with forbidden generic starter: "${starter}"` };
    }
    if (summaryLower.startsWith(starter)) {
      return { valid: false, reason: `Executive summary begins with forbidden generic starter: "${starter}"` };
    }
  }

  // 7. Title repetition check: Core thesis and executive summary must NOT restate title
  const videoTitleLower = (data.source?.videoTitle || data.title || '').trim().toLowerCase();
  if (videoTitleLower.length > 8) {
    if (hookLower === videoTitleLower || (hookLower.includes(videoTitleLower) && hookLower.length - videoTitleLower.length < 15)) {
      return { valid: false, reason: 'Core thesis repeats or restates the video title' };
    }
    if (summaryLower === videoTitleLower || (summaryLower.includes(videoTitleLower) && summaryLower.length - videoTitleLower.length < 15)) {
      return { valid: false, reason: 'Executive summary repeats or restates the video title' };
    }
  }

  // 8. Statistics fidelity validation (must contain real quantitative numbers if present)
  if (Array.isArray(data.statistics)) {
    for (const stat of data.statistics) {
      if (stat.value && !/\d|\$|%/.test(stat.value)) {
        return { valid: false, reason: `Statistic "${stat.value}" lacks quantitative numeric data` };
      }
    }
  }

  // 9. Generic filler phrases check
  const allText = [
    data.title,
    data.hook,
    data.executiveSummary,
    data.finalTakeaway,
    ...data.keyIdeas.flatMap((i) => [i.title, i.summary, i.explanation, i.example || '']),
  ]
    .join(' ')
    .toLowerCase();

  for (const phrase of FORBIDDEN_FILLER_PHRASES) {
    if (allText.includes(phrase)) {
      return { valid: false, reason: `Contains forbidden generic filler phrase: "${phrase}"` };
    }
  }

  // 10. Check for duplicate key idea titles or summaries
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

      if (similarity > 0.85) {
        return {
          valid: false,
          reason: `Key ideas #${data.keyIdeas[i].number} and #${data.keyIdeas[j].number} are nearly identical (${Math.round(similarity * 100)}% word overlap)`,
        };
      }
    }
  }

  return { valid: true };
}
