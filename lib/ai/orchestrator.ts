export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderRequestOptions {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
  requestId?: string;
  deadlineMs?: number;
  chunkIndex?: number;
}

export interface ProviderConfig {
  name: string;
  apiKeyEnv: string;
  endpoint: string;
  models: string[];
  extraHeaders?: Record<string, string>;
  supportsJsonMode?: boolean;
}

// ─── Providers ────────────────────────────────────────────────────────────────
// Groq = PRIMARY  (low-latency, high throughput)
// OpenRouter = SECONDARY fallback (free-tier only, :free suffix)
//
// Normal flow  : Groq models tried sequentially (fastest first)
// On 429 / 401 : PARALLEL RACE — remaining Groq models + all OpenRouter models
//                fired simultaneously; first success wins.
// ──────────────────────────────────────────────────────────────────────────────

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'Groq',
    apiKeyEnv: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    models: [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ],
    supportsJsonMode: false,
  },
  {
    name: 'OpenRouter',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'openrouter/free',
    ],
    supportsJsonMode: false,
    extraHeaders: {
      'HTTP-Referer': 'https://kwip-brown.vercel.app/',
      'X-Title': 'KWIP Visual Summary Engine',
    },
  },
];

const cooldownUntilMap = new Map<string, number>();

function modelCooldownKey(providerName: string, model: string): string {
  return `${providerName}:${model}`;
}

export function getProviderCooldown(providerName: string, model?: string): number {
  if (model) {
    const modelUntil = cooldownUntilMap.get(modelCooldownKey(providerName, model)) || 0;
    if (modelUntil > Date.now()) {
      return Math.ceil((modelUntil - Date.now()) / 1000);
    }
  }
  const providerUntil = cooldownUntilMap.get(providerName) || 0;
  const remaining = Math.ceil((providerUntil - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

export function setProviderCooldown(providerName: string, durationSeconds: number, model?: string): void {
  const key = model ? modelCooldownKey(providerName, model) : providerName;
  const until = Date.now() + durationSeconds * 1000;
  cooldownUntilMap.set(key, until);
  console.warn(`[CircuitBreaker] ${providerName}${model ? `/${model}` : ''} on cooldown for ${durationSeconds}s.`);
}

export function resetProviderCooldowns(): void {
  cooldownUntilMap.clear();
}

function msUntilDeadline(deadlineMs: number | undefined): number {
  if (!deadlineMs) return Infinity;
  return deadlineMs - Date.now();
}

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
  return 30;
}

// ─── Typed single-attempt helper ─────────────────────────────────────────────

type AttemptResult =
  | { type: 'success'; content: string; providerName: string; latencyMs: number }
  | { type: 'rate_limit'; cooldownSec: number; error: string }
  | { type: 'auth_error'; error: string }
  | { type: 'transient'; error: string };

/** Execute one provider+model request. Never throws — always returns a typed result. */
async function attemptOne(
  provider: ProviderConfig,
  model: string,
  apiKey: string,
  options: ProviderRequestOptions,
  rid: string,
  chunkTag: string,
  timeoutMs: number
): Promise<AttemptResult> {
  const includeJsonMode = !!options.response_format && provider.supportsJsonMode === true;
  const startTime = Date.now();

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
    ...(includeJsonMode ? { response_format: options.response_format } : {}),
  });

  const doFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
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
    console.log(`[Orchestrator] ${rid}${chunkTag} [AI_ATTEMPT] provider=${provider.name} model=${model} timeout=${Math.round(timeoutMs / 1000)}s`);
    const response = await doFetch();
    const latencyMs = Date.now() - startTime;

    if (response.status === 429) {
      const cooldownSec = parseRetryAfterSeconds(response.headers);
      console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=429 latency=${latencyMs}ms cooldown=${cooldownSec}s`);
      setProviderCooldown(provider.name, cooldownSec, model);
      return { type: 'rate_limit', cooldownSec, error: `${provider.name}/${model}: 429` };
    }

    if (response.status === 401) {
      const errText = await response.text().catch(() => '');
      console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=401 latency=${latencyMs}ms`);
      return { type: 'auth_error', error: `${provider.name}/${model}: 401 ${errText.slice(0, 100)}` };
    }

    if (response.status >= 400 && response.status < 500) {
      const errText = await response.text().catch(() => '');
      console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=${response.status} latency=${latencyMs}ms body=${errText.slice(0, 200)}`);
      return { type: 'transient', error: `${provider.name}/${model}: HTTP ${response.status}` };
    }

    if (response.status >= 500) {
      console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=${response.status} retrying...`);
      if (msUntilDeadline(options.deadlineMs) > 5000) {
        await new Promise((r) => setTimeout(r, 500));
        const retry = await doFetch();
        if (retry.ok) {
          const retryJson = await retry.json();
          const retryContent = retryJson?.choices?.[0]?.message?.content;
          if (retryContent && typeof retryContent === 'string' && retryContent.trim().length > 0) {
            const retryLatency = Date.now() - startTime;
            console.log(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=200 latency=${retryLatency}ms (5xx-retry)`);
            return { type: 'success', content: retryContent, providerName: `${provider.name} (${model})`, latencyMs: retryLatency };
          }
        }
      }
      return { type: 'transient', error: `${provider.name}/${model}: HTTP ${response.status}` };
    }

    if (!response.ok) {
      return { type: 'transient', error: `${provider.name}/${model}: HTTP ${response.status}` };
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=200 empty`);
      return { type: 'transient', error: `${provider.name}/${model}: Empty response` };
    }

    console.log(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=200 latency=${latencyMs}ms`);
    return { type: 'success', content, providerName: `${provider.name} (${model})`, latencyMs };

  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
    if (isAbort) {
      console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=TIMEOUT latency=${latencyMs}ms`);
      return { type: 'transient', error: `${provider.name}/${model}: Timeout` };
    }
    console.error(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=ERROR error=${err.message || err}`);
    return { type: 'transient', error: `${provider.name}/${model}: ${err.message || 'Network error'}` };
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────
//
// Strategy:
//   1. Try Groq models sequentially (primary — lowest latency on happy path).
//   2. On 429 or 401 from any Groq model → immediately fire a PARALLEL RACE:
//      ALL remaining Groq models + ALL OpenRouter free models simultaneously.
//      First success wins (Promise.any). No extra waiting.
//   3. If Groq is missing / all on cooldown, fall through to OpenRouter sequentially.
// ─────────────────────────────────────────────────────────────────────────────

export async function executeAICompletion(
  options: ProviderRequestOptions
): Promise<{ content: string; providerName: string; latencyMs: number }> {
  const rid = options.requestId ? `[${options.requestId}]` : '[?]';
  const chunkTag = options.chunkIndex !== undefined ? ` chunk=${options.chunkIndex}` : '';
  const errors: string[] = [];

  // Flat ordered candidate list: Groq models first, then OpenRouter models
  type Candidate = { provider: ProviderConfig; model: string; apiKey: string };
  const allCandidates: Candidate[] = [];

  for (const provider of PROVIDERS) {
    const apiKey = process.env[provider.apiKeyEnv];
    if (!apiKey) {
      console.warn(`[Orchestrator] ${rid}${chunkTag} ${provider.name} skipped: ${provider.apiKeyEnv} not set.`);
      errors.push(`${provider.name}: Missing API key`);
      continue;
    }
    for (const model of provider.models) {
      allCandidates.push({ provider, model, apiKey });
    }
  }

  // Helper: wrap attemptOne as a promise that rejects on non-success (for Promise.any)
  const raceOne = (c: Candidate, timeoutMs: number) =>
    attemptOne(c.provider, c.model, c.apiKey, options, rid, chunkTag, timeoutMs).then((r) => {
      if (r.type === 'success') return r;
      throw new Error(r.error);
    });

  let parallelRaceTriggered = false;

  for (let i = 0; i < allCandidates.length; i++) {
    if (msUntilDeadline(options.deadlineMs) < 5000) {
      errors.push('Deadline exceeded');
      break;
    }

    const c = allCandidates[i];

    const cooldownSec = getProviderCooldown(c.provider.name, c.model);
    if (cooldownSec > 0) {
      console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_SKIP] provider=${c.provider.name} model=${c.model} cooldown=${cooldownSec}s`);
      errors.push(`${c.provider.name}/${c.model}: On cooldown`);
      continue;
    }

    const remainingMs = msUntilDeadline(options.deadlineMs);
    const timeoutMs = Math.min(25000, Math.max(5000, remainingMs - 2000));

    const result = await attemptOne(c.provider, c.model, c.apiKey, options, rid, chunkTag, timeoutMs);

    if (result.type === 'success') {
      return result;
    }

    errors.push(result.error);

    // ── 429 / 401 on Groq → kick off parallel race immediately ───────────────
    if ((result.type === 'rate_limit' || result.type === 'auth_error') && !parallelRaceTriggered) {
      parallelRaceTriggered = true;

      const remaining = allCandidates.slice(i + 1).filter((rc) => {
        if (getProviderCooldown(rc.provider.name, rc.model) > 0) {
          errors.push(`${rc.provider.name}/${rc.model}: On cooldown (skipped from race)`);
          return false;
        }
        return true;
      });

      if (remaining.length === 0) {
        console.warn(`[Orchestrator] ${rid}${chunkTag} [PARALLEL_RACE] No available candidates to race.`);
        break;
      }

      const raceTimeoutMs = Math.min(25000, Math.max(5000, msUntilDeadline(options.deadlineMs) - 2000));
      const label = result.type === 'rate_limit' ? '429' : '401';
      console.log(
        `[Orchestrator] ${rid}${chunkTag} [PARALLEL_RACE] Groq hit ${label} → racing ${remaining.length} candidates simultaneously: ` +
        remaining.map((r) => `${r.provider.name}/${r.model}`).join(', ')
      );

      try {
        const winner = await Promise.any(remaining.map((rc) => raceOne(rc, raceTimeoutMs)));
        console.log(`[Orchestrator] ${rid}${chunkTag} [PARALLEL_RACE] Winner: ${winner.providerName} latency=${winner.latencyMs}ms`);
        return winner;
      } catch {
        errors.push('All parallel race candidates failed');
      }

      break; // parallel race is the final fallback
    }
  }

  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${errors.join('; ')}`);
}

