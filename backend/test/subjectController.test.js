import test from 'node:test';
import assert from 'node:assert/strict';

// Ensure required config values exist before importing modules that read env
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { createGenerateSubjectsHandler } = await import('../controllers/subjectController.js');
const { TOPIC_NOT_ALLOWED_ERROR } = await import('../services/topicModeration.js');

// Express-like response to capture status and JSON payload
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

// Mock OpenAI to return malformed JSON that will fail JSON.parse
test('generateSubjects returns 500 when OpenAI response is invalid JSON', async () => {
  const openaiClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: '{"topic":"Pokemon", BAD_JSON' } }],
          usage: { total_tokens: 10 },
        }),
      },
    },
  };

  // Capture logger.error calls to verify error-path logging
  const loggerCalls = [];
  const logger = {
    info() {},
    error(...args) {
      loggerCalls.push(args);
    },
  };

  // Create the handler with the mocked OpenAI client and logger
  const handler = createGenerateSubjectsHandler({
    openaiClient,
    apiKey: 'test-key',
    logger,
    fetchDevSettingsFn: async () => ({ allowAllAIGeneration: true }),
    moderateTopicInputFn: async () => ({
      flagged: false,
      flaggedCategories: [],
      moderationId: 'mod_ok',
      moderationModel: 'omni-moderation-latest',
    }),
  });

  // Simulate an API request with a valid topic
  const req = { body: { topic: 'Pokemon' } };
  const res = createMockRes();

  await handler(req, res);

  // Expect invalid JSON handling to return 500 and the known error payload
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'AI response was not valid JSON.' });
  // At least one error log indicates the parse failure path executed
  assert.equal(loggerCalls.length > 0, true);
});

// Test that blocked topics are rejected with a 400 error and the attempt is logged for signed-in users
test('generateSubjects rejects blocked topics and logs the attempt for signed-in users', async () => {
  let chatCalled = false;
  let loggedAttempt = null;

  const openaiClient = {
    chat: {
      completions: {
        create: async () => {
          chatCalled = true;
          return {
            choices: [{ message: { content: '{}' } }],
          };
        },
      },
    },
  };

  const handler = createGenerateSubjectsHandler({
    openaiClient,
    apiKey: 'test-key',
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    fetchDevSettingsFn: async () => ({ allowAllAIGeneration: true }),
    moderateTopicInputFn: async () => ({
      flagged: true,
      flaggedCategories: ['sexual'],
      moderationId: 'mod_blocked',
      moderationModel: 'omni-moderation-latest',
    }),
    logRejectedTopicAttemptFn: async (payload) => {
      loggedAttempt = payload;
      return true;
    },
  });

  const req = { body: { topic: 'Explicit content', auth0Id: 'auth0|player-123' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(chatCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    error: TOPIC_NOT_ALLOWED_ERROR,
    code: 'topic_not_allowed',
  });
  assert.deepEqual(loggedAttempt, {
    auth0Id: 'auth0|player-123',
    topic: 'Explicit content',
    moderationResult: {
      flagged: true,
      flaggedCategories: ['sexual'],
      moderationId: 'mod_blocked',
      moderationModel: 'omni-moderation-latest',
    },
  });
});
