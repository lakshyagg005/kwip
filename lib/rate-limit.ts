interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipStore = new Map<string, RateLimitRecord>();

const MAX_REQUESTS_PER_WINDOW = 15; // 15 analyses per 24 hours per IP
const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Basic IP rate limiter sliding window for MVP abuse protection.
 */
export function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const record = ipStore.get(ip);

  if (!record || now > record.resetAt) {
    ipStore.set(ip, {
      count: 1,
      resetAt: now + WINDOW_DURATION_MS,
    });
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
      resetInSeconds: Math.ceil(WINDOW_DURATION_MS / 1000),
    };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - record.count,
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}

export function clearRateLimitsForTesting(): void {
  ipStore.clear();
}
