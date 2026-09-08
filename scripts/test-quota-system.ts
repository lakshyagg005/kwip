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
  getUserQuota,
  reserveQuota,
  refundQuota,
  setQuotaForTesting,
  readAllQuotas,
} from '../lib/quota';

async function runProductionQuotaTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING KWIP PRODUCTION QUOTA SYSTEM TEST SUITE');
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

  const userA = `test_user_a_${Date.now()}`;
  const userB = `test_user_b_${Date.now()}`;
  const userC = `test_user_c_${Date.now()}`;
  const userD = `test_user_d_${Date.now()}`;
  const userE = `test_user_e_${Date.now()}`;
  const userPro = `test_user_pro_${Date.now()}`;

  // TEST 1: Account Isolation & Initial State
  const initialA = await getUserQuota(userA, 'free');
  const initialB = await getUserQuota(userB, 'free');
  assert(
    initialA.usageCount === 0 && initialB.usageCount === 0 && initialA.userId !== initialB.userId,
    'Independent accounts initialize with 0/2 usage and distinct user IDs',
    `UserA: ${initialA.usageCount}/2, UserB: ${initialB.usageCount}/2`
  );

  // TEST 2: Single Reservation & Account Separation
  const resA1 = await reserveQuota(userA, 'free');
  const checkB1 = await getUserQuota(userB, 'free');
  assert(
    resA1.success && resA1.usageCount === 1 && checkB1.usageCount === 0,
    'Reserving quota for Account A updates Account A to 1/2 while Account B remains 0/2',
    `UserA: ${resA1.usageCount}/2, UserB: ${checkB1.usageCount}/2`
  );

  // TEST 3: Enforcement of Free Plan Monthly 2-Generation Limit
  const resA2 = await reserveQuota(userA, 'free');
  assert(resA2.success && resA2.usageCount === 2, 'Second generation for Account A succeeds (2/2 used)');

  const resA3 = await reserveQuota(userA, 'free');
  assert(
    !resA3.success && resA3.usageCount === 2 && resA3.remaining === 0,
    'Third generation attempt for Account A is blocked on server with limit error',
    `Error msg: ${resA3.error}`
  );

  // TEST 4: Persistence Across Storage Re-reads & Session Restart
  const fileStore = readAllQuotas();
  const persistedA = await getUserQuota(userA, 'free');
  assert(
    Boolean(fileStore[userA]) && persistedA.usageCount === 2 && persistedA.remaining === 0,
    'Quota usage is stored persistently in server database and remains 2/2 on re-read/session restart'
  );

  // TEST 5: Atomic Concurrency Lock (Simultaneous Race Condition Protection)
  // Set userC to 1/2 (1 slot remaining)
  await setQuotaForTesting(
    userC,
    new Date().toISOString(),
    new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    1,
    'free'
  );

  // Fire 5 simultaneous requests concurrently
  const concurrentResults = await Promise.all([
    reserveQuota(userC, 'free'),
    reserveQuota(userC, 'free'),
    reserveQuota(userC, 'free'),
    reserveQuota(userC, 'free'),
    reserveQuota(userC, 'free'),
  ]);

  const successfulCalls = concurrentResults.filter((r) => r.success);
  const rejectedCalls = concurrentResults.filter((r) => !r.success);
  const finalCheckC = await getUserQuota(userC, 'free');

  assert(
    successfulCalls.length === 1 && rejectedCalls.length === 4 && finalCheckC.usageCount === 2,
    '5 concurrent simultaneous generation requests when 1 slot remains result in EXACTLY 1 success and 4 rejections (final count = 2)',
    `Successes: ${successfulCalls.length}, Rejections: ${rejectedCalls.length}, Final usage: ${finalCheckC.usageCount}/2`
  );

  // TEST 6: Monthly Period Expiration Auto-Reset
  // Set userD to 2/2, but with nextResetAt in the past (expired period)
  const pastReset = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago
  const oldPeriodStart = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  await setQuotaForTesting(userD, oldPeriodStart, pastReset, 2, 'free');

  // Check quota for userD -> period expired, should reset to 0/2
  const resetQuotaD = await getUserQuota(userD, 'free');
  assert(
    resetQuotaD.usageCount === 0 &&
      resetQuotaD.remaining === 2 &&
      new Date(resetQuotaD.nextResetAt).getTime() > Date.now(),
    'When monthly quota period expires, usage automatically resets to 0/2 and new monthly period starts',
    `New count: ${resetQuotaD.usageCount}/2, Next reset: ${resetQuotaD.nextResetAt}`
  );

  // TEST 7: Upstream Failure Refund Protection
  await setQuotaForTesting(
    userE,
    new Date().toISOString(),
    new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    0,
    'free'
  );
  await reserveQuota(userE, 'free'); // reserved -> count = 1
  await refundQuota(userE); // refunded on error -> count = 0
  const refundedQuotaE = await getUserQuota(userE, 'free');
  assert(
    refundedQuotaE.usageCount === 0,
    'Refund quota function decrements usage count cleanly when upstream generation fails',
    `Restored count: ${refundedQuotaE.usageCount}/2`
  );

  // TEST 8: Pro Plan Unlimited Quota
  let proSuccessAll = true;
  for (let i = 0; i < 5; i++) {
    const res = await reserveQuota(userPro, 'pro');
    if (!res.success) proSuccessAll = false;
  }
  assert(proSuccessAll, 'KWIP Pro plan users have unlimited analysis generations without quota capping');

  console.log('\n====================================================');
  console.log(`📊 FINAL QUOTA TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runProductionQuotaTests();
