import OpenAI from 'openai';
import db from '@/lib/db';

/**
 * Fetches LLM configuration from the database
 */
export function getConfig(): Record<string, string> {
  const configRows = db.prepare('SELECT key, value FROM config').all() as { key: string, value: string }[];
  const config = configRows.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {} as Record<string, string>);
  return config;
}

/**
 * Creates an OpenAI client instance with the configured baseURL and API key
 */
export function getOpenAIClient(): OpenAI {
  const config = getConfig();
  return new OpenAI({
    baseURL: config.llm_base_url || 'http://localhost:8080/v1',
    apiKey: config.llm_api_key || 'sk-no-key-required',
  });
}

/**
 * Returns the configured LLM model name
 */
export function getModel(): string {
  const config = getConfig();
  return config.llm_model || 'llama-3.2-3b-instruct';
}
