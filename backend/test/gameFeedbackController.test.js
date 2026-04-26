import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { createSaveGameFeedbackHandler } = await import('../controllers/gameFeedbackController.js');

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

test('saveGameFeedback stores normalized custom game feedback', async () => {
  let insertedDoc = null;
  const handler = createSaveGameFeedbackHandler({
    insertFeedbackFn: async (doc) => {
      insertedDoc = doc;
      return { acknowledged: true };
    },
    logger: {
      info() {},
      error() {},
    },
  });

  const req = {
    body: {
      auth0Id: ' auth0|player-123 ',
      topic: '  Action Movies  ',
      liked: true,
      gameType: 'Connections',
      result: 'won',
    },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(insertedDoc?.auth0Id, 'auth0|player-123');
  assert.equal(insertedDoc?.topic, 'Action Movies');
  assert.equal(insertedDoc?.topicKey, 'action movie');
  assert.equal(insertedDoc?.liked, true);
  assert.equal(insertedDoc?.gameType, 'connections');
  assert.equal(insertedDoc?.result, 'won');
  assert.equal(Object.hasOwn(insertedDoc ?? {}, 'source'), false);
  assert.equal(insertedDoc?.createdAt instanceof Date, true);
});

test('saveGameFeedback rejects invalid liked payloads', async () => {
  const handler = createSaveGameFeedbackHandler({
    insertFeedbackFn: async () => {
      throw new Error('should not insert');
    },
    logger: {
      info() {},
      error() {},
    },
  });

  const req = {
    body: {
      topic: 'Pokemon',
      liked: 'yes',
      gameType: 'promptle',
    },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Please provide whether the player liked the game.' });
});

test('saveGameFeedback returns 500 when persistence fails', async () => {
  const handler = createSaveGameFeedbackHandler({
    insertFeedbackFn: async () => {
      throw new Error('db down');
    },
    logger: {
      info() {},
      error() {},
    },
  });

  const req = {
    body: {
      topic: 'Marvel Rivals',
      liked: false,
      gameType: 'crossword',
      result: 'revealed',
    },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Failed to save game feedback.' });
});
