import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/config.js';

export const generationOpenAiClient = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

export function getTokenUsageLabel(completion) {
  return completion?.usage || 'No usage data';
}

export function requireOpenAi(openaiClient, apiKey, errorMessage) {
  if (!openaiClient || !apiKey) {
    throw new Error(errorMessage);
  }
}
