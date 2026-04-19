import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { createGenerateConnectionsHandler } = await import('../controllers/connectionsController.js');

function createMockRes() {
  // Minimal Express-like response stub for controller unit tests.
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

test('generateConnectionsGame returns 500 when OpenAI response is invalid JSON', async () => {
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
  const handler = createGenerateConnectionsHandler({
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
  assert.deepEqual(res.body, { error: 'AI response was not valid JSON.' });
  assert.equal(loggerCalls.length > 0, true);
});

test('generateConnectionsGame normalizes a valid puzzle response', async () => {
  const openaiClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                topic: 'Ocean Life',
                groups: [
                  {
                    category: 'Kinds of sharks',
                    words: ['Mako', 'Hammerhead', 'Tiger', 'Thresher'],
                    explanation: 'Each entry names a species of shark.',
                  },
                  {
                    category: 'Words after sea',
                    difficulty: 'green',
                    words: ['Breeze', 'Glass', 'Horse', 'Salt'],
                    explanation: 'Each forms a common phrase beginning with "sea".',
                  },
                  {
                    category: 'Things with shells',
                    difficulty: 'blue',
                    words: ['Clam', 'Nautilus', 'Turtle', 'Taco'],
                    explanation: 'Each is commonly described as having a shell.',
                  },
                  {
                    category: 'Can be rolled',
                    difficulty: 'purple',
                    words: ['Wave', 'Dice', 'Sleeve', 'Sushi'],
                    explanation: 'Each can be rolled in a distinct sense.',
                  },
                ],
              }),
            },
          }],
          usage: { total_tokens: 42 },
        }),
      },
    },
  };

  const handler = createGenerateConnectionsHandler({
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

  const req = { body: { topic: 'Ocean Life' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.topic, 'Ocean Life');
  assert.equal(res.body.groups.length, 4);
  assert.deepEqual(
    res.body.groups.map((group) => group.difficulty),
    ['yellow', 'green', 'blue', 'purple']
  );
  assert.deepEqual(res.body.groups[0].words, ['Mako', 'Hammerhead', 'Tiger', 'Thresher']);
});
