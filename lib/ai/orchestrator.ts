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
   * If the call cannot START before deadline, the orchestrator throws immediately.
   */
  deadlineMs?: number;
  /** Optional chunk index for multi-chunk trace logging. */
  chunkIndex?: number;
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
// Strategy:
//   Groq 200      → return result immediately. OpenRouter = 0 calls.
//   Groq 429/4xx  → set circuit-breaker, immediately cascade to OpenRouter.
//                   NO sleep. NO retry on the same provider.
//   OR  200       → return result immediately. NVIDIA = 0 calls.
//   All fail      → throw AI_ALL_PROVIDERS_FAILED.
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
      'HTTP-Referer': 'https://kwip-brown.vercel.app/',
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
  console.warn(`[CircuitBreaker] ${providerName} on cooldown for ${durationSeconds}s (until ${new Date(until).toISOString()}).`);
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
 * Parse rate-limit headers and return the recommended cooldown in seconds.
 * Used ONLY to set the circuit-breaker duration — we never sleep for this long.
 * Caps at 60s.
 */
function parseRetryAfterSeconds(headers: Headers): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const parsed = parseInt(retryAfter, 10);
    if (!isNaN(parsed) && parsed > 0) return Math.min(parsed, 60);
  }

  for (const hdr of ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']) {
    const val = headers.get(hdr);
    if (val) {
      const stripped = val.replace(/s$/i, '');
      const parsed = parseFloat(stripped);
      if (!isNaN(parsed) && parsed > 0) return Math.min(Math.ceil(parsed), 60);
    }
  }

  return 30; // conservative default cooldown for circuit breaker
}

// ---------------------------------------------------------------------------
// Core orchestrator
// ---------------------------------------------------------------------------

/**
 * Execute a single AI completion with provider fallback.
 *
 * Fallback policy (CRITICAL):
 * - Groq 200      → return immediately. OpenRouter = 0 calls.
 * - Groq 429      → set circuit-breaker, immediately continue to OpenRouter.
 *                   NO sleep. NO retry on the same provider.
 * - Groq 4xx      → immediately continue to next provider.
 * - Groq 5xx      → one 500ms retry, then cascade if still failing.
 * - OpenRouter 200 → return immediately. NVIDIA = 0 calls.
 * - All fail       → throw AI_ALL_PROVIDERS_FAILED.
 *
 * Circuit breaker: once a provider is 429'd, it is marked on cooldown.
 * Subsequent chunk calls in the same request skip it without sleeping.
 */
export async function executeAICompletion(
  options: ProviderRequestOptions
): Promise<{ content: string; providerName: string; latencyMs: number }> {
  const rid = options.requestId ? `[${options.requestId}]` : '[?]';
  const chunkTag = options.chunkIndex !== undefined ? ` chunk=${options.chunkIndex}` : '';
  const errors: string[] = [];

  for (const provider of PROVIDERS) {
    // ── Deadline check ──────────────────────────────────────────────────────
    const remainingMs = msUntilDeadline(options.deadlineMs);
    if (remainingMs < 5000) {
      console.warn(`[Orchestrator] ${rid}${chunkTag} Deadline reached before trying ${provider.name}. Aborting.`);
      errors.push(`${provider.name}: Deadline exceeded`);
      break;
    }

    // ── API key check ────────────────────────────────────────────────────────
    const apiKey = process.env[provider.apiKeyEnv];
    if (!apiKey) {
      console.warn(`[Orchestrator] ${rid}${chunkTag} ${provider.name} skipped: ${provider.apiKeyEnv} not set.`);
      errors.push(`${provider.name}: Missing API key`);
      continue;
    }

    // ── Circuit breaker — skip immediately, do NOT sleep ────────────────────
    // If this provider was 429'd earlier in this request, skip it instantly.
    const cooldownSec = getProviderCooldown(provider.name);
    if (cooldownSec > 0) {
      console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_SKIP] provider=${provider.name} reason=cooldown remaining=${cooldownSec}s`);
      errors.push(`${provider.name}: On cooldown (${cooldownSec}s)`);
      continue;
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
      console.log(`[Orchestrator] ${rid}${chunkTag} [AI_ATTEMPT] provider=${provider.name} model=${model} timeout=${Math.round(perAttemptMs / 1000)}s`);
      let response = await doFetch();
      const latencyMs = Date.now() - startTime;

      // ── 429 Rate Limited ─────────────────────────────────────────────────
      // KEY FIX: Do NOT wait. Do NOT retry on the same provider.
      // Set circuit-breaker cooldown and immediately cascade to next provider.
      if (response.status === 429) {
        const cooldown = parseRetryAfterSeconds(response.headers);
        console.warn(
          `[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} status=429 latency=${latencyMs}ms`
        );
        console.warn(
          `[Orchestrator] ${rid}${chunkTag} [AI_FALLBACK] provider=${provider.name} reason=429 cooldown=${cooldown}s → cascading to next provider immediately`
        );
        setProviderCooldown(provider.name, cooldown);
        errors.push(`${provider.name} (${model}): 429 rate-limited → cascading`);
        continue; // immediately try OpenRouter
      }

      // ── 4xx (not 429) ────────────────────────────────────────────────────
      if (response.status >= 400 && response.status < 500) {
        const errText = await response.text().catch(() => '');
        console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} status=${response.status} latency=${latencyMs}ms body=${errText.slice(0, 200)}`);
        errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
        continue;
      }

      // ── 5xx — one retry after 500ms ──────────────────────────────────────
      if (response.status >= 500) {
        const errText = await response.text().catch(() => '');
        console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} status=${response.status} latency=${latencyMs}ms — retrying in 500ms`);
        if (msUntilDeadline(options.deadlineMs) > 5000) {
          await new Promise((r) => setTimeout(r, 500));
          const retry = await doFetch();
          if (!retry.ok) {
            errors.push(`${provider.name} (${model}): HTTP ${retry.status} after 5xx retry`);
            continue;
          }
          const retryJson = await retry.json();
          const retryContent = retryJson?.choices?.[0]?.message?.content;
          if (!retryContent || typeof retryContent !== 'string' || retryContent.trim().length === 0) {
            errors.push(`${provider.name} (${model}): Empty response after 5xx retry`);
            continue;
          }
          const retryLatency = Date.now() - startTime;
          console.log(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} status=200 latency=${retryLatency}ms (after 5xx retry)`);
          return { content: retryContent, providerName: `${provider.name} (${model})`, latencyMs: retryLatency };
        }
        errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
        continue;
      }

      if (!response.ok) {
        errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
        continue;
      }

      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} status=200 empty_content latency=${latencyMs}ms`);
        errors.push(`${provider.name} (${model}): Empty response`);
        continue;
      }

      console.log(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} status=200 latency=${latencyMs}ms`);
      return { content, providerName: `${provider.name} (${model})`, latencyMs };

    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');

      if (isAbort) {
        console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} status=TIMEOUT latency=${latencyMs}ms timeout=${Math.round(perAttemptMs / 1000)}s`);
        errors.push(`${provider.name} (${model}): Timeout`);
      } else {
        console.error(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} status=ERROR latency=${latencyMs}ms error=${err.message || err}`);
        errors.push(`${provider.name} (${model}): ${err.message || 'Network error'}`);
      }
      continue;
    }
  }

  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${errors.join('; ')}`);
}
