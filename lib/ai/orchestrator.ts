export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderRequestOptions {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
  /** Optional per-request trace ID for log correlation. Never contains API keys. */
  requestId?: string;
  /**
   * Hard deadline: epoch ms by which this AI call must complete.
   * If the call cannot START (i.e. a 429 wait would exceed the deadline),
   * the orchestrator throws immediately rather than blocking.
   */
  deadlineMs?: number;
}

export interface ProviderConfig {
  name: string;
  apiKeyEnv: string;
  endpoint: string;
  defaultModel: string;
  extraHeaders?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Provider registry — order determines priority (first = highest priority).
//
// Primary Groq model: openai/gpt-oss-120b (confirmed 200 OK in production).
// No fallback models — if the primary is 429'd we fail fast so the deadline
// is not burned waiting through cascading retries.
//
// OpenRouter / NVIDIA NIM act as provider-level fallbacks only when Groq key
// is absent or Groq is on cooldown.
// ---------------------------------------------------------------------------
const PROVIDERS: ProviderConfig[] = [
  {
    name: 'Groq',
    apiKeyEnv: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'openai/gpt-oss-120b',
  },
  {
    name: 'OpenRouter',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    extraHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      'X-Title': 'KWIP Visual Summary Engine',
    },
  },
  {
    name: 'NVIDIA NIM',
    apiKeyEnv: 'NVIDIA_API_KEY',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    defaultModel: 'meta/llama-3.2-11b-vision-instruct',
  },
];

// ---------------------------------------------------------------------------
// Circuit Breaker — per-provider cooldown map (in-memory, per process).
// ---------------------------------------------------------------------------
const cooldownUntilMap = new Map<string, number>();

/** Returns remaining cooldown seconds (0 if ready). */
export function getProviderCooldown(providerName: string): number {
  const until = cooldownUntilMap.get(providerName) || 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/** Place a provider on cooldown. */
export function setProviderCooldown(providerName: string, durationSeconds: number): void {
  const until = Date.now() + durationSeconds * 1000;
  cooldownUntilMap.set(providerName, until);
  console.warn(`[CircuitBreaker] ${providerName} on cooldown for ${durationSeconds}s.`);
}

/** Clear all cooldowns (for testing). */
export function resetProviderCooldowns(): void {
  cooldownUntilMap.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Milliseconds remaining until deadline (negative = past deadline). */
function msUntilDeadline(deadlineMs: number | undefined): number {
  if (!deadlineMs) return Infinity;
  return deadlineMs - Date.now();
}

/**
 * Parse Groq rate-limit headers and return the recommended wait in seconds.
 * Caps at 90s to avoid burning excessive deadline.
 */
function parseGroqRetryAfter(headers: Headers): number {
  // Prefer the explicit retry-after header first
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const parsed = parseInt(retryAfter, 10);
    if (!isNaN(parsed) && parsed > 0) return Math.min(parsed, 90);
  }

  // x-ratelimit-reset-requests / x-ratelimit-reset-tokens are ISO timestamps or seconds
  for (const hdr of ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']) {
    const val = headers.get(hdr);
    if (val) {
      // Could be seconds like "3" or "3.5s" or a timestamp
      const stripped = val.replace(/s$/i, '');
      const parsed = parseFloat(stripped);
      if (!isNaN(parsed) && parsed > 0) return Math.min(Math.ceil(parsed), 90);
    }
  }

  return 20; // safe conservative default
}

// ---------------------------------------------------------------------------
// Core orchestrator
// ---------------------------------------------------------------------------

/**
 * Execute a single AI completion with deadline-aware 429 handling.
 *
 * Design:
 * - ONE attempt per provider model. No silent inner while-loop retries.
 * - On 429: read retry-after. If waiting would exceed deadline, throw immediately.
 *   Otherwise wait, then try once more on the SAME model (1 retry max).
 * - On 5xx: one immediate retry after 500ms, deadline-checked.
 * - Never blindly sleep for 30–60s and cascade to the next provider.
 * - requestId and deadlineMs propagate to all log lines.
 */
export async function executeAICompletion(
  options: ProviderRequestOptions
): Promise<{ content: string; providerName: string; latencyMs: number }> {
  const rid = options.requestId ? `[${options.requestId}]` : '[?]';
  const errors: string[] = [];

  for (const provider of PROVIDERS) {
    // Deadline check before starting a new provider
    const remainingMs = msUntilDeadline(options.deadlineMs);
    if (remainingMs < 5000) {
      console.warn(`[Orchestrator] ${rid} Deadline reached before trying ${provider.name}. Aborting.`);
      errors.push(`${provider.name}: Deadline exceeded`);
      break;
    }

    const apiKey = process.env[provider.apiKeyEnv];
    if (!apiKey) {
      console.warn(`[Orchestrator] ${rid} ${provider.name} skipped: ${provider.apiKeyEnv} not set.`);
      errors.push(`${provider.name}: Missing API key`);
      continue;
    }

    const cooldownSec = getProviderCooldown(provider.name);
    if (cooldownSec > 0) {
      // Only skip if the cooldown would exceed the deadline
      if (cooldownSec * 1000 > remainingMs) {
        console.warn(`[Orchestrator] ${rid} ${provider.name} cooldown (${cooldownSec}s) exceeds remaining deadline. Skipping.`);
        errors.push(`${provider.name}: Cooldown exceeds deadline`);
        continue;
      }
      // Otherwise wait out the cooldown
      console.warn(`[Orchestrator] ${rid} ${provider.name} cooldown — waiting ${cooldownSec}s...`);
      await new Promise((r) => setTimeout(r, cooldownSec * 1000));
    }

    const model = provider.defaultModel;
    const startTime = Date.now();

    // Per-attempt timeout: min(25s, remaining_deadline - 2s buffer)
    const perAttemptMs = Math.min(25000, Math.max(5000, msUntilDeadline(options.deadlineMs) - 2000));

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(provider.extraHeaders || {}),
    };

    const body = JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 1800,
      ...(options.response_format ? { response_format: options.response_format } : {}),
    });

    // ---- Attempt helper (DRY) ----
    const doFetch = async (): Promise<Response> => {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), perAttemptMs);
      try {
        const resp = await fetch(provider.endpoint, { method: 'POST', headers, body, signal: controller.signal });
        clearTimeout(tid);
        return resp;
      } catch (e) {
        clearTimeout(tid);
        throw e;
      }
    };

    try {
      console.log(`[Orchestrator] ${rid} → ${provider.name} model=${model} timeout=${Math.round(perAttemptMs / 1000)}s`);
      let response = await doFetch();
      let latencyMs = Date.now() - startTime;

      // --- 429 ---
      if (response.status === 429) {
        const waitSec = parseGroqRetryAfter(response.headers);
        const waitMs = waitSec * 1000;
        const remainingAfterWait = msUntilDeadline(options.deadlineMs) - waitMs;

        if (remainingAfterWait < 8000) {
          // Not enough time to retry after waiting — fail fast
          console.warn(
            `[Orchestrator] ${rid} ${provider.name} 429 — retry-after=${waitSec}s would exceed deadline. Failing fast.`
          );
          errors.push(`${provider.name} (${model}): 429 deadline-exceeded`);
          continue; // try next provider without waiting
        }

        // Enough time: wait and retry ONCE
        console.warn(
          `[Orchestrator] ${rid} ${provider.name} 429 — waiting ${waitSec}s then retrying once...`
        );
        errors.push(`${provider.name} (${model}): 429 wait=${waitSec}s`);
        await new Promise((r) => setTimeout(r, waitMs));

        // One retry
        response = await doFetch();
        latencyMs = Date.now() - startTime;

        if (response.status === 429) {
          console.warn(`[Orchestrator] ${rid} ${provider.name} 429 again after retry. Moving to next provider.`);
          errors.push(`${provider.name} (${model}): 429 repeated`);
          continue;
        }
      }

      // --- 4xx (not 429) ---
      if (response.status >= 400 && response.status < 500) {
        const errText = await response.text().catch(() => '');
        console.warn(`[Orchestrator] ${rid} ${provider.name} HTTP ${response.status}: ${errText.slice(0, 200)}`);
        errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
        continue; // try next provider
      }

      // --- 5xx — one retry ---
      if (response.status >= 500) {
        const errText = await response.text().catch(() => '');
        console.warn(`[Orchestrator] ${rid} ${provider.name} HTTP ${response.status}: ${errText.slice(0, 200)}. Retrying in 500ms...`);
        if (msUntilDeadline(options.deadlineMs) > 5000) {
          await new Promise((r) => setTimeout(r, 500));
          response = await doFetch();
          latencyMs = Date.now() - startTime;
        }
        if (!response.ok) {
          errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
          continue;
        }
      }

      if (!response.ok) {
        errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
        continue;
      }

      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        console.warn(`[Orchestrator] ${rid} ${provider.name} returned empty content.`);
        errors.push(`${provider.name} (${model}): Empty response`);
        continue;
      }

      console.log(`[Orchestrator] ${rid} SUCCESS: ${provider.name} model=${model} latency=${latencyMs}ms`);
      return { content, providerName: `${provider.name} (${model})`, latencyMs };

    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');

      if (isAbort) {
        console.warn(`[Orchestrator] ${rid} ${provider.name} (${model}) timed out after ${Math.round(perAttemptMs / 1000)}s.`);
        errors.push(`${provider.name} (${model}): Timeout`);
      } else {
        console.error(`[Orchestrator] ${rid} ${provider.name} (${model}) exception (${latencyMs}ms):`, err.message || err);
        errors.push(`${provider.name} (${model}): ${err.message || 'Network error'}`);
      }
      continue; // try next provider
    }
  }

  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${errors.join('; ')}`);
}
