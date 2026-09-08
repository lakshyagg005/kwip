import { getSupabaseAdminClient } from './supabase/server';

export interface UserQuotaRecord {
  userId: string;
  plan: 'free' | 'pro';
  analysisCount: number;
  periodStart: string; // ISO string timestamp
  nextResetAt: string; // ISO string timestamp
  updatedAt: string;   // ISO string timestamp
}

export interface QuotaStatus {
  success: boolean;
  userId: string;
  plan: 'free' | 'pro';
  usageCount: number;
  limit: number;
  remaining: number;
  periodStart: string;
  nextResetAt: string;
  error?: string;
}

// In-memory fallback cache for serverless execution context
const inMemoryQuotaStore: Record<string, UserQuotaRecord> = {};

// In-memory concurrency locks per userId to ensure atomic operations
const userLocks = new Map<string, Promise<any>>();

function acquireLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = userLocks.get(userId) || Promise.resolve();
  let release: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  userLocks.set(
    userId,
    currentLock.then(() => nextLock)
  );

  return currentLock.then(async () => {
    try {
      return await fn();
    } finally {
      release!();
      if (userLocks.get(userId) === nextLock) {
        userLocks.delete(userId);
      }
    }
  });
}

export function readAllQuotas(): Record<string, UserQuotaRecord> {
  return { ...inMemoryQuotaStore };
}

export function writeAllQuotas(store: Record<string, UserQuotaRecord>): void {
  Object.assign(inMemoryQuotaStore, store);
}

function getMonthlyPeriodBounds(d = new Date()) {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const periodStart = new Date(Date.UTC(year, month, 1)).toISOString();
  const nextResetAt = new Date(Date.UTC(year, month + 1, 1)).toISOString();
  const monthKey = periodStart.slice(0, 7); // 'YYYY-MM'
  return { monthKey, periodStart, nextResetAt };
}

async function getUserQuotaInternal(
  userId: string,
  planHint: 'free' | 'pro' = 'free'
): Promise<QuotaStatus> {
  const { monthKey, periodStart, nextResetAt } = getMonthlyPeriodBounds();
  let usageCount = 0;
  let effectivePlan: 'free' | 'pro' = planHint;

  // 1. Check in-memory store first
  const cached = inMemoryQuotaStore[userId];
  if (cached) {
    if (cached.periodStart.slice(0, 7) !== monthKey) {
      // Period reset
      cached.analysisCount = 0;
      cached.periodStart = periodStart;
      cached.nextResetAt = nextResetAt;
    }
    cached.plan = planHint !== 'free' ? planHint : cached.plan;
    usageCount = cached.analysisCount;
    effectivePlan = cached.plan;
  }

  // 2. Fetch Plan & Usage from Supabase if credentials exist
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const adminClient = getSupabaseAdminClient();

      if (planHint === 'free') {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('plan')
          .eq('id', userId)
          .single();
        if (profile?.plan === 'pro' || profile?.plan === 'free') {
          effectivePlan = profile.plan;
        }
      }

      const { data: usageRow } = await adminClient
        .from('analysis_usage')
        .select('analysis_count')
        .eq('user_id', userId)
        .eq('month_key', monthKey)
        .single();

      if (usageRow && typeof usageRow.analysis_count === 'number') {
        const dbCount = usageRow.analysis_count;
        const cachedCount = (cached && cached.periodStart === periodStart) ? cached.analysisCount : 0;
        usageCount = Math.max(dbCount, cachedCount);
      }
    } catch {
      // Use cached/default values
    }
  }

  // Sync in-memory store state
  inMemoryQuotaStore[userId] = {
    userId,
    plan: effectivePlan,
    analysisCount: usageCount,
    periodStart,
    nextResetAt,
    updatedAt: new Date().toISOString(),
  };

  const isPro = effectivePlan === 'pro';
  const limit = isPro ? 999999 : 2;
  const remaining = isPro ? 999999 : Math.max(0, limit - usageCount);

  return {
    success: true,
    userId,
    plan: effectivePlan,
    usageCount,
    limit,
    remaining,
    periodStart,
    nextResetAt,
  };
}

/**
 * Get current authoritative quota status for a user from Supabase
 */
export async function getUserQuota(
  userId: string,
  planHint: 'free' | 'pro' = 'free'
): Promise<QuotaStatus> {
  return acquireLock(userId, () => getUserQuotaInternal(userId, planHint));
}

/**
 * Atomically reserve/increment monthly quota BEFORE generation
 */
export async function reserveQuota(
  userId: string,
  planHint: 'free' | 'pro' = 'free'
): Promise<QuotaStatus> {
  return acquireLock(userId, async () => {
    const status = await getUserQuotaInternal(userId, planHint);
    const { monthKey, periodStart, nextResetAt } = getMonthlyPeriodBounds();

    if (status.plan === 'free' && status.usageCount >= 2) {
      return {
        success: false,
        userId,
        plan: status.plan,
        usageCount: status.usageCount,
        limit: 2,
        remaining: 0,
        periodStart,
        nextResetAt,
        error: "You've used both free analyses for this month. Upgrade to KWIP Pro for unlimited analyses.",
      };
    }

    const newCount = status.usageCount + 1;

    // Sync in-memory store immediately
    inMemoryQuotaStore[userId] = {
      userId,
      plan: status.plan,
      analysisCount: newCount,
      periodStart,
      nextResetAt,
      updatedAt: new Date().toISOString(),
    };

    // Update Supabase analysis_usage table if available
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        const adminClient = getSupabaseAdminClient();
        await adminClient.from('analysis_usage').upsert(
          {
            user_id: userId,
            month_key: monthKey,
            analysis_count: newCount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,month_key' }
        );
      } catch {
        // Ignore remote DB error
      }
    }

    const isPro = status.plan === 'pro';
    const limit = isPro ? 999999 : 2;
    const remaining = isPro ? 999999 : Math.max(0, limit - newCount);

    return {
      success: true,
      userId,
      plan: status.plan,
      usageCount: newCount,
      limit,
      remaining,
      periodStart,
      nextResetAt,
    };
  });
}

/**
 * Refund reserved quota if generation fails upstream
 */
export async function refundQuota(userId: string): Promise<void> {
  return acquireLock(userId, async () => {
    const { monthKey, periodStart, nextResetAt } = getMonthlyPeriodBounds();
    const status = await getUserQuotaInternal(userId);

    if (status.plan === 'free' && status.usageCount > 0) {
      const newCount = status.usageCount - 1;

      inMemoryQuotaStore[userId] = {
        userId,
        plan: status.plan,
        analysisCount: newCount,
        periodStart,
        nextResetAt,
        updatedAt: new Date().toISOString(),
      };

      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        try {
          const adminClient = getSupabaseAdminClient();
          await adminClient.from('analysis_usage').upsert(
            {
              user_id: userId,
              month_key: monthKey,
              analysis_count: newCount,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,month_key' }
          );
        } catch {
          // Ignore
        }
      }
    }
  });
}

/**
 * Testing helper to set explicit period timestamps and count
 */
export async function setQuotaForTesting(
  userId: string,
  periodStart: string,
  nextResetAt: string,
  analysisCount = 0,
  plan: 'free' | 'pro' = 'free'
): Promise<void> {
  return acquireLock(userId, async () => {
    const monthKey = periodStart.slice(0, 7);
    inMemoryQuotaStore[userId] = {
      userId,
      plan,
      analysisCount,
      periodStart,
      nextResetAt,
      updatedAt: new Date().toISOString(),
    };

    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        const adminClient = getSupabaseAdminClient();
        await adminClient.from('analysis_usage').upsert(
          {
            user_id: userId,
            month_key: monthKey,
            analysis_count: analysisCount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,month_key' }
        );
      } catch {
        // Ignore
      }
    }
  });
}
