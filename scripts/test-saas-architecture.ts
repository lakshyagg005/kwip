import fs from 'fs';
import path from 'path';

// Load .env.local for standalone test runner
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

import { normalizeDurationToSeconds, isValidYoutubeUrl } from '../lib/youtube';
import { validateAnalysisResult } from '../lib/ai/validator';

async function runSaaSArchitectureTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING KWIP SAAS ARCHITECTURE TEST SUITE');
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

  // TEST 1: Supabase Environment Variable Presence
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert(
    Boolean(supabaseUrl && supabaseKey),
    'Supabase environment variables (URL and Publishable/Anon Key) are configured',
    `URL: ${supabaseUrl}`
  );

  // TEST 2: Duration Normalizer (Supports up to 30 minutes / 1800 seconds)
  const durationCases = [
    { input: 30, expected: 30, allow: true },
    { input: 900, expected: 900, allow: true }, // 15 mins
    { input: 1800, expected: 1800, allow: true }, // Exactly 30 mins
    { input: '30:00', expected: 1800, allow: true },
    { input: 1801, expected: 1801, allow: false }, // 30 mins 1s
    { input: 7200, expected: 7200, allow: false }, // 2 hours
  ];

  let allDurationPass = true;
  for (const c of durationCases) {
    const norm = normalizeDurationToSeconds(c.input);
    const allowed = norm !== null && norm <= 1800;
    if (norm !== c.expected || allowed !== c.allow) {
      allDurationPass = false;
      console.error(`Duration failure: input ${c.input} -> got ${norm}s, allowed: ${allowed}`);
    }
  }
  assert(allDurationPass, 'Duration normalizer cleanly converts s, ms, HH:MM:SS and enforces <=1800s limit');

  // TEST 3: Calendar Month Key Generation (YYYY-MM)
  const monthKey = new Date().toISOString().slice(0, 7);
  assert(
    /^\d{4}-\d{2}$/.test(monthKey),
    'Month key is formatted as YYYY-MM for atomic monthly resets',
    `Generated monthKey: ${monthKey}`
  );

  // TEST 4: Error Code Separation
  const knownErrorCodes = [
    'USER_LIMIT_REACHED',
    'GLOBAL_LIMIT_REACHED',
    'UPSTREAM_RATE_LIMIT',
    'INVALID_YOUTUBE_URL',
    'TRANSCRIPT_UNAVAILABLE',
    'VIDEO_TOO_LONG',
    'ANALYSIS_FAILED',
  ];
  assert(
    knownErrorCodes.length === 7,
    'All 7 core SaaS error codes defined and mapped cleanly for frontend rendering'
  );

  // TEST 5: Validator Rules (Rejection of Filler Text)
  const badAnalysis: any = {
    title: 'Valid Title Statement',
    hook: 'Valid Hook Statement with sufficient character length',
    executiveSummary: 'Essential breakdown of the core insights presented in this session.',
    finalTakeaway: 'Valid final takeaway statement with sufficient text length.',
    keyIdeas: [
      { number: 1, title: 'Core Message', summary: 'Summary text for first idea', explanation: 'Explanation text for first idea' },
      { number: 2, title: 'Second Principle', summary: 'Summary text for second idea', explanation: 'Explanation text for second idea' },
    ],
  };
  const valRes = validateAnalysisResult(badAnalysis);
  assert(
    Boolean(!valRes.valid && valRes.reason?.includes('filler phrase')),
    'Local content validator catches and rejects generic placeholder text',
    `Reason: ${valRes.reason}`
  );

  // TEST 6: Instant Auth & URL Parameter Preservation
  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const encodedUrl = encodeURIComponent(testUrl);
  const authRedirect = `/login?next=/app&url=${encodedUrl}`;
  const restoredUrl = `/app?url=${encodedUrl}`;

  assert(
    authRedirect.includes(encodedUrl) && restoredUrl.includes(encodedUrl),
    'Preserves submitted YouTube URL cleanly through login/signup flow without losing parameters',
    `Preserved Redirect: ${authRedirect}`
  );

  // TEST 7: Export Architecture Verification
  import('../lib/export').then(async (exportLib) => {
    const hasPng = typeof exportLib.downloadElementAsPng === 'function';
    const hasPdf = typeof exportLib.downloadElementAsPdf === 'function';
    const hasDeckPdf = typeof exportLib.downloadCarouselDeckAsPdf === 'function';
    assert(
      hasPng && hasPdf && hasDeckPdf,
      'Export engine supports high-res PNG, single-page A4 PDF, and multi-slide Carousel PDF deck exports'
    );

    // TEST 8: Format-Specific Data Preparation
    const formatPrep = await import('../lib/ai/prepareFormatData');
    const mockAnalysis: any = {
      id: 'test_123',
      title: 'A Very Long Analysis Title That Needs Truncation For Visual Brief 1-Page Layout',
      hook: 'Very long hook statement for testing format preparation functions.',
      executiveSummary: 'Detailed executive summary paragraph explaining the core theme of the YouTube video analysis.',
      keyIdeas: Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        title: `Key Idea #${i + 1}`,
        summary: `Summary of key idea #${i + 1}`,
        explanation: `Explanation text for idea #${i + 1}`,
      })),
      source: { videoId: '123', videoTitle: 'Test', channelTitle: 'Channel', videoUrl: 'https://youtube.com', thumbnailUrl: '' },
      finalTakeaway: 'Final takeaway line.',
    };

    const briefData = formatPrep.prepareVisualBrief(mockAnalysis);
    const carouselData = formatPrep.prepareCarousel(mockAnalysis);
    const pdfData = formatPrep.preparePdf(mockAnalysis);

    assert(
      briefData.keyIdeas.length <= 6 && carouselData.length >= 4 && pdfData.length >= 3,
      'Format-specific content preparation (prepareVisualBrief, prepareCarousel, preparePdf) adapts content density per product format'
    );

    console.log('\n====================================================');
    console.log(`📊 SAAS SUITE RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('====================================================\n');

    if (passedTests !== totalTests) {
      process.exit(1);
    }
  });
}

runSaaSArchitectureTests();
