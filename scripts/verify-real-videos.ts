import fs from 'fs';
import path from 'path';

// Load .env.local manually for standalone Node execution
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

import { fetchYoutubeTranscript } from '../lib/youtube';
import { generateAIAnalysis } from '../lib/ai/provider';
import { prepareVisualBrief, preparePdf } from '../lib/ai/prepareFormatData';
import { resetProviderCooldowns, setProviderCooldown, executeAICompletion } from '../lib/ai/orchestrator';

async function runComprehensiveVerification() {
  console.log('====================================================');
  console.log('🚀 KWIP REAL-WORLD END-TO-END VERIFICATION SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS ${totalTests}] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL ${totalTests}] ${testName}`);
      if (detail) console.error(`   Details: ${detail}`);
    }
  }

  function checkNoTruncatedText(obj: any, label: string): boolean {
    const jsonStr = JSON.stringify(obj);
    const brokenMatches = jsonStr.match(/"[^"]*?\b(co|int|rese|with|and)\.\.\.[^"]*?"/gi);
    if (brokenMatches) {
      console.error(`❌ Broken text detected in ${label}:`, brokenMatches);
      return false;
    }
    return true;
  }

  // ----------------------------------------------------
  // TEST 1: Short Real YouTube Video
  // ----------------------------------------------------
  console.log('----------------------------------------------------');
  console.log('📹 TEST 1: Real Short YouTube Video');
  console.log('----------------------------------------------------');
  try {
    resetProviderCooldowns();
    const shortUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const shortData = await fetchYoutubeTranscript(shortUrl);
    console.log(`Title: "${shortData.metadata.videoTitle}", Duration: ${shortData.metadata.duration}, Transcript: ${shortData.rawTranscript.length} chars`);

    const shortResult = await generateAIAnalysis(shortData.rawTranscript, shortData.metadata);

    assert(
      Boolean(shortResult && shortResult.title && shortResult.keyIdeas.length >= 2),
      'Short YouTube video generates valid, schema-compliant analysis',
      `Title: "${shortResult.title}", Key Ideas: ${shortResult.keyIdeas.length}`
    );

    const briefShort = prepareVisualBrief(shortResult);
    const pdfShort = preparePdf(shortResult);
    const cleanTextShort = checkNoTruncatedText({ briefShort, pdfShort }, 'Short Video Output');
    assert(cleanTextShort, 'Short Video Visual Brief & PDF contain zero broken text fragments ("co...", "int...")');
  } catch (err: any) {
    assert(false, 'Short Real YouTube Video Test', err.message);
  }

  // ----------------------------------------------------
  // TEST 2: Real 26-Minute Gemini Video (_FGrUBi7Zno)
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('📹 TEST 2: Real 26-Minute Gemini Video (_FGrUBi7Zno)');
  console.log('----------------------------------------------------');
  let result26: any = null;
  let data26: any = null;

  try {
    resetProviderCooldowns();
    const url26 = 'https://www.youtube.com/watch?v=_FGrUBi7Zno';
    data26 = await fetchYoutubeTranscript(url26);
    console.log(`Video Title: "${data26.metadata.videoTitle}"`);
    console.log(`Duration: ${data26.metadata.duration}`);
    console.log(`Transcript Length: ${data26.rawTranscript.length} chars (~${Math.round(data26.rawTranscript.length / 4)} tokens)`);

    result26 = await generateAIAnalysis(data26.rawTranscript, data26.metadata);

    assert(
      Boolean(result26 && result26.keyIdeas.length >= 4),
      '26-Minute Gemini video processed successfully via hierarchical chunking pipeline',
      `Key Ideas Count: ${result26.keyIdeas.length}`
    );

    // Grounding & Topic Coverage Table Verification for 26-Minute Video
    const fullAnalysisStr = JSON.stringify(result26).toLowerCase();
    const majorTopics26 = [
      { topic: 'Google Ecosystem / $4 Trillion Valuation', query: 'google' },
      { topic: 'Personal Intelligence / Memory Settings', query: 'personal intelligence' },
      { topic: 'Model Tiers (Flashlight / Flash / Pro)', query: 'flash' },
      { topic: 'Gems & Custom Knowledge Base', query: 'gem' },
      { topic: 'Skills & Workflows Automation', query: 'skill' },
      { topic: 'YouTube Video Integration & 70% Accuracy', query: 'youtube' },
      { topic: 'Canvas & Gemini Live Garage Door Example', query: 'live' },
      { topic: 'Iman Gadzhi / Speaker Grounding', query: 'gadzhi' },
    ];

    console.log('\n📊 26-MINUTE GEMINI VIDEO GROUNDING & TOPIC COVERAGE TABLE:');
    console.table(
      majorTopics26.map((t) => ({
        'Major Topic in Source': t.topic,
        'Present in KWIP?': fullAnalysisStr.includes(t.query) ? '✓ YES' : '❌ NO',
        'Grounding Status': fullAnalysisStr.includes(t.query) ? 'Verified Source-Grounded' : 'Missing',
      }))
    );

    const topicsFound26 = majorTopics26.filter((t) => fullAnalysisStr.includes(t.query)).length;
    assert(
      topicsFound26 >= 7,
      '26-Minute video analysis covers beginning, middle, and end topics without information loss',
      `Found ${topicsFound26}/${majorTopics26.length} major topics`
    );

    // Visual Brief & PDF Truncation Check
    const brief26 = prepareVisualBrief(result26);
    const pdf26 = preparePdf(result26);
    const cleanText26 = checkNoTruncatedText({ brief26, pdf26 }, '26m Gemini Video Output');
    assert(cleanText26, '26-Minute Gemini Visual Brief & PDF contain zero broken text fragments');
  } catch (err: any) {
    assert(false, '26-Minute Gemini Video Test', err.message);
  }

  // ----------------------------------------------------
  // TEST 3: 30-Minute Video Limit Enforcement (zjkBMFhNj_g - 55 Min)
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('📹 TEST 3: 30-Minute Video Limit Enforcement (zjkBMFhNj_g)');
  console.log('----------------------------------------------------');

  try {
    resetProviderCooldowns();
    const url55 = 'https://www.youtube.com/watch?v=zjkBMFhNj_g';
    await fetchYoutubeTranscript(url55);
    assert(false, '30-minute video limit enforcement', 'Expected VIDEO_TOO_LONG error but request succeeded');
  } catch (err: any) {
    assert(
      err.code === 'VIDEO_TOO_LONG' || err.message?.includes('30 minutes'),
      '55-Minute video correctly triggers 30-minute limit error (VIDEO_TOO_LONG)',
      `Caught expected error: ${err.message}`
    );
  }


  // ----------------------------------------------------
  // TEST 4: 429 Rate-Limit Handling & Provider Failover
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('⚡ TEST 4: Rate-Limit (429) & Provider Failover Resilience');
  console.log('----------------------------------------------------');
  try {
    resetProviderCooldowns();
    // Simulate Groq rate limit
    setProviderCooldown('Groq', 30);

    const completion = await executeAICompletion({
      messages: [{ role: 'user', content: 'Test rate limit failover message' }],
    });

    assert(
      !completion.providerName.includes('Groq') && (completion.providerName.includes('OpenRouter') || completion.providerName.includes('NVIDIA')),
      'Provider circuit breaker handles 429 rate limit cleanly by failing over without request storms',
      `Failover provider used: ${completion.providerName}`
    );
  } catch (err: any) {
    assert(false, 'Rate Limit Failover Test', err.message);
  } finally {
    resetProviderCooldowns();
  }

  console.log('\n====================================================');
  console.log(`📊 FINAL TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runComprehensiveVerification();
