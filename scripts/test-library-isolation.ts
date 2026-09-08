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

import {
  getUserAnalyses,
  getAnalysisById,
  saveAnalysisServer,
  deleteAnalysisServer,
  readAllAnalysesStore,
} from '../lib/analyses';

async function runLibraryIsolationTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING KWIP LIBRARY USER-DATA ISOLATION TEST SUITE');
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

  const userA = `user_iso_a_${Date.now()}`;
  const userB = `user_iso_b_${Date.now()}`;

  const mockBriefA1: any = {
    id: `brief_a1_${Date.now()}`,
    title: 'Account A - First Analysis Brief',
    hook: 'Hook for account A video 1',
    executiveSummary: 'Executive summary for account A video 1',
    source: { videoId: 'vidA1', videoTitle: 'A1', channelTitle: 'Channel A', videoUrl: 'https://youtube.com/a1' },
    createdAt: new Date().toISOString(),
  };

  const mockBriefA2: any = {
    id: `brief_a2_${Date.now()}`,
    title: 'Account A - Second Analysis Brief',
    hook: 'Hook for account A video 2',
    executiveSummary: 'Executive summary for account A video 2',
    source: { videoId: 'vidA2', videoTitle: 'A2', channelTitle: 'Channel A', videoUrl: 'https://youtube.com/a2' },
    createdAt: new Date().toISOString(),
  };

  const mockBriefB1: any = {
    id: `brief_b1_${Date.now()}`,
    title: 'Account B - Private Analysis Brief',
    hook: 'Hook for account B video 1',
    executiveSummary: 'Executive summary for account B video 1',
    source: { videoId: 'vidB1', videoTitle: 'B1', channelTitle: 'Channel B', videoUrl: 'https://youtube.com/b1' },
    createdAt: new Date().toISOString(),
  };

  // TEST 1: Save Content as Account A
  await saveAnalysisServer(userA, mockBriefA1, mockBriefA1.source.videoUrl, 'vidA1', 'editorial', ['brief']);
  await saveAnalysisServer(userA, mockBriefA2, mockBriefA2.source.videoUrl, 'vidA2', 'editorial', ['brief']);

  const libraryA = await getUserAnalyses(userA);
  assert(
    libraryA.length === 2 && libraryA.some((b) => b.id === mockBriefA1.id) && libraryA.some((b) => b.id === mockBriefA2.id),
    'Account A creates 2 visual briefs and retrieves both in its isolated library',
    `Retrieved items for Account A: ${libraryA.length}`
  );

  // TEST 2: Account B Library Isolation (Account A content must NOT appear)
  await saveAnalysisServer(userB, mockBriefB1, mockBriefB1.source.videoUrl, 'vidB1', 'editorial', ['brief']);

  const libraryB = await getUserAnalyses(userB);
  const containsAContent = libraryB.some((b) => b.id === mockBriefA1.id || b.id === mockBriefA2.id);
  assert(
    libraryB.length === 1 && libraryB[0].id === mockBriefB1.id && !containsAContent,
    'Account B library contains strictly Account B content (Account A content does NOT appear)',
    `Items for Account B: ${libraryB.length}, Contains Account A items: ${containsAContent}`
  );

  // TEST 3: Switch Back to Account A (Account B content must NOT appear)
  const libraryAReturn = await getUserAnalyses(userA);
  const containsBContent = libraryAReturn.some((b) => b.id === mockBriefB1.id);
  assert(
    libraryAReturn.length === 2 && !containsBContent,
    'Switching back to Account A returns Account A library cleanly without Account B content',
    `Items for Account A: ${libraryAReturn.length}, Contains Account B items: ${containsBContent}`
  );

  // TEST 4: IDOR Protection on Direct Retrieval by ID
  const directOwnerAccess = await getAnalysisById(userA, mockBriefA1.id);
  const directIdorAccess = await getAnalysisById(userB, mockBriefA1.id); // Account B tries to fetch Account A item ID

  assert(
    directOwnerAccess !== null && directOwnerAccess.id === mockBriefA1.id && directIdorAccess === null,
    'Direct retrieval by ID strictly enforces user ownership (Account B accessing Account A item returns null / 404)',
    `Owner Access: ${Boolean(directOwnerAccess)}, IDOR Access: ${Boolean(directIdorAccess)}`
  );

  // TEST 5: IDOR Protection on Item Deletion
  const idorDeleteResult = await deleteAnalysisServer(userB, mockBriefA1.id); // Account B tries to delete Account A item
  const checkA1Intact = await getAnalysisById(userA, mockBriefA1.id);

  assert(
    !idorDeleteResult && checkA1Intact !== null,
    'Account B attempt to delete Account A item is rejected and item remains intact for Account A',
    `IDOR Delete Result: ${idorDeleteResult}, Item still intact: ${Boolean(checkA1Intact)}`
  );

  // TEST 6: Owner Deletion
  const ownerDeleteResult = await deleteAnalysisServer(userA, mockBriefA1.id);
  const checkA1Deleted = await getAnalysisById(userA, mockBriefA1.id);

  assert(
    ownerDeleteResult && checkA1Deleted === null,
    'Account A owner deletion succeeds cleanly and removes item from Account A library',
    `Owner Delete Result: ${ownerDeleteResult}, Item exists after delete: ${Boolean(checkA1Deleted)}`
  );

  console.log('\n====================================================');
  console.log(`📊 FINAL LIBRARY ISOLATION TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runLibraryIsolationTests();
