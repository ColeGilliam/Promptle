import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
process.env.API_NINJAS_API_KEY = 'api-key';

const {
  PROFANITY_FILTER_TEXT_LIMIT,
  filterProfanity,
  normalizeProfanityFilterText,
} = await import('../services/profanityFilter.js');

test('normalizeProfanityFilterText trims text and respects the API length limit', () => {
  const longText = `  ${'a'.repeat(PROFANITY_FILTER_TEXT_LIMIT + 20)}  `;

  const normalized = normalizeProfanityFilterText(longText);

  assert.equal(normalized.length, PROFANITY_FILTER_TEXT_LIMIT);
  assert.equal(normalized, 'a'.repeat(PROFANITY_FILTER_TEXT_LIMIT));
});

test('filterProfanity returns the API-censored text', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = null;
  let requestedHeaders = null;

  globalThis.fetch = async (url, options) => {
    requestedUrl = url;
    requestedHeaders = options.headers;
    return {
      ok: true,
      json: async () => ({
        censored: 'hello ****',
      }),
    };
  };

  try {
    const result = await filterProfanity('fuck you');

    assert.equal(requestedUrl.searchParams.get('text'), 'fuck you');
    assert.equal(requestedHeaders['X-Api-Key'], 'api-key');
    assert.equal(result, '**** you');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('filterProfanity falls back to the normalized message when the API is unavailable', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
  });

  try {
    const result = await filterProfanity('  hello world  ');

    assert.equal(result, 'hello world');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
