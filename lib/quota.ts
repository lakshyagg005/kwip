import fs from 'fs';
import path from 'path';
import { createServerSupabaseClient } from './supabase/server';

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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const QUOTA_FILE = path.resolve(DATA_DIR, 'quota-store.json');

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

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readAllQuotas(): Record<string, UserQuotaRecord> {
  ensureDataDir();
  if (!fs.existsSync(QUOTA_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(QUOTA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[QuotaStore] Error reading quota-store.json:', err);
    return {};
  }
}

export function writeAllQuotas(store: Record<string, UserQuotaRecord>): void {
  ensureDataDir();
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[QuotaStore] Error writing quota-store.json:', err);
  }
}

function computeNextResetDate(startDate: Date): Date {
  const next = new Date(startDate);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function getOrUpdateQuotaRecordInternal(
  store: Record<string, UserQuotaRecord>,
  userId: string,
  plan: 'free' | 'pro'
): UserQuotaRecord {
  const now = new Date();
  let record = store[userId];

  if (!record) {
    const periodStart = now.toISOString();
    const nextResetAt = computeNextResetDate(now).toISOString();
    record = {
      userId,
      plan,
      analysisCount: 0,
      periodStart,
      nextResetAt,
      updatedAt: now.toISOString(),
    };
    store[userId] = record;
  } else {
    // Check if current monthly period has expired
    const resetDate = new Date(record.nextResetAt);
    if (now >= resetDate) {
      // Reset usage exactly once for the new monthly period
      record.analysisCount = 0;
      record.periodStart = now.toISOString();
      record.nextResetAt = computeNextResetDate(now).toISOString();
      record.updatedAt = now.toISOString();
    }
    // Sync plan if updated
    record.plan = plan;
  }

  return record;
}

/**
 * Get current authoritative quota status for a user
 */
export async function getUserQuota(
  userId: string,
  plan: 'free' | 'pro' = 'free'
): Promise<QuotaStatus> {
  return acquireLock(userId, async () => {
    const store = readAllQuotas();
    const record = getOrUpdateQuotaRecordInternal(store, userId, plan);
    writeAllQuotas(store);

    const isPro = record.plan === 'pro';
    const limit = isPro ? 999999 : 2;
    const remaining = isPro ? 999999 : Math.max(0, limit - record.analysisCount);

    return {
      success: true,
      userId,
      plan: record.plan,
      usageCount: record.analysisCount,
      limit,
      remaining,
      periodStart: record.periodStart,
      nextResetAt: record.nextResetAt,
    };
  });
}

/**
 * Atomically reserve/increment monthly quota BEFORE generation
 */
export async function reserveQuota(
  userId: string,
  plan: 'free' | 'pro' = 'free'
): Promise<QuotaStatus> {
  return acquireLock(userId, async () => {
    const store = readAllQuotas();
    const record = getOrUpdateQuotaRecordInternal(store, userId, plan);

    if (record.plan === 'free') {
      if (record.analysisCount >= 2) {
        writeAllQuotas(store);
        return {
          success: false,
          userId,
          plan: record.plan,
          usageCount: record.analysisCount,
          limit: 2,
          remaining: 0,
          periodStart: record.periodStart,
          nextResetAt: record.nextResetAt,
          error: "You've used both free analyses for this month. Upgrade to KWIP Pro for unlimited analyses.",
        };
      }

      // Atomically increment quota usage
      record.analysisCount += 1;
      record.updatedAt = new Date().toISOString();
    }

    writeAllQuotas(store);

    // Attempt dual-write sync with Supabase analysis_usage table if available
    try {
      const supabase = await createServerSupabaseClient();
      const monthKey = new Date().toISOString().slice(0, 7);
      await supabase.from('analysis_usage').upsert({
        user_id: userId,
        month_key: monthKey,
        analysis_count: record.analysisCount,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Ignore remote database missing table errors
    }

    const isPro = record.plan === 'pro';
    const limit = isPro ? 999999 : 2;
    const remaining = isPro ? 999999 : Math.max(0, limit - record.analysisCount);

    return {
      success: true,
      userId,
      plan: record.plan,
      usageCount: record.analysisCount,
      limit,
      remaining,
      periodStart: record.periodStart,
      nextResetAt: record.nextResetAt,
    };
  });
}

/**
 * Refund reserved quota if generation fails upstream
 */
export async function refundQuota(userId: string): Promise<void> {
  return acquireLock(userId, async () => {
    const store = readAllQuotas();
    const record = store[userId];
    if (record && record.plan === 'free' && record.analysisCount > 0) {
      record.analysisCount -= 1;
      record.updatedAt = new Date().toISOString();
      writeAllQuotas(store);

      try {
        const supabase = await createServerSupabaseClient();
        const monthKey = new Date().toISOString().slice(0, 7);
        await supabase.from('analysis_usage').upsert({
          user_id: userId,
          month_key: monthKey,
          analysis_count: record.analysisCount,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Ignore
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
    const store = readAllQuotas();
    store[userId] = {
      userId,
      plan,
      analysisCount,
      periodStart,
      nextResetAt,
      updatedAt: new Date().toISOString(),
    };
    writeAllQuotas(store);
  });
}
