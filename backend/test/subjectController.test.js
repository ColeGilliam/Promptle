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

test('generateSubjects uses a single gpt-5.4-mini request with reusable-category instructions', async () => {
  let requestBody = null;
  let callCount = 0;
  const payload = createPayload({
    columns: [
      { header: 'Subject', kind: 'text' },
      { header: 'Publisher', kind: 'text' },
      { header: 'Alignment', kind: 'text' },
      { header: 'Team', kind: 'text' },
      { header: 'Power Family', kind: 'set' },
      { header: 'Origin', kind: 'text' },
    ],
    answers: [
      subjectAnswer('Superman', ['DC', 'Hero', 'Justice League', setItems(['Flight', 'Strength']), 'Earth']),
      subjectAnswer('Batman', ['DC', 'Hero', 'Justice League', setItems(['Intellect', 'Stealth']), 'Earth']),
      subjectAnswer('Wonder Woman', ['DC', 'Hero', 'Justice League', setItems(['Strength', 'Combat']), 'Themyscira']),
      subjectAnswer('Spider-Man', ['Marvel', 'Hero', 'Avengers', setItems(['Agility', 'Strength']), 'Earth']),
      subjectAnswer('Iron Man', ['Marvel', 'Hero', 'Avengers', setItems(['Flight', 'Intellect']), 'Earth']),
      subjectAnswer('Loki', ['Marvel', 'Antihero', 'Asgard', setItems(['Magic', 'Illusion']), 'Asgard']),
      subjectAnswer('Thor', ['Marvel', 'Hero', 'Avengers', setItems(['Flight', 'Strength']), 'Asgard']),
      subjectAnswer('Captain America', ['Marvel', 'Hero', 'Avengers', setItems(['Strength', 'Combat']), 'Earth']),
      subjectAnswer('Hulk', ['Marvel', 'Hero', 'Avengers', setItems(['Strength', 'Durability']), 'Earth']),
      subjectAnswer('Flash', ['DC', 'Hero', 'Justice League', setItems(['Speed', 'Agility']), 'Earth']),
      subjectAnswer('Aquaman', ['DC', 'Hero', 'Justice League', setItems(['Strength', 'Water']), 'Atlantis']),
      subjectAnswer('Black Panther', ['Marvel', 'Hero', 'Avengers', setItems(['Agility', 'Combat']), 'Wakanda']),
    ],
  });

  const openaiClient = {
    chat: {
      completions: {
        create: async (request) => {
          requestBody = request;
          callCount += 1;
          return {
            choices: [{ message: { content: JSON.stringify(payload) } }],
            usage: { total_tokens: 42 },
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
      debug() {},
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

  const req = { body: { topic: 'Comic characters', minCategories: 999, maxCategories: -5 } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(callCount, 1);
  assert.equal(requestBody.model, 'gpt-5.4-mini');
  assert.equal(requestBody.temperature, 0.2);
  assert.match(requestBody.messages[0].content, /Keep the category set compact and high quality/i);
  assert.match(requestBody.messages[0].content, /Prefer fewer strong categories over filler/i);
  assert.match(requestBody.messages[0].content, /If a category naturally supports multiple reusable traits.*use kind "set"/i);
  assert.match(requestBody.messages[0].content, /Subject count must be 12-100/i);
  assert.match(requestBody.messages[1].content, /Aim for at least 50 subjects if the topic supports it/i);
  assert.match(requestBody.messages[1].content, /Min categories: 5/i);
  assert.match(requestBody.messages[1].content, /Max categories: 6/i);
});

test('generateSubjects returns structurally valid model output without backend header filtering', async () => {
  let callCount = 0;
  const payload = createPayload({
    columns: [
      { header: 'Subject', kind: 'text' },
      { header: 'Real Name', kind: 'text' },
      { header: 'Publisher', kind: 'text' },
      { header: 'Alignment', kind: 'text' },
      { header: 'Team', kind: 'text' },
      { header: 'Powers', kind: 'set' },
    ],
    answers: [
      subjectAnswer('Superman', ['Clark Kent', 'DC', 'Hero', 'Justice League', setItems(['Flight', 'Strength'])]),
      subjectAnswer('Batman', ['Bruce Wayne', 'DC', 'Hero', 'Justice League', setItems(['Intellect', 'Stealth'])]),
      subjectAnswer('Wonder Woman', ['Diana Prince', 'DC', 'Hero', 'Justice League', setItems(['Strength', 'Combat'])]),
      subjectAnswer('Spider-Man', ['Peter Parker', 'Marvel', 'Hero', 'Avengers', setItems(['Agility', 'Strength'])]),
      subjectAnswer('Iron Man', ['Tony Stark', 'Marvel', 'Hero', 'Avengers', setItems(['Flight', 'Intellect'])]),
      subjectAnswer('Loki', ['Loki Laufeyson', 'Marvel', 'Antihero', 'Asgard', setItems(['Magic', 'Illusion'])]),
      subjectAnswer('Thor', ['Thor Odinson', 'Marvel', 'Hero', 'Avengers', setItems(['Flight', 'Strength'])]),
      subjectAnswer('Captain America', ['Steve Rogers', 'Marvel', 'Hero', 'Avengers', setItems(['Strength', 'Combat'])]),
      subjectAnswer('Hulk', ['Bruce Banner', 'Marvel', 'Hero', 'Avengers', setItems(['Strength', 'Durability'])]),
      subjectAnswer('Flash', ['Barry Allen', 'DC', 'Hero', 'Justice League', setItems(['Speed', 'Agility'])]),
      subjectAnswer('Aquaman', ['Arthur Curry', 'DC', 'Hero', 'Justice League', setItems(['Strength', 'Water'])]),
      subjectAnswer('Black Panther', ['T Challa', 'Marvel', 'Hero', 'Avengers', setItems(['Agility', 'Combat'])]),
    ],
  });

  const openaiClient = {
    chat: {
      completions: {
        create: async () => {
          callCount += 1;
          return {
            choices: [{ message: { content: JSON.stringify(payload) } }],
            usage: { total_tokens: 42 },
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
      debug() {},
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

  const req = { body: { topic: 'Comic characters' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(callCount, 1);
  assert.equal(res.body.headers.includes('Real Name'), true);
  assert.equal(res.body.answers.every((answer) => answer.cells.length === 6), true);
});

test('generateSubjects logs suspicious headers without rejecting the payload', async () => {
  const warnCalls = [];
  const payload = createPayload({
    columns: [
      { header: 'Subject', kind: 'text' },
      { header: 'Main Trait', kind: 'text' },
      { header: 'Publisher', kind: 'text' },
      { header: 'Alignment', kind: 'text' },
      { header: 'Team', kind: 'text' },
      { header: 'Powers', kind: 'set' },
    ],
    answers: [
      subjectAnswer('Superman', ['Strength', 'DC', 'Hero', 'Justice League', setItems(['Flight', 'Strength'])]),
      subjectAnswer('Batman', ['Stealth', 'DC', 'Hero', 'Justice League', setItems(['Intellect', 'Stealth'])]),
      subjectAnswer('Wonder Woman', ['Combat', 'DC', 'Hero', 'Justice League', setItems(['Strength', 'Combat'])]),
      subjectAnswer('Spider-Man', ['Agility', 'Marvel', 'Hero', 'Avengers', setItems(['Agility', 'Strength'])]),
      subjectAnswer('Iron Man', ['Flight', 'Marvel', 'Hero', 'Avengers', setItems(['Flight', 'Intellect'])]),
      subjectAnswer('Loki', ['Magic', 'Marvel', 'Antihero', 'Asgard', setItems(['Magic', 'Illusion'])]),
      subjectAnswer('Thor', ['Strength', 'Marvel', 'Hero', 'Avengers', setItems(['Flight', 'Strength'])]),
      subjectAnswer('Captain America', ['Combat', 'Marvel', 'Hero', 'Avengers', setItems(['Strength', 'Combat'])]),
      subjectAnswer('Hulk', ['Strength', 'Marvel', 'Hero', 'Avengers', setItems(['Strength', 'Durability'])]),
      subjectAnswer('Flash', ['Speed', 'DC', 'Hero', 'Justice League', setItems(['Speed', 'Agility'])]),
      subjectAnswer('Aquaman', ['Water', 'DC', 'Hero', 'Justice League', setItems(['Strength', 'Water'])]),
      subjectAnswer('Black Panther', ['Agility', 'Marvel', 'Hero', 'Avengers', setItems(['Agility', 'Combat'])]),
    ],
  });

  const openaiClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: JSON.stringify(payload) } }],
          usage: { total_tokens: 42 },
        }),
      },
    },
  };

  const handler = createGenerateSubjectsHandler({
    openaiClient,
    apiKey: 'test-key',
    logger: {
      info() {},
      debug() {},
      warn(...args) {
        warnCalls.push(args);
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

  const req = { body: { topic: 'Comic characters' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(warnCalls.length, 1);
  assert.equal(warnCalls[0][0], 'subject_generation_suspicious_headers');
  assert.deepEqual(warnCalls[0][1].suspiciousHeaders, ['Main Trait']);
});

function createPayload({ topic = 'Comic characters', columns, answers }) {
  return { topic, columns, answers };
}

function subjectAnswer(name, cells) {
  return {
    name,
    cells: [
      textValue(name),
      ...cells.map((cell) => normalizeCellInput(cell)),
    ],
  };
}

function textValue(display) {
  return {
    display,
    parts: {
      tokens: String(display).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    },
  };
}

function setItems(items) {
  return {
    display: items.join(', '),
    items,
  };
}

function normalizeCellInput(cell) {
  if (typeof cell === 'string') return textValue(cell);
  return cell;
}
