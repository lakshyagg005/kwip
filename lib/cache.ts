import { KwipAnalysisResult } from '@/types/kwip';

interface CacheEntry {
  data: KwipAnalysisResult;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const cacheStore = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<KwipAnalysisResult>>();

/**
 * Generate a consistent cache key from normalized videoId and options.
 */
export function buildCacheKey(videoId: string, style: string = 'editorial'): string {
  return `${videoId.trim()}:${style.trim().toLowerCase()}`;
}

/**
 * Retrieve cached analysis if valid and not expired.
 */
export function getCachedAnalysis(cacheKey: string): KwipAnalysisResult | null {
  const entry = cacheStore.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(cacheKey);
    return null;
  }

  return entry.data;
}

/**
 * Store successful analysis result in cache with TTL.
 */
export function setCachedAnalysis(
  cacheKey: string,
  data: KwipAnalysisResult,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  cacheStore.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Deduplicate concurrent requests for the exact same cache key (Single-Flight Pattern).
 * If a request for `cacheKey` is already in-flight, return the existing Promise.
 */
export async function runSingleFlight(
  cacheKey: string,
  fn: () => Promise<KwipAnalysisResult>
): Promise<KwipAnalysisResult> {
  const cached = getCachedAnalysis(cacheKey);
  if (cached) {
    console.log(`[Cache Hit] Serving cached result for key: ${cacheKey}`);
    return cached;
  }

  const existingPromise = inFlightRequests.get(cacheKey);
  if (existingPromise) {
    console.log(`[Deduplication] Attaching to in-flight request for key: ${cacheKey}`);
    return existingPromise;
  }

  const promise = (async () => {
    try {
      const result = await fn();
      setCachedAnalysis(cacheKey, result);
      return result;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Helper to clear cache (useful for testing).
 */
export function clearCacheForTesting(): void {
  cacheStore.clear();
  inFlightRequests.clear();
}
