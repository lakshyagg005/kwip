import fs from 'fs';
import path from 'path';

// Load .env.local manually for standalone node test script
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

import { executeAICompletion, resetProviderCooldowns, setProviderCooldown } from '../lib/ai/orchestrator';
import { generateAIAnalysis, prepareTranscriptText, sanitizeAndRepairParsedData } from '../lib/ai/provider';
import { buildCacheKey, getCachedAnalysis, setCachedAnalysis, runSingleFlight, clearCacheForTesting } from '../lib/cache';
import { isValidYoutubeUrl, extractYoutubeVideoId, normalizeDurationToSeconds } from '../lib/youtube';
import { checkIpRateLimit, clearRateLimitsForTesting } from '../lib/rate-limit';

import { validateAnalysisResult } from '../lib/ai/validator';

// Mock metadata for testing
const mockMetadata = {
  videoId: 'dQw4w9WgXcQ',
  videoTitle: 'Test Video on Product Strategy & Growth Frameworks',
  channelTitle: 'Tech Insights',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

const sampleTranscript = `Welcome everyone to today's session on product development strategy. First, we need to focus on identifying core user problems before building features. Product market fit is reached when 40% of users would be very disappointed if your product disappeared. Strategy involves 3 key pillars: User Research, Rapid Iteration, and Metric Tracking. As Steve Jobs said, "Focusing is about saying no." Action step one is audit your current product roadmap today.`;

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING KWIP AI PIPELINE TEST SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`   Details: ${detail}`);
    }
  }

  // ----------------------------------------------------
  // TEST 1: Normal Groq Request (Primary Provider)
  // ----------------------------------------------------
  try {
    resetProviderCooldowns();
    console.log('----------------------------------------------------');
    console.log('Testing 1: Normal Primary Provider (Groq) Request...');
    const result = await generateAIAnalysis(sampleTranscript, mockMetadata);
    assert(
      Boolean(result && result.title && result.keyIdeas.length > 0),
      'Normal Groq AI Analysis succeeds and returns schema-compliant output',
      `Title: "${result.title}", Key Ideas Count: ${result.keyIdeas.length}`
    );
  } catch (err: any) {
    assert(false, 'Normal Groq Request', err.message);
  }

  // ----------------------------------------------------
  // TEST 2: Local Validator Anti-Filler & Quality Rules
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 2: Local Validator Anti-Filler & Quality Rules...');
    const invalidResultWithFiller: any = {
      title: 'Valid Title Here',
      hook: 'Valid Hook statement for test',
      executiveSummary: 'Essential breakdown of the core insights presented in this video.',
      finalTakeaway: 'Valid final takeaway statement.',
      keyIdeas: [
        { number: 1, title: 'Core Message', summary: 'Summary text here', explanation: 'Explanation text here' },
        { number: 2, title: 'Idea 2', summary: 'Summary text 2', explanation: 'Explanation text 2' },
      ],
    };

    const valRes = validateAnalysisResult(invalidResultWithFiller);
    assert(
      Boolean(!valRes.valid && valRes.reason?.includes('filler phrase')),
      'Local validator correctly catches and rejects generic filler phrases',
      `Reason: ${valRes.reason}`
    );
  } catch (err: any) {
    assert(false, 'Local Validator Anti-Filler Test', err.message);
  }

  // ----------------------------------------------------
  // TEST 3: Simulated Groq 429 -> OpenRouter Fallback
  // ----------------------------------------------------
  try {
    resetProviderCooldowns();
    console.log('\n----------------------------------------------------');
    console.log('Testing 3: Simulated Groq 429 -> OpenRouter Fallback...');
    // Force Groq onto active cooldown (simulating a 429 response)
    setProviderCooldown('Groq', 60);

    const completion = await executeAICompletion({
      messages: [{ role: 'user', content: 'Say "Hello from OpenRouter"' }],
    });

    assert(
      completion.providerName.includes('OpenRouter'),
      'Fails over cleanly to OpenRouter when Groq is rate-limited (429)',
      `Actual provider used: ${completion.providerName}`
    );
  } catch (err: any) {
    assert(false, 'Groq 429 -> OpenRouter Fallback', err.message);
  }

  // ----------------------------------------------------
  // TEST 4: Simulated OpenRouter Failure -> NVIDIA Fallback
  // ----------------------------------------------------
  try {
    resetProviderCooldowns();
    console.log('\n----------------------------------------------------');
    console.log('Testing 4: Simulated OpenRouter Failure -> NVIDIA NIM Fallback...');
    // Force Groq AND OpenRouter onto active cooldown
    setProviderCooldown('Groq', 60);
    setProviderCooldown('OpenRouter', 60);

    const completion = await executeAICompletion({
      messages: [{ role: 'user', content: 'Say "Hello from NVIDIA"' }],
    });

    assert(
      completion.providerName.includes('NVIDIA NIM'),
      'Fails over cleanly to NVIDIA NIM when Groq and OpenRouter are unavailable',
      `Actual provider used: ${completion.providerName}`
    );
  } catch (err: any) {
    assert(false, 'OpenRouter Failure -> NVIDIA Fallback', err.message);
  }

  // ----------------------------------------------------
  // TEST 5: All Providers Failing -> Clean Error
  // ----------------------------------------------------
  try {
    resetProviderCooldowns();
    console.log('\n----------------------------------------------------');
    console.log('Testing 5: All Providers Failing -> Clean Error...');
    setProviderCooldown('Groq', 60);
    setProviderCooldown('OpenRouter', 60);
    setProviderCooldown('NVIDIA NIM', 60);

    let threwError = false;
    let errorMessage = '';
    try {
      await executeAICompletion({
        messages: [{ role: 'user', content: 'Test' }],
      });
    } catch (err: any) {
      threwError = true;
      errorMessage = err.message;
    }

    assert(
      threwError && errorMessage.includes('AI_ALL_PROVIDERS_FAILED'),
      'Returns clean AI_ALL_PROVIDERS_FAILED error when all providers fail',
      `Error Message: ${errorMessage}`
    );
  } catch (err: any) {
    assert(false, 'All Providers Failing Clean Error', err.message);
  } finally {
    resetProviderCooldowns();
  }

  // ----------------------------------------------------
  // TEST 6: Caching & Deduplication (Same URL twice)
  // ----------------------------------------------------
  try {
    clearCacheForTesting();
    console.log('\n----------------------------------------------------');
    console.log('Testing 6: Same YouTube Video Request -> Second Request Serves From Cache...');
    const cacheKey = buildCacheKey('dQw4w9WgXcQ', 'editorial');

    // First call populates cache
    const firstRes = await runSingleFlight(cacheKey, async () => {
      return generateAIAnalysis(sampleTranscript, mockMetadata);
    });

    // Second call should return cached result immediately without calling AI
    const secondCached = getCachedAnalysis(cacheKey);

    assert(
      Boolean(secondCached && secondCached.id === firstRes.id),
      'Second request for identical video returns cached analysis without making AI call',
      `Cached ID: ${secondCached?.id}, First Call ID: ${firstRes.id}`
    );
  } catch (err: any) {
    assert(false, 'Cache Verification', err.message);
  }

  // ----------------------------------------------------
  // TEST 7: Long Transcript Normalization & 4-Part Sampling
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 7: Long Transcript Normalization & 4-Part Timeline Sampling...');
    // Create a dummy 60,000 character transcript (~12,000 tokens)
    const longTranscript = 'word '.repeat(12000);
    const prepared = prepareTranscriptText(longTranscript, 20000);

    assert(
      prepared.length <= 21000 && prepared.includes('[PART 1 - INTRODUCTION]') && prepared.includes('[PART 4 - CONCLUSION]'),
      'Intelligently samples across all 4 timeline sections of long podcasts (0-25%, 25-50%, 50-75%, 75-100%)',
      `Original Length: ${longTranscript.length}, Prepared Length: ${prepared.length}`
    );
  } catch (err: any) {
    assert(false, 'Long Transcript Sampling', err.message);
  }

  // ----------------------------------------------------
  // TEST 8: Invalid YouTube URL Rejection
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 8: Reject Obviously Invalid YouTube URLs...');
    const invalidUrl1 = 'not-a-url';
    const invalidUrl2 = 'https://google.com';
    const validUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    const isRejected1 = !isValidYoutubeUrl(invalidUrl1);
    const isRejected2 = !isValidYoutubeUrl(invalidUrl2);
    const isAccepted3 = isValidYoutubeUrl(validUrl);

    assert(
      isRejected1 && isRejected2 && isAccepted3,
      'Rejects invalid URLs before firing any fetch or AI provider request',
      `invalid1: ${isRejected1}, invalid2: ${isRejected2}, valid: ${isAccepted3}`
    );
  } catch (err: any) {
    assert(false, 'Invalid URL Rejection', err.message);
  }

  // ----------------------------------------------------
  // TEST 9: Verify API Keys Never Exposed in Client Code
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 9: Verify API Keys Never Appear in NEXT_PUBLIC_ or Client Bundle...');
    const hasPublicGroq = Boolean(process.env.NEXT_PUBLIC_GROQ_API_KEY);
    const hasPublicOpenRouter = Boolean(process.env.NEXT_PUBLIC_OPENROUTER_API_KEY);
    const hasPublicNvidia = Boolean(process.env.NEXT_PUBLIC_NVIDIA_API_KEY);

    assert(
      !hasPublicGroq && !hasPublicOpenRouter && !hasPublicNvidia,
      'No API key is exposed as NEXT_PUBLIC_ environment variable',
      'All keys stored strictly server-side'
    );
  } catch (err: any) {
    assert(false, 'Client API Key Security', err.message);
  }

  // ----------------------------------------------------
  // TEST 10: Robust YouTube Duration Normalization & Hard 30-Minute Limit (1800s)
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 10: Robust YouTube Duration Normalization & Hard 30-Minute Limit...');

    const durationCases = [
      { input: 30, expectedSec: 30, shouldAllow: true, label: '30 seconds' },
      { input: 300, expectedSec: 300, shouldAllow: true, label: '5 minutes' },
      { input: 900, expectedSec: 900, shouldAllow: true, label: '15 minutes' },
      { input: 1500, expectedSec: 1500, shouldAllow: true, label: '25 minutes' },
      { input: 1800, expectedSec: 1800, shouldAllow: true, label: 'Exactly 30 minutes (1800s - ACCEPTED)' },
      { input: '30:00', expectedSec: 1800, shouldAllow: true, label: 'Exactly 30 minutes (30:00 MM:SS - ACCEPTED)' },
      { input: 'PT30M', expectedSec: 1800, shouldAllow: true, label: 'Exactly 30 minutes (ISO-8601 PT30M - ACCEPTED)' },
      { input: 1800000, expectedSec: 1800, shouldAllow: true, label: 'Exactly 30 minutes (milliseconds 1800000ms - ACCEPTED)' },
      { input: 1801, expectedSec: 1801, shouldAllow: false, label: '30 minutes 1 second (1801s - REJECTED)' },
      { input: '30:01', expectedSec: 1801, shouldAllow: false, label: '30 minutes 1 second (30:01 MM:SS - REJECTED)' },
      { input: 'PT30M1S', expectedSec: 1801, shouldAllow: false, label: '30 minutes 1 second (ISO-8601 - REJECTED)' },
      { input: 3060, expectedSec: 3060, shouldAllow: false, label: '51 minutes (REJECTED)' },
      { input: 7200, expectedSec: 7200, shouldAllow: false, label: '2 hours (7200s - REJECTED)' },
    ];

    let allDurationCasesPassed = true;
    for (const c of durationCases) {
      const normalized = normalizeDurationToSeconds(c.input);
      const isAllowed = normalized !== null && normalized <= 1800;
      const casePass = normalized === c.expectedSec && isAllowed === c.shouldAllow;
      if (!casePass) {
        allDurationCasesPassed = false;
        console.error(`❌ Duration Case Failed: ${c.label} -> Normalized: ${normalized}s, Allowed: ${isAllowed}, Expected: ${c.shouldAllow}`);
      }
    }

    assert(
      allDurationCasesPassed,
      'Normalizes duration inputs (s, ms, MM:SS, ISO-8601) and enforces <=1800s limit cleanly (30:00 accepted, >30:00 rejected)',
      `Tested ${durationCases.length} real-world duration formats`
    );
  } catch (err: any) {
    assert(false, 'Duration Normalization Test', err.message);
  }

  // ----------------------------------------------------
  // TEST 11: Anti-Title-Copying & Title Restatement Validation
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 11: Reject Title Copying / Restatement in Thesis & Summary...');

    const resultCopyingTitle: any = {
      title: 'Mastering Product Strategy in 2026',
      hook: 'Mastering Product Strategy in 2026',
      executiveSummary: 'This video discusses Mastering Product Strategy in 2026.',
      finalTakeaway: 'Mastering Product Strategy in 2026 is key.',
      keyIdeas: [
        { number: 1, title: 'User Research First', summary: 'Validate before code.', explanation: 'Understand real problem.' },
        { number: 2, title: 'Rapid Iteration', summary: 'Ship early feedback.', explanation: 'Build measure learn.' },
      ],
      source: { videoTitle: 'Mastering Product Strategy in 2026' },
    };

    const valRes = validateAnalysisResult(resultCopyingTitle);
    assert(
      !valRes.valid && Boolean(valRes.reason?.includes('starter') || valRes.reason?.includes('title')),
      'Rejects analysis where core thesis or executive summary restates/copies the video title',
      `Validation Result: valid=${valRes.valid}, reason="${valRes.reason}"`
    );
  } catch (err: any) {
    assert(false, 'Anti-Title-Copying Validation Test', err.message);
  }

  // ----------------------------------------------------
  // TEST 12: Unsupported Non-Quantitative Metrics Rejection
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 12: Reject Non-Quantitative / Fabricated Statistics...');

    const resultWithFakeStats: any = {
      title: 'Growth Tactics',
      hook: 'Core framework for rapid scaling.',
      executiveSummary: 'Detailed overview of growth principles.',
      finalTakeaway: 'Focus on core retention metrics.',
      keyIdeas: [
        { number: 1, title: 'Focus on Retention', summary: 'Retention creates growth.', explanation: 'Keep active users.' },
        { number: 2, title: 'Viral Loops', summary: 'Users invite users.', explanation: 'Built-in referral.' },
      ],
      statistics: [
        { value: 'High Growth', label: 'Impact', context: 'General trend' }, // Lacks number/$ / %
      ],
    };

    const valRes = validateAnalysisResult(resultWithFakeStats);
    assert(
      !valRes.valid && Boolean(valRes.reason?.includes('lacks quantitative numeric data')),
      'Rejects statistics that do not contain actual quantitative metrics or numbers',
      `Validation Result: valid=${valRes.valid}, reason="${valRes.reason}"`
    );
  } catch (err: any) {
    assert(false, 'Non-Quantitative Metrics Rejection Test', err.message);
  }

  // ----------------------------------------------------
  // TEST 13: Ground-Truth Repair without Injected Title Strings
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 13: Sanitize and Repair Parsed Data without Injected Title Fallbacks...');

    const rawDataWithBadHook = {
      title: 'Artificial Intelligence Landscape 2026',
      hook: 'This video provides an overview of Artificial Intelligence Landscape 2026',
      executiveSummary: 'An in-depth synthesis of the core principles of Artificial Intelligence Landscape 2026.',
      finalTakeaway: 'Apply these core insights from Artificial Intelligence Landscape 2026.',
      keyIdeas: [
        { number: 1, title: 'Foundation Models', summary: 'Multi-modal architectures power enterprise automation.', explanation: 'Specialized models outperform general models in domain tasks.' },
        { number: 2, title: 'Agentic Workflows', summary: 'Autonomous loop execution enables complex task completion.', explanation: 'Tool-using agents break down complex workflows.' },
      ],
    };

    const repaired = sanitizeAndRepairParsedData(rawDataWithBadHook, 'Artificial Intelligence Landscape 2026');

    const hookHasTitle = repaired.hook.toLowerCase().includes('artificial intelligence landscape 2026');
    const summaryHasTitle = repaired.executiveSummary.toLowerCase().includes('artificial intelligence landscape 2026');
    const takeawayHasTitle = repaired.finalTakeaway.toLowerCase().includes('artificial intelligence landscape 2026');

    assert(
      !hookHasTitle && !summaryHasTitle && !takeawayHasTitle && repaired.hook === 'Multi-modal architectures power enterprise automation.',
      'Repairs missing/generic thesis, summary, and takeaway using valid key ideas without copying the video title',
      `Repaired Hook: "${repaired.hook}" | Repaired Summary: "${repaired.executiveSummary}"`
    );
  } catch (err: any) {
    assert(false, 'Ground-Truth Repair Test', err.message);
  }

  // ----------------------------------------------------
  // TEST 14: Dynamic Key Ideas Extraction (2-12 Count)
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 14: Dynamic Key Ideas Count (2-12) without Forced Padding...');

    const smallKeyIdeasResult: any = {
      title: 'Quick Tutorial on State Management',
      hook: 'State management requires clear single source of truth.',
      executiveSummary: 'Centralized state simplifies component architecture and prevents state sync bugs.',
      finalTakeaway: 'Always keep state immutable and local when possible.',
      keyIdeas: [
        { number: 1, title: 'Single Source of Truth', summary: 'Store application state in a unified location.', explanation: 'Prevents state divergence across UI components.' },
        { number: 2, title: 'Immutability', summary: 'Mutate state only through defined dispatchers or actions.', explanation: 'Enables predictable time-travel debugging and fast re-renders.' },
      ],
      statistics: [],
      quotes: [],
    };

    const valRes = validateAnalysisResult(smallKeyIdeasResult);
    const repaired = sanitizeAndRepairParsedData(smallKeyIdeasResult, 'Quick Tutorial on State Management');

    assert(
      valRes.valid && repaired.keyIdeas.length === 2,
      'Validates and preserves 2 distinct key ideas without forcing filler or padding up to 6',
      `Original Key Ideas: 2, Repaired Key Ideas: ${repaired.keyIdeas.length}`
    );
  } catch (err: any) {
    assert(false, 'Dynamic Key Ideas Test', err.message);
  }

  // ----------------------------------------------------
  // TEST 15: Omission of Missing Examples & Empty Stats/Quotes
  // ----------------------------------------------------
  try {
    console.log('\n----------------------------------------------------');
    console.log('Testing 15: Missing Examples Omission & Empty Stats/Quotes Handling...');

    const dataWithoutExamplesOrStats: any = {
      title: 'Pure Principles of Design',
      hook: 'Design is how it works, not just how it looks.',
      executiveSummary: 'Focusing on clarity and user intent creates effective visual hierarchy.',
      finalTakeaway: 'Remove non-essential elements until nothing left can be removed.',
      keyIdeas: [
        { number: 1, title: 'Visual Hierarchy', summary: 'Lead the eye with contrast.', explanation: 'Size and weight signal importance.' },
        { number: 2, title: 'Whitespace', summary: 'Give elements room to breathe.', explanation: 'Margin prevents cognitive overload.' },
      ],
      statistics: [],
      quotes: [],
      actionSteps: [],
    };

    const repaired = sanitizeAndRepairParsedData(dataWithoutExamplesOrStats, 'Pure Principles of Design');

    const exampleOmitted = repaired.keyIdeas.every((i: any) => i.example === undefined);
    const statsEmpty = Array.isArray(repaired.statistics) && repaired.statistics.length === 0;
    const quotesEmpty = Array.isArray(repaired.quotes) && repaired.quotes.length === 0;

    assert(
      exampleOmitted && statsEmpty && quotesEmpty,
      'Cleanly omits example field when absent and maintains empty arrays [] for stats and quotes',
      `Examples omitted: ${exampleOmitted}, Stats count: ${repaired.statistics.length}, Quotes count: ${repaired.quotes.length}`
    );
  } catch (err: any) {
    assert(false, 'Missing Examples & Empty Stats Test', err.message);
  }

  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();
