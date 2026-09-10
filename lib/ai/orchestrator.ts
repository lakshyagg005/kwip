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

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'Groq',
    apiKeyEnv: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    // Only confirmed-active Groq models that support response_format: json_object.
    // openai/gpt-oss-20b removed: returns json_validate_failed 400 (requires full JSON Schema, not json_object mode).
    models: [
      'openai/gpt-oss-120b',   // primary — confirmed 200 in production, supports json_object
      'llama3-groq-8b-8192',   // secondary — stable, fast, confirmed json_object support
    ],
    supportsJsonMode: true,
  },
  {
    name: 'OpenRouter',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-3-27b-it:free',
      'mistralai/mistral-7b-instruct:free',
    ],
    supportsJsonMode: false,
    extraHeaders: {
      'HTTP-Referer': 'https://kwip-brown.vercel.app/',
      'X-Title': 'KWIP Visual Summary Engine',
    },
  },
  {
    name: 'NVIDIA NIM',
    apiKeyEnv: 'NVIDIA_API_KEY',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    models: ['meta/llama-3.3-70b-instruct'],
    supportsJsonMode: false,
  },
];

const cooldownUntilMap = new Map<string, number>();

function modelCooldownKey(providerName: string, model: string): string {
  return `${providerName}:${model}`;
}

export function getProviderCooldown(providerName: string, model?: string): number {
  const key = model ? modelCooldownKey(providerName, model) : providerName;
  const until = cooldownUntilMap.get(key) || 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
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

export async function executeAICompletion(
  options: ProviderRequestOptions
): Promise<{ content: string; providerName: string; latencyMs: number }> {
  const rid = options.requestId ? `[${options.requestId}]` : '[?]';
  const chunkTag = options.chunkIndex !== undefined ? ` chunk=${options.chunkIndex}` : '';
  const errors: string[] = [];

  for (const provider of PROVIDERS) {
    if (msUntilDeadline(options.deadlineMs) < 5000) {
      errors.push(`${provider.name}: Deadline exceeded`);
      break;
    }

    const apiKey = process.env[provider.apiKeyEnv];
    if (!apiKey) {
      console.warn(`[Orchestrator] ${rid}${chunkTag} ${provider.name} skipped: ${provider.apiKeyEnv} not set.`);
      errors.push(`${provider.name}: Missing API key`);
      continue;
    }

    const includeJsonMode = !!options.response_format && provider.supportsJsonMode === true;

    for (const model of provider.models) {
      const remainingMs = msUntilDeadline(options.deadlineMs);
      if (remainingMs < 5000) {
        errors.push(`${provider.name}/${model}: Deadline exceeded`);
        break;
      }

      const cooldownSec = getProviderCooldown(provider.name, model);
      if (cooldownSec > 0) {
        console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_SKIP] provider=${provider.name} model=${model} cooldown=${cooldownSec}s`);
        errors.push(`${provider.name}/${model}: On cooldown`);
        continue;
      }

      const startTime = Date.now();
      const perAttemptMs = Math.min(25000, Math.max(5000, remainingMs - 2000));

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
        const response = await doFetch();
        const latencyMs = Date.now() - startTime;

        // 429 → per-model cooldown → try next model in SAME provider
        if (response.status === 429) {
          const cooldown = parseRetryAfterSeconds(response.headers);
          console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=429 latency=${latencyMs}ms → cooldown=${cooldown}s next model`);
          setProviderCooldown(provider.name, cooldown, model);
          errors.push(`${provider.name}/${model}: 429`);
          continue;
        }

        // 4xx → try next model
        if (response.status >= 400 && response.status < 500) {
          const errText = await response.text().catch(() => '');
          console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=${response.status} latency=${latencyMs}ms body=${errText.slice(0, 200)}`);
          errors.push(`${provider.name}/${model}: HTTP ${response.status}`);
          continue;
        }

        // 5xx → one retry, then next model
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
                return { content: retryContent, providerName: `${provider.name} (${model})`, latencyMs: retryLatency };
              }
            }
          }
          errors.push(`${provider.name}/${model}: HTTP ${response.status}`);
          continue;
        }

        if (!response.ok) {
          errors.push(`${provider.name}/${model}: HTTP ${response.status}`);
          continue;
        }

        // 200 success
        const json = await response.json();
        const content = json?.choices?.[0]?.message?.content;

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=200 empty`);
          errors.push(`${provider.name}/${model}: Empty response`);
          continue;
        }

        console.log(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=200 latency=${latencyMs}ms`);
        return { content, providerName: `${provider.name} (${model})`, latencyMs };

      } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
        if (isAbort) {
          console.warn(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=TIMEOUT latency=${latencyMs}ms`);
          errors.push(`${provider.name}/${model}: Timeout`);
        } else {
          console.error(`[Orchestrator] ${rid}${chunkTag} [AI_RESULT] provider=${provider.name} model=${model} status=ERROR error=${err.message || err}`);
          errors.push(`${provider.name}/${model}: ${err.message || 'Network error'}`);
        }
        continue;
      }
    } // end model loop
  } // end provider loop

  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${errors.join('; ')}`);
}
