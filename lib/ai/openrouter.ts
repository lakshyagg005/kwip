import { executeAICompletion } from './orchestrator';

export const OPENROUTER_DEFAULT_MODEL = 'google/gemma-2-9b-it:free';

export interface OpenRouterCompletionOptions {
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
}

/**
 * Legacy wrapper forwarding requests to the unified multi-provider orchestrator.
 */
export async function callOpenRouterChat(
  options: OpenRouterCompletionOptions
): Promise<string> {
  const result = await executeAICompletion({
    messages: options.messages,
    temperature: options.temperature,
    max_tokens: options.max_tokens,
    response_format: options.response_format,
  });

  return result.content;
}
