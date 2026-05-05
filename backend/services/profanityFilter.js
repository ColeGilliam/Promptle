import { API_NINJAS_API_KEY } from '../config/config.js';

export const PROFANITY_FILTER_TEXT_LIMIT = 1000;
const PROFANITY_FILTER_URL = 'https://api.api-ninjas.com/v1/profanityfilter';

export function normalizeProfanityFilterText(text) {
  if (typeof text !== 'string') return '';
  return text.trim().slice(0, PROFANITY_FILTER_TEXT_LIMIT);
}

export async function filterProfanity(text) {
  const normalizedText = normalizeProfanityFilterText(text);
  if (!normalizedText || !API_NINJAS_API_KEY) return normalizedText;

  const url = new URL(PROFANITY_FILTER_URL);
  url.searchParams.set('text', normalizedText);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': API_NINJAS_API_KEY,
      },
    });

    if (!response.ok) return normalizedText;

    const payload = await response.json();
    return typeof payload?.censored === 'string'
      ? normalizeProfanityFilterText(payload.censored)
      : normalizedText;
  } catch {
    return normalizedText;
  }
}
