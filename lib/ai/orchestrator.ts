export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderRequestOptions {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
}

export interface ProviderConfig {
  name: string;
  apiKeyEnv: string;
  endpoint: string;
  defaultModel: string;
  fallbackModels?: string[];
  extraHeaders?: Record<string, string>;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'Groq',
    apiKeyEnv: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'groq/compound-mini',
    fallbackModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  },
  {
    name: 'OpenRouter',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openrouter/free',
    fallbackModels: [
      'google/gemma-2-9b-it:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
      'qwen/qwen-2.5-coder-32b-instruct:free',
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
    fallbackModels: ['meta/llama-3.2-90b-vision-instruct', 'deepseek-ai/deepseek-r1'],
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
 * Core provider orchestrator executing calls in priority order (Groq -> OpenRouter -> NVIDIA NIM).
 */
export async function executeAICompletion(options: ProviderRequestOptions): Promise<{ content: string; providerName: string; latencyMs: number }> {
  const errors: string[] = [];

  for (const provider of PROVIDERS) {
    const apiKey = process.env[provider.apiKeyEnv];

    if (!apiKey) {
      console.warn(`[Orchestrator] Provider ${provider.name} skipped: Missing ${provider.apiKeyEnv} environment variable.`);
      errors.push(`${provider.name}: Missing API key`);
      continue;
    }

    const cooldownSec = getProviderCooldown(provider.name);
    if (cooldownSec > 0) {
      console.warn(`[Orchestrator] Provider ${provider.name} skipped: Active cooldown (${cooldownSec}s remaining).`);
      errors.push(`${provider.name}: Cooldown active (${cooldownSec}s)`);
      continue;
    }

    const modelsToTry = [provider.defaultModel, ...(provider.fallbackModels || [])];

    for (const model of modelsToTry) {
      if (getProviderCooldown(provider.name) > 0) {
        console.warn(`[Orchestrator] Provider ${provider.name} skipped remaining models: Active cooldown.`);
        break;
      }
      const startTime = Date.now();
      let attemptCount = 0;
      const maxAttempts = 2;

      while (attemptCount < maxAttempts) {
        attemptCount++;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s fast timeout per attempt

        try {
          console.log(`[Orchestrator] Attempting call to ${provider.name} (model: ${model}, attempt: ${attemptCount}/${maxAttempts})...`);

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

          // 1. Rate-Limit (429) Handling
          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('retry-after') || response.headers.get('x-ratelimit-reset-requests');
            let cooldownSec = 20;
            if (retryAfterHeader) {
              const parsed = parseInt(retryAfterHeader, 10);
              if (!isNaN(parsed) && parsed > 0 && parsed <= 300) {
                cooldownSec = parsed;
              }
            }
            setProviderCooldown(provider.name, cooldownSec);
            console.warn(`[Orchestrator] ${provider.name} HTTP 429 Rate-Limited (Latency: ${latencyMs}ms). Failing over to next provider.`);
            errors.push(`${provider.name} (${model}): Rate-limited (429)`);
            break;
          }

          // 2. Auth or Client Error (400-499 except 429)
          if (response.status >= 400 && response.status < 500) {
            const errText = await response.text().catch(() => '');
            console.warn(`[Orchestrator] ${provider.name} HTTP ${response.status} client error (Latency: ${latencyMs}ms): ${errText.slice(0, 150)}`);
            errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
            break;
          }

          // 3. Transient Server Error (500-504)
          if (response.status >= 500 && response.status <= 504) {
            const errText = await response.text().catch(() => '');
            console.warn(`[Orchestrator] ${provider.name} HTTP ${response.status} server error (attempt ${attemptCount}/${maxAttempts}): ${errText.slice(0, 150)}`);
            if (attemptCount < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            }
            errors.push(`${provider.name} (${model}): HTTP ${response.status}`);
            break;
          }

          if (!response.ok) {
            errors.push(`${provider.name} (${model}): Unexpected status HTTP ${response.status}`);
            break;
          }

          const json = await response.json();
          const content = json?.choices?.[0]?.message?.content;

          if (!content || typeof content !== 'string' || content.trim().length === 0) {
            console.warn(`[Orchestrator] ${provider.name} (${model}) returned empty response.`);
            errors.push(`${provider.name} (${model}): Empty response`);
            break;
          }

          console.log(`[Orchestrator] SUCCESS: ${provider.name} (${model}) completed in ${latencyMs}ms.`);
          return {
            content,
            providerName: `${provider.name} (${model})`,
            latencyMs,
          };
        } catch (err: any) {
          clearTimeout(timeoutId);
          const latencyMs = Date.now() - startTime;
          const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');

          if (isAbort) {
            console.warn(`[Orchestrator] ${provider.name} (${model}) request timed out after 25s.`);
            errors.push(`${provider.name} (${model}): Timeout (25s)`);
            break;
          }

          console.error(`[Orchestrator] ${provider.name} (${model}) exception:`, err.message || err);
          errors.push(`${provider.name} (${model}): ${err.message || 'Network error'}`);

          if (attemptCount < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          break;
        }
      }
    }
  }

  throw new Error(`AI_ALL_PROVIDERS_FAILED: All AI providers failed or are temporarily unavailable (${errors.join('; ')}). Please try again in a few moments.`);
}
