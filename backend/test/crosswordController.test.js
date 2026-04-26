import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { createGenerateCrosswordHandler } = await import('../controllers/crosswordController.js');
const { normalizeCrosswordCandidatePool } = await import('../services/crosswordGame.js');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function buildValidCandidatePool() {
  return {
    topic: 'Neon Signs',
    candidates: [
      { answer: 'EVEN', clue: 'Level or balanced', kind: 'support' },
      { answer: 'VICE', clue: 'Bad habit', kind: 'support' },
      { answer: 'ECHO', clue: 'Returned sound', kind: 'support' },
      { answer: 'NEON', clue: 'Gas used in bright signs', kind: 'theme' },
      { answer: 'GLOW', clue: 'Shine softly', kind: 'theme' },
      { answer: 'LAMP', clue: 'Portable light source', kind: 'theme' },
      { answer: 'SIGN', clue: 'Displayed notice', kind: 'theme' },
      { answer: 'AURA', clue: 'Distinct atmosphere', kind: 'theme' },
      { answer: 'SPARK', clue: 'Brief flash', kind: 'theme' },
      { answer: 'NIGHT', clue: 'Time after sunset', kind: 'theme' },
      { answer: 'RADIO', clue: 'Broadcast receiver', kind: 'support' },
      { answer: 'TUBE', clue: 'Hollow cylinder', kind: 'support' },
      { answer: 'MARQUEE', clue: 'Theater sign over an entrance', kind: 'theme' },
      { answer: 'BULB', clue: 'Light source in a sign', kind: 'theme' },
      { answer: 'FLASH', clue: 'Quick burst of light', kind: 'theme' },
      { answer: 'VIVID', clue: 'Brightly intense', kind: 'support' },
      { answer: 'WATT', clue: 'Unit for power', kind: 'support' },
      { answer: 'CITY', clue: 'Dense urban area', kind: 'support' },
      { answer: 'STREET', clue: 'Road lined with storefronts', kind: 'theme' },
      { answer: 'RETRO', clue: 'Vintage in style', kind: 'theme' },
    ],
  };
}

function buildImpossibleCandidatePool() {
  return {
    topic: 'Neon Signs',
    candidates: [
      { answer: 'ARC', clue: 'Curved path', kind: 'theme' },
      { answer: 'GAS', clue: 'Neon, for one', kind: 'theme' },
      { answer: 'LIT', clue: 'Glowing', kind: 'theme' },
      { answer: 'INK', clue: 'Printer supply', kind: 'support' },
      { answer: 'OWL', clue: 'Night bird', kind: 'support' },
      { answer: 'RAY', clue: 'Beam of light', kind: 'theme' },
      { answer: 'TAX', clue: 'Government levy', kind: 'support' },
      { answer: 'URN', clue: 'Decorative vessel', kind: 'support' },
      { answer: 'VOW', clue: 'Solemn promise', kind: 'support' },
      { answer: 'WAX', clue: 'Polish ingredient', kind: 'support' },
      { answer: 'YAK', clue: 'Shaggy bovine', kind: 'support' },
      { answer: 'ZAP', clue: 'Sudden burst', kind: 'theme' },
    ],
  };
}

test('generateCrosswordGame returns 500 when OpenAI response is invalid JSON', async () => {
  const openaiClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: '{"topic":"Movies", BAD_JSON' } }],
          usage: { total_tokens: 10 },
        }),
      },
    },
  };

  const loggerCalls = [];
  const handler = createGenerateCrosswordHandler({
    openaiClient,
    apiKey: 'test-key',
    logger: {
      info() {},
      error(...args) {
        loggerCalls.push(args);
      },
    },
    fetchDevSettingsFn: async () => ({ allowAllAIGeneration: true }),
    moderateTopicInputFn: async () => ({
      flagged: false,
      flaggedCategories: [],
      moderationId: 'mod_ok',
      moderationModel: 'omni-moderation-latest',
    }),
  });

  const req = { body: { topic: 'Movies' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Sorry! The crossword failed to generate. Please try again.' });
  assert.equal(loggerCalls.length > 0, true);
});

test('generateCrosswordGame builds a valid crossword from a candidate pool', async () => {
  let requestBody = null;
  const openaiClient = {
    chat: {
      completions: {
        create: async (request) => {
          requestBody = request;
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  ...buildValidCandidatePool(),
                  topic: 'Wrong Topic', // The controller should ignore this and use the original topic from the request.
                }),
              },
            }],
            usage: { total_tokens: 42 },
          };
        },
      },
    },
  };

  const handler = createGenerateCrosswordHandler({
    openaiClient,
    apiKey: 'test-key',
    logger: {
      info() {},
      error() {},
    },
    fetchDevSettingsFn: async () => ({ allowAllAIGeneration: true }),
    moderateTopicInputFn: async () => ({
      flagged: false,
      flaggedCategories: [],
      moderationId: 'mod_ok',
      moderationModel: 'omni-moderation-latest',
    }),
  });

  const req = { body: { topic: 'Neon Signs' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(requestBody.max_completion_tokens, 5000);
  assert.equal(requestBody.response_format.type, 'json_schema');
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(requestBody.response_format.json_schema.schema.properties.candidates.minItems, 30);
  assert.equal(requestBody.response_format.json_schema.schema.properties.candidates.maxItems, 48);
  assert.match(requestBody.messages[0].content, /Return 30-48 candidates/i);
  assert.equal(res.body.topic, 'Neon Signs');
  assert.equal(res.body.size >= 9, true);
  assert.equal(res.body.entries.length >= 6, true);
  assert.equal(res.body.entries.some((entry) => entry.direction === 'across'), true);
  assert.equal(res.body.entries.some((entry) => entry.direction === 'down'), true);
});

test('generateCrosswordGame retries when a candidate pool cannot be constructed', async () => {
  let attempt = 0;
  const openaiClient = {
    chat: {
      completions: {
        create: async () => {
          attempt += 1;
          return {
            choices: [{
              message: {
                content: JSON.stringify(attempt === 1 ? buildImpossibleCandidatePool() : buildValidCandidatePool()),
              },
            }],
            usage: { total_tokens: 30 + attempt },
          };
        },
      },
    },
  };

  const handler = createGenerateCrosswordHandler({
    openaiClient,
    apiKey: 'test-key',
    logger: {
      info() {},
      error() {},
    },
    fetchDevSettingsFn: async () => ({ allowAllAIGeneration: true }),
    moderateTopicInputFn: async () => ({
      flagged: false,
      flaggedCategories: [],
      moderationId: 'mod_ok',
      moderationModel: 'omni-moderation-latest',
    }),
  });

  const req = { body: { topic: 'Neon Signs' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(attempt, 2);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.size >= 9, true);
  assert.equal(res.body.entries.length >= 6, true);
});

test('generateCrosswordGame rejects suspicious generated output text', async () => {
  let attempts = 0;
  const securityLogs = [];
  const openaiClient = {
    chat: {
      completions: {
        create: async () => {
          attempts += 1;
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  ...buildValidCandidatePool(),
                  candidates: buildValidCandidatePool().candidates.map((candidate, index) => (
                    index === 0
                      ? { ...candidate, clue: 'As an AI language model' }
                      : candidate
                  )),
                }),
              },
            }],
            usage: { total_tokens: 42 },
          };
        },
      },
    },
  };

  const handler = createGenerateCrosswordHandler({
    openaiClient,
    apiKey: 'test-key',
    logger: {
      info() {},
      warn(...args) {
        securityLogs.push(args);
      },
      error() {},
    },
    fetchDevSettingsFn: async () => ({ allowAllAIGeneration: true }),
    moderateTopicInputFn: async () => ({
      flagged: false,
      flaggedCategories: [],
      moderationId: 'mod_ok',
      moderationModel: 'omni-moderation-latest',
    }),
  });

  const req = { body: { topic: 'Neon Signs' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(attempts, 3);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Sorry! The crossword failed to generate. Please try a different topic.' });
  assert.equal(securityLogs.length, 3);
  assert.equal(securityLogs[0][0], 'ai_output_security_rejected');
  assert.equal(securityLogs[0][1].route, 'crossword');
  assert.equal(securityLogs[0][1].reason, 'suspicious_text');
  assert.equal(securityLogs[0][1].context, 'crossword.candidates[0].clue');
  assert.equal(securityLogs[0][1].stage, 'raw_output');
  assert.equal(securityLogs[0][1].attempt, 1);
});

test('normalizeCrosswordCandidatePool keeps valid alphanumeric answers and skips unusable candidates', () => {
  const pool = normalizeCrosswordCandidatePool({
    topic: 'Sci-Fi',
    candidates: [
      { answer: 'R2D2', clue: 'Astromech droid', kind: 'theme' },
      { answer: 'C3PO', clue: 'Protocol droid', kind: 'theme' },
      { answer: 'BB8', clue: 'Rolling droid', kind: 'theme' },
      { answer: 'XWING', clue: 'Rebel starfighter', kind: 'theme' },
      { answer: 'JEDI', clue: 'Force user', kind: 'theme' },
      { answer: 'SABER', clue: 'Laser sword', kind: 'theme' },
      { answer: 'FALCON9', clue: 'Reusable rocket', kind: 'theme' },
      { answer: 'DUNE2', clue: 'Sci-fi sequel', kind: 'theme' },
      { answer: 'AREA51', clue: 'Secretive Nevada site', kind: 'theme' },
      { answer: 'BLADE', clue: 'Runner title word', kind: 'support' },
      { answer: 'ORBIT', clue: 'Path around a planet', kind: 'support' },
      { answer: 'LASER', clue: 'Focused beam', kind: 'support' },
      { answer: 'DRONE7', clue: 'Numbered craft', kind: 'support' },
      { answer: 'NOVA', clue: 'Sudden stellar burst', kind: 'support' },
      { answer: 'ALIEN3', clue: 'Franchise sequel', kind: 'theme' },
      { answer: 'ROBOT', clue: 'Mechanical helper', kind: 'support' },
      { answer: 'MARS', clue: 'Red planet', kind: 'support' },
      { answer: 'SATURN5', clue: 'Moon rocket', kind: 'theme' },
      { answer: 'ION', clue: 'Charged particle', kind: 'support' },
      { answer: 'Q', clue: 'Too short to use', kind: 'support' },
      { answer: 'SPACETIMECONTINUUM', clue: 'Too long to fit', kind: 'theme' },
      { answer: 'SHIP', kind: 'support' },
      { answer: 'BAD!!!', clue: 'Symbols get stripped to three letters', kind: 'support' },
    ],
  });

  assert.equal(pool.candidates.length >= 18, true);
  assert.equal(pool.candidates.some((candidate) => candidate.answer === 'R2D2'), true);
  assert.equal(pool.candidates.some((candidate) => candidate.answer === 'C3PO'), true);
  assert.equal(pool.candidates.some((candidate) => candidate.answer === 'BAD'), true);
  assert.equal(pool.candidates.some((candidate) => candidate.answer === 'Q'), false);
  assert.equal(pool.candidates.some((candidate) => candidate.answer === 'SPACETIMECONTINUUM'), false);
  assert.equal(pool.candidates.some((candidate) => candidate.answer === 'SHIP'), false);
});
