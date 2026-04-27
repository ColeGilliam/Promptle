import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const {
  buildConnectionsGenerationMessages,
  createGenerateConnectionsHandler,
} = await import('../controllers/connectionsController.js');

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

function createApprovedReviewResponse() {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          acceptable: true,
          primaryIssue: 'none',
          reason: 'The board has enough overlap and no isolated answer-type group.',
        }),
      },
    }],
    usage: { total_tokens: 12 },
  };
}

function createValidBoard(label) {
  return {
    topic: `Topic ${label}`,
    groups: [
      {
        category: `Set ${label}A`,
        difficulty: 'yellow',
        words: [`A${label}`, `B${label}`, `C${label}`, `D${label}`],
        explanation: `Group ${label}A.`,
      },
      {
        category: `Set ${label}B`,
        difficulty: 'green',
        words: [`E${label}`, `F${label}`, `G${label}`, `H${label}`],
        explanation: `Group ${label}B.`,
      },
      {
        category: `Set ${label}C`,
        difficulty: 'blue',
        words: [`I${label}`, `J${label}`, `K${label}`, `L${label}`],
        explanation: `Group ${label}C.`,
      },
      {
        category: `Set ${label}D`,
        difficulty: 'purple',
        words: [`M${label}`, `N${label}`, `O${label}`, `P${label}`],
        explanation: `Group ${label}D.`,
      },
    ],
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
  assert.deepEqual(res.body, { error: 'Sorry! The Connections failed to generate. Please try again.' });
  assert.equal(loggerCalls.length > 0, true);
});

test('generateConnectionsGame normalizes a valid puzzle response', async () => {
  let generationRequestBody = null;
  let reviewCalls = 0;
  const openaiClient = {
    chat: {
      completions: {
        create: async (request) => {
          if (request.response_format?.json_schema?.name === 'connections_board_review') {
            reviewCalls += 1;
            return createApprovedReviewResponse();
          }
          generationRequestBody = request;
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  topic: 'Wrong Topic', // The controller should ignore this and use the original topic from the request.
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
          };
        },
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
  assert.equal(generationRequestBody.max_completion_tokens, 1600);
  assert.equal(generationRequestBody.response_format.type, 'json_schema');
  assert.equal(generationRequestBody.response_format.json_schema.strict, true);
  assert.equal(generationRequestBody.response_format.json_schema.schema.properties.groups.maxItems, 4);
  assert.equal(reviewCalls, 0);
  assert.match(generationRequestBody.messages[0].content, /The board should NOT be solvable just by separating words into broad classes/i);
  assert.match(generationRequestBody.messages[0].content, /Every group must feel genuinely about the topic through its actual words/i);
  assert.match(generationRequestBody.messages[0].content, /Aim to produce a strong board on the first pass/i);
  assert.match(generationRequestBody.messages[1].content, /board feel intentionally interlocked/i);
  assert.equal(res.body.topic, 'Ocean Life');
  assert.equal(res.body.groups.length, 4);
  assert.deepEqual(
    res.body.groups.map((group) => group.difficulty),
    ['yellow', 'green', 'blue', 'purple']
  );
  assert.deepEqual(res.body.groups[0].words, ['Mako', 'Hammerhead', 'Tiger', 'Thresher']);
});

test('generateConnectionsGame rejects suspicious generated output text', async () => {
  const securityLogs = [];
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
                    category: 'As an AI language model',
                    difficulty: 'yellow',
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

  const req = { body: { topic: 'Ocean Life' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Sorry! The Connections failed to generate. Please try a different topic.' });
  assert.equal(securityLogs[0][0], 'ai_output_security_rejected');
  assert.equal(securityLogs[0][1].route, 'connections');
  assert.equal(securityLogs[0][1].reason, 'suspicious_text');
  assert.equal(securityLogs[0][1].context, 'connections.raw.groups[0].category');
  assert.equal(securityLogs[0][1].stage, 'raw_output');
});

test('buildConnectionsGenerationMessages emphasizes overlap and tier progression', () => {
  const messages = buildConnectionsGenerationMessages({ topic: 'Movies' });

  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /The board should NOT be solvable just by separating words into broad classes/i);
  assert.match(messages[0].content, /Aim to produce a strong board on the first pass/i);
  assert.match(messages[1].content, /board feel intentionally interlocked/i);
});

test('generateConnectionsGame retries when review rejects an isolated answer-type group', async () => {
  const generationRequests = [];
  let reviewCount = 0;
  const openaiClient = {
    chat: {
      completions: {
        create: async (request) => {
          if (request.response_format?.json_schema?.name === 'connections_board_review') {
            reviewCount += 1;
            if (reviewCount === 1) {
              return {
                choices: [{
                  message: {
                    content: JSON.stringify({
                      acceptable: false,
                      primaryIssue: 'isolated_group',
                      reason: 'One group is too easy to isolate because it is the only set of Pokemon species names.',
                    }),
                  },
                }],
                usage: { total_tokens: 9 },
              };
            }
            return createApprovedReviewResponse();
          }

          generationRequests.push(request);
          return {
            choices: [{
              message: {
                content: JSON.stringify(createValidBoard(generationRequests.length)),
              },
            }],
            usage: { total_tokens: 42 },
          };
        },
      },
    },
  };

  const infoLogs = [];
  const handler = createGenerateConnectionsHandler({
    openaiClient,
    apiKey: 'test-key',
    logger: {
      info(...args) {
        infoLogs.push(args);
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

  const req = { body: { topic: 'Pokemon', improvedGeneration: true } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(generationRequests.length, 2);
  assert.equal(reviewCount, 2);
  assert.equal(generationRequests[1].messages.length, 2);
  assert.equal(infoLogs.some(([eventName]) => eventName === 'connections_generation_quality_rejected'), true);
});

test('generateConnectionsGame returns the last valid board when all quality reviews reject it', async () => {
  let generationIndex = 0;
  const infoLogs = [];
  const openaiClient = {
    chat: {
      completions: {
        create: async (request) => {
          if (request.response_format?.json_schema?.name === 'connections_board_review') {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    acceptable: false,
                    primaryIssue: 'isolated_group',
                    reason: 'The board is still too easy because one group has a noticeably different answer type.',
                  }),
                },
              }],
              usage: { total_tokens: 8 },
            };
          }

          generationIndex += 1;
          return {
            choices: [{
              message: {
                content: JSON.stringify(createValidBoard(generationIndex)),
              },
            }],
            usage: { total_tokens: 30 + generationIndex },
          };
        },
      },
    },
  };

  const handler = createGenerateConnectionsHandler({
    openaiClient,
    apiKey: 'test-key',
    logger: {
      info(...args) {
        infoLogs.push(args);
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

  const req = { body: { topic: 'Pokemon', improvedGeneration: true } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(generationIndex, 3);
  assert.equal(res.body.groups[0].category, 'Set 3A');
  assert.equal(infoLogs.some(([eventName]) => eventName === 'connections_generation_best_effort_returned'), true);
});
