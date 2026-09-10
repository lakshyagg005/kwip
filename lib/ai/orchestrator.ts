export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderRequestOptions {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
  /** Optional per-request trace ID for log correlation. */
  requestId?: string;
}

export interface ProviderConfig {
  name: string;
  apiKeyEnv: string;
  endpoint: string;
  defaultModel: string;
  fallbackModels?: string[];
  extraHeaders?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Provider registry — order determines priority (first = highest priority).
// Deprecated model IDs removed: groq/compound-mini, llama-3.3-70b-versatile,
//   llama-3.1-8b-instant, mixtral-8x7b-32768, openrouter/free.
// Primary Groq model confirmed working in dashboard: openai/gpt-oss-120b.
// ---------------------------------------------------------------------------
const PROVIDERS: ProviderConfig[] = [
  {
    name: 'Groq',
    apiKeyEnv: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    // openai/gpt-oss-120b — confirmed active in Groq dashboard (200 OK responses)
    defaultModel: 'openai/gpt-oss-120b',
    // Single fallback: llama-3.1-70b-versatile (current, non-deprecated)
    fallbackModels: ['llama-3.1-70b-versatile'],
  },
  {
    name: 'OpenRouter',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    fallbackModels: [
      'google/gemma-2-9b-it:free',
      'mistralai/mistral-7b-instruct:free',
    ],
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
    fallbackModels: ['meta/llama-3.2-90b-vision-instruct'],
  },
];


// Circuit Breaker: Track cooldown timestamp (ms) per provider
const cooldownUntilMap = new Map<string, number>();

/**
 * Get active cooldown remaining seconds for a provider (0 if ready).
 */
export function getProviderCooldown(providerName: string): number {
  const until = cooldownUntilMap.get(providerName) || 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Set cooldown for a provider.
 */
export function setProviderCooldown(providerName: string, durationSeconds: number = 25): void {
  const until = Date.now() + durationSeconds * 1000;
  cooldownUntilMap.set(providerName, until);
  console.warn(`[CircuitBreaker] Provider ${providerName} placed on ${durationSeconds}s cooldown.`);
}

/**
 * Reset all cooldowns.
 */
export function resetProviderCooldowns(): void {
  cooldownUntilMap.clear();
}


/**
 * Core provider orchestrator.
 *
 * Execution order: Groq → OpenRouter → NVIDIA NIM.
 * Per model: ONE attempt (maxAttempts=1). No silent retry on the same model.
 * On 429: honour retry-after header with an actual wait (≤60s) so the SAME
 *   provider can be retried on the next model rather than immediately jumping
 *   to a different provider and causing cascade rate-limit storms.
 * On 5xx: single retry after 500ms.
 */
export async function executeAICompletion(options: ProviderRequestOptions): Promise<{ content: string; providerName: string; latencyMs: number }> {
  const rid = options.requestId ? `[${options.requestId}] ` : '';
  const errors: string[] = [];

  for (const provider of PROVIDERS) {
    const apiKey = process.env[provider.apiKeyEnv];

    if (!apiKey) {
      console.warn(`[Orchestrator] ${rid}Provider ${provider.name} skipped: Missing ${provider.apiKeyEnv}.`);
      errors.push(`${provider.name}: Missing API key`);
      continue;
    }

    const cooldownSec = getProviderCooldown(provider.name);
    if (cooldownSec > 0) {
      console.warn(`[Orchestrator] ${rid}Provider ${provider.name} skipped: Cooldown ${cooldownSec}s remaining.`);
      errors.push(`${provider.name}: Cooldown active (${cooldownSec}s)`);
      continue;
    }

    const modelsToTry = [provider.defaultModel, ...(provider.fallbackModels || [])];

    for (const model of modelsToTry) {
      // Re-check cooldown before each model attempt (429 on previous model sets it)
      if (getProviderCooldown(provider.name) > 0) {
        console.warn(`[Orchestrator] ${rid}Provider ${provider.name} cooldown set mid-loop. Skipping remaining models.`);
        break;
      }

      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s per attempt

      try {
        console.log(`[Orchestrator] ${rid}→ ${provider.name} model=${model}`);

        const headers: Record<string, string> = {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(provider.extraHeaders || {}),
        };

        const body = JSON.stringify({
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.max_tokens ?? 2500,
          ...(options.response_format ? { response_format: options.response_format } : {}),
        });

        const response = await fetch(provider.endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        // --- 429 Rate-Limited ---
        if (response.status === 429) {
          const retryAfterRaw =
            response.headers.get('retry-after') ||
            response.headers.get('x-ratelimit-reset-requests');
          let waitSec = 30; // conservative default
          if (retryAfterRaw) {
            const parsed = parseInt(retryAfterRaw, 10);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 300) waitSec = Math.min(parsed, 60);
          }
          console.warn(`[Orchestrator] ${rid}${provider.name} 429 rate-limited (latency ${latencyMs}ms). Waiting ${waitSec}s before next model...`);
          errors.push(`${provider.name} (${model}): 429 rate-limited`);
          // Wait then break — allow the next fallback model or provider to run
          await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
          break;
        }

        // --- 4xx Client Error (not 429) ---
        if (response.status >= 400 && response.status < 500) {
          const errText = await response.text().catch(() => '');
          console.warn(`[Orchestrator] ${rid}${provider.name} HTTP ${response.status} (latency ${latencyMs}ms): ${errText.slice(0, 200)}`);
          errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
          break; // try next model in this provider
        }

        // --- 5xx Server Error — single retry after 500ms ---
        if (response.status >= 500 && response.status <= 504) {
          const errText = await response.text().catch(() => '');
          console.warn(`[Orchestrator] ${rid}${provider.name} HTTP ${response.status} server error (latency ${latencyMs}ms). Retrying once in 500ms...`);
          errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          // Single retry
          const retryController = new AbortController();
          const retryTimeout = setTimeout(() => retryController.abort(), 30000);
          try {
            const retryResponse = await fetch(provider.endpoint, { method: 'POST', headers, body, signal: retryController.signal });
            clearTimeout(retryTimeout);
            if (retryResponse.ok) {
              const retryJson = await retryResponse.json();
              const retryContent = retryJson?.choices?.[0]?.message?.content;
              if (retryContent && typeof retryContent === 'string' && retryContent.trim().length > 0) {
                const retryLatency = Date.now() - startTime;
                console.log(`[Orchestrator] ${rid}SUCCESS (retry): ${provider.name} model=${model} latency=${retryLatency}ms`);
                return { content: retryContent, providerName: `${provider.name} (${model})`, latencyMs: retryLatency };
              }
            }
          } catch {
            clearTimeout(retryTimeout);
          }
          break; // retry failed, try next model
        }

        if (!response.ok) {
          errors.push(`${provider.name} (${model}): Unexpected HTTP ${response.status}`);
          break;
        }

        const json = await response.json();
        const content = json?.choices?.[0]?.message?.content;

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          console.warn(`[Orchestrator] ${rid}${provider.name} (${model}) returned empty content.`);
          errors.push(`${provider.name} (${model}): Empty response`);
          break;
        }

        console.log(`[Orchestrator] ${rid}SUCCESS: ${provider.name} model=${model} latency=${latencyMs}ms`);
        return { content, providerName: `${provider.name} (${model})`, latencyMs };

      } catch (err: any) {
        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;
        const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');

        if (isAbort) {
          console.warn(`[Orchestrator] ${rid}${provider.name} (${model}) timed out after 30s.`);
          errors.push(`${provider.name} (${model}): Timeout`);
        } else {
          console.error(`[Orchestrator] ${rid}${provider.name} (${model}) exception (latency ${latencyMs}ms):`, err.message || err);
          errors.push(`${provider.name} (${model}): ${err.message || 'Network error'}`);
        }
        break; // do not retry on exception — move to next model
      }
    }
  }

  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${errors.join('; ')}`);
}
