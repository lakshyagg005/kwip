import { KwipAnalysisResult, KeyIdea, Statistic, Quote, ActionStep } from '@/types/kwip';

export interface PreparedVisualBriefData {
  title: string;
  hook: string;
  executiveSummary: string;
  contentType: string;
  keyIdeas: KeyIdea[];
  framework?: KwipAnalysisResult['framework'];
  statistics: Statistic[];
  chartData?: { label: string; valueNum: number; displayValue: string }[];
  quotes: Quote[];
  actionSteps: ActionStep[];
  finalTakeaway: string;
  source: KwipAnalysisResult['source'];
  style: string;
}

export interface CarouselSlideData {
  slideNumber: number;
  totalSlides: number;
  type: 'intro' | 'summary' | 'framework' | 'idea' | 'metrics' | 'action' | 'outro';
  badge: string;
  headline: string;
  subheadline?: string;
  bullets?: string[];
  stat?: { value: string; label: string };
  quote?: { text: string; author?: string };
  highlightBox?: string;
}

export interface PreparedPdfPageData {
  pageNumber: number;
  totalPages: number;
  title: string;
  source: KwipAnalysisResult['source'];
  isPageOne: boolean;
  hook?: string;
  executiveSummary?: string;
  keyIdeas?: KeyIdea[];
  framework?: KwipAnalysisResult['framework'];
  statistics?: Statistic[];
  quotes?: Quote[];
  actionSteps?: ActionStep[];
  finalTakeaway?: string;
}

/**
 * Returns complete, semantically whole text without trailing ellipses ("...").
 */
function cleanCompleteThought(str: string | undefined): string {
  if (!str) return '';
  let cleaned = str.trim();
  // Strip trailing "..." or trailing multi-dots
  cleaned = cleaned.replace(/\s*\.{2,}$/, '').trim();

  // Ensure sentence ends with proper punctuation without removing any words
  if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }
  return cleaned;
}

/**
 * Extracts complete first 1-2 sentences from a string without cutting mid-sentence.
 */
function extractCompleteSentences(text: string | undefined, maxSentences = 2): string {
  if (!text) return '';
  const cleaned = text.replace(/\s*\.{2,}$/, '').trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    return sentences.slice(0, maxSentences).join(' ').trim();
  }
  return cleanCompleteThought(cleaned);
}

/**
 * Extracts numeric value from string for quantitative visualization (if valid data exists).
 */
function parseNumericValue(valStr: string): number | null {
  if (!valStr) return null;
  const match = valStr.match(/(\d+(\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return !isNaN(num) && num > 0 ? num : null;
  }
  return null;
}

/**
 * Prepares content strictly optimized for FORMAT #1: VISUAL BRIEF (Single 1-Page A4 Executive Snapshot).
 * Target canvas size: 794px × 1123px (A4 aspect ratio: ~1:1.414).
 * Enforces NO TRAILING "..." and COMPLETE SEMANTIC THOUGHTS.
 */
export function prepareVisualBrief(data: KwipAnalysisResult): PreparedVisualBriefData {
  const title = cleanCompleteThought(data.title);
  const hook = cleanCompleteThought(data.hook);
  const executiveSummary = cleanCompleteThought(data.executiveSummary);
  const finalTakeaway = cleanCompleteThought(data.finalTakeaway);

  // Preserve all key ideas with complete thoughts
  const rawIdeas = data.keyIdeas || [];
  const keyIdeas: KeyIdea[] = rawIdeas.map((idea, idx) => ({
    number: idx + 1,
    title: cleanCompleteThought(idea.title),
    summary: cleanCompleteThought(idea.summary || idea.explanation),
    explanation: cleanCompleteThought(idea.explanation || idea.summary),
    example: idea.example ? cleanCompleteThought(idea.example) : undefined,
    tag: idea.tag ? idea.tag.trim() : undefined,
  }));

  // Preserve all statistics
  const statistics = (data.statistics || []).map((s) => ({
    value: s.value.trim(),
    label: cleanCompleteThought(s.label),
    context: cleanCompleteThought(s.context),
  }));

  // Optional quantitative chart data if real numerical data exists in statistics
  let chartData: { label: string; valueNum: number; displayValue: string }[] | undefined = undefined;
  const validNumStats = statistics
    .map((s) => {
      const num = parseNumericValue(s.value);
      return num !== null ? { label: s.label, valueNum: num, displayValue: s.value } : null;
    })
    .filter((s): s is { label: string; valueNum: number; displayValue: string } => s !== null);

  if (validNumStats.length >= 2) {
    chartData = validNumStats.slice(0, 4);
  }

  const quotes = (data.quotes || []).map((q) => ({
    text: cleanCompleteThought(q.text),
    speaker: q.speaker ? q.speaker.trim() : undefined,
  }));

  const actionSteps = (data.actionSteps || []).map((a, idx) => ({
    stepNumber: idx + 1,
    action: cleanCompleteThought(a.action),
    impact: a.impact ? cleanCompleteThought(a.impact) : undefined,
  }));

  return {
    title,
    hook,
    executiveSummary,
    contentType: (data.contentType || 'PODCAST ANALYSIS').toUpperCase(),
    keyIdeas,
    framework: data.framework,
    statistics,
    chartData,
    quotes,
    actionSteps,
    finalTakeaway,
    source: data.source,
    style: data.style || 'editorial',
  };
}

/**
 * Prepares content strictly optimized for FORMAT #2: CAROUSEL (1080x1350 4:5 Social Deck).
 * Ensures every slide statement is a complete, semantically whole thought.
 */
export function prepareCarousel(data: KwipAnalysisResult): CarouselSlideData[] {
  const slides: CarouselSlideData[] = [];

  // SLIDE 1: Cover Slide
  slides.push({
    slideNumber: 1,
    totalSlides: 0,
    type: 'intro',
    badge: (data.contentType || 'PODCAST').toUpperCase(),
    headline: cleanCompleteThought(data.title),
    subheadline: `"${cleanCompleteThought(data.hook)}"`,
    highlightBox: `Executive Summary & Core Takeaways • ${data.source.channelTitle}`,
  });

  // SLIDE 2: Executive Overview
  if (data.executiveSummary) {
    const topPillars = (data.keyIdeas || [])
      .slice(0, 3)
      .map((i) => `Core Pillar: ${cleanCompleteThought(i.title)}`);

    slides.push({
      slideNumber: 0,
      totalSlides: 0,
      type: 'summary',
      badge: 'THE BIG PICTURE',
      headline: 'Executive Overview',
      subheadline: extractCompleteSentences(data.executiveSummary, 2),
      bullets: topPillars.length > 0 ? topPillars : undefined,
    });
  }

  // SLIDE 3: Framework (if present)
  if (data.framework && data.framework.steps && data.framework.steps.length > 0) {
    const steps = data.framework.steps.slice(0, 3).map(
      (s) => `${s.stepNumber}. ${cleanCompleteThought(s.title)}: ${cleanCompleteThought(s.description)}`
    );

    slides.push({
      slideNumber: 0,
      totalSlides: 0,
      type: 'framework',
      badge: 'FRAMEWORK & PROCESS',
      headline: cleanCompleteThought(data.framework.title),
      subheadline: data.framework.subtitle ? cleanCompleteThought(data.framework.subtitle) : undefined,
      bullets: steps,
    });
  }

  // SLIDES 4-5+: Key Insights (Max 2 key ideas per slide)
  const rawIdeas = data.keyIdeas || [];
  for (let i = 0; i < Math.min(rawIdeas.length, 8); i += 2) {
    const pair = rawIdeas.slice(i, i + 2);
    const bullets = pair.map(
      (idea) =>
        `#${idea.number} ${cleanCompleteThought(idea.title)} — ${extractCompleteSentences(idea.summary, 1)}`
    );

    slides.push({
      slideNumber: 0,
      totalSlides: 0,
      type: 'idea',
      badge: `KEY INSIGHTS (${i + 1}–${Math.min(i + 2, rawIdeas.length)})`,
      headline: cleanCompleteThought(pair[0].title),
      bullets,
    });
  }

  // SLIDE: Metrics & Notable Quote
  const firstStat = (data.statistics || [])[0];
  const firstQuote = (data.quotes || [])[0];
  if (firstStat || firstQuote) {
    slides.push({
      slideNumber: 0,
      totalSlides: 0,
      type: 'metrics',
      badge: 'EVIDENCE & DATA',
      headline: 'Key Metrics & Quotations',
      stat: firstStat ? { value: firstStat.value, label: `${cleanCompleteThought(firstStat.label)} (${cleanCompleteThought(firstStat.context)})` } : undefined,
      quote: firstQuote ? { text: extractCompleteSentences(firstQuote.text, 1), author: firstQuote.speaker || data.source.channelTitle } : undefined,
    });
  }

  // SLIDE: Action Plan & Final Outro
  const actionBullets = (data.actionSteps || [])
    .slice(0, 3)
    .map((a) => `${a.stepNumber}. ${cleanCompleteThought(a.action)}`);

  slides.push({
    slideNumber: 0,
    totalSlides: 0,
    type: 'outro',
    badge: 'ACTION PLAN & SYNTHESIS',
    headline: 'Practical Takeaways',
    bullets: actionBullets.length > 0 ? actionBullets : undefined,
    highlightBox: `Final Takeaway: "${cleanCompleteThought(data.finalTakeaway)}"`,
  });

  return slides.map((s, idx) => ({
    ...s,
    slideNumber: idx + 1,
    totalSlides: slides.length,
  }));
}

/**
 * Prepares FULL, UNTRUNCATED content strictly optimized for FORMAT #3: MULTI-PAGE PDF REPORT.
 * Consumes the FULL analysisData (all key ideas, explanations, examples, statistics, quotes, and takeaways)
 * with ZERO string truncation or trailing "..." ellipses.
 */
export function preparePdf(data: KwipAnalysisResult): PreparedPdfPageData[] {
  const pages: PreparedPdfPageData[] = [];
  const rawIdeas = (data.keyIdeas || []).map(i => ({
    ...i,
    title: cleanCompleteThought(i.title),
    summary: cleanCompleteThought(i.summary),
    explanation: cleanCompleteThought(i.explanation),
    example: i.example ? cleanCompleteThought(i.example) : undefined,
  }));

  const cleanStats = (data.statistics || []).map(s => ({
    value: s.value.trim(),
    label: cleanCompleteThought(s.label),
    context: cleanCompleteThought(s.context),
  }));

  const cleanQuotes = (data.quotes || []).map(q => ({
    text: cleanCompleteThought(q.text),
    speaker: q.speaker ? q.speaker.trim() : undefined,
    context: q.context ? cleanCompleteThought(q.context) : undefined,
  }));

  const cleanActions = (data.actionSteps || []).map(a => ({
    ...a,
    action: cleanCompleteThought(a.action),
    impact: a.impact ? cleanCompleteThought(a.impact) : undefined,
  }));

  // Determine dynamic page distribution based on key idea count
  const page1Ideas = rawIdeas.slice(0, 2); // 2 ideas on Page 1 along with Overview & Thesis
  const remainingIdeas = rawIdeas.slice(2);

  // Split remaining ideas into chunks of 3-4 per page
  const page2Ideas = remainingIdeas.slice(0, 4);
  const page3Ideas = remainingIdeas.slice(4);

  // PAGE 1: Overview, Core Thesis, Executive Summary + First 2 Key Ideas
  pages.push({
    pageNumber: 1,
    totalPages: 0,
    title: cleanCompleteThought(data.title),
    source: data.source,
    isPageOne: true,
    hook: cleanCompleteThought(data.hook),
    executiveSummary: cleanCompleteThought(data.executiveSummary),
    keyIdeas: page1Ideas,
  });

  // PAGE 2: Remaining Key Concepts + Framework (only if content exists)
  if (page2Ideas.length > 0 || data.framework) {
    pages.push({
      pageNumber: pages.length + 1,
      totalPages: 0,
      title: cleanCompleteThought(data.title),
      source: data.source,
      isPageOne: false,
      keyIdeas: page2Ideas.length > 0 ? page2Ideas : undefined,
      framework: data.framework,
    });
  }

  // PAGE 3 (and optional Page 4 if overflow ideas exist): Evidence, Takeaways & Final Synthesis
  if (page3Ideas.length > 0) {
    pages.push({
      pageNumber: pages.length + 1,
      totalPages: 0,
      title: cleanCompleteThought(data.title),
      source: data.source,
      isPageOne: false,
      keyIdeas: page3Ideas,
    });
  }

  pages.push({
    pageNumber: pages.length + 1,
    totalPages: 0,
    title: cleanCompleteThought(data.title),
    source: data.source,
    isPageOne: false,
    statistics: cleanStats,
    quotes: cleanQuotes,
    actionSteps: cleanActions,
    finalTakeaway: cleanCompleteThought(data.finalTakeaway),
  });

  return pages.map((p) => ({ ...p, totalPages: pages.length }));
}
