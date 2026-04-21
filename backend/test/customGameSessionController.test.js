import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const {
  createFinalizeCustomGameSessionHandler,
  createMarkCustomGameSessionInteractedHandler,
  createStartCustomGameSessionHandler,
} = await import('../controllers/customGameSessionController.js');

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

test('startCustomGameSession stores normalized session metadata', async () => {
  let upsertPayload = null;
  const handler = createStartCustomGameSessionHandler({
    upsertSessionFn: async (payload) => {
      upsertPayload = payload;
      return { acknowledged: true };
    },
    logger: { info() {}, error() {} },
  });

  const req = {
    body: {
      playId: ' play-123 ',
      auth0Id: ' auth0|player-1 ',
      topic: '  Space Movies ',
      gameType: 'Promptle',
    },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(upsertPayload?.playId, 'play-123');
  assert.equal(upsertPayload?.auth0Id, 'auth0|player-1');
  assert.equal(upsertPayload?.topic, 'Space Movies');
  assert.equal(upsertPayload?.topicKey, 'space movie');
  assert.equal(upsertPayload?.gameType, 'promptle');
  assert.equal(upsertPayload?.startedAt instanceof Date, true);
});

test('markCustomGameSessionInteracted updates matching session once', async () => {
  let interactedPayload = null;
  const handler = createMarkCustomGameSessionInteractedHandler({
    markInteractedFn: async (payload) => {
      interactedPayload = payload;
      return { acknowledged: true };
    },
    logger: { info() {}, error() {} },
  });

  const req = {
    body: {
      playId: 'play-123',
      auth0Id: 'auth0|player-1',
    },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.deepEqual(interactedPayload, {
    playId: 'play-123',
    auth0Id: 'auth0|player-1',
  });
});

test('finalizeCustomGameSession stores completed once per playId', async () => {
  let finalizePayload = null;
  const handler = createFinalizeCustomGameSessionHandler({
    findSessionFn: async () => ({
      playId: 'play-123',
      auth0Id: 'auth0|player-1',
      hasInteraction: true,
    }),
    finalizeSessionFn: async (payload) => {
      finalizePayload = payload;
      return { acknowledged: true };
    },
    logger: { info() {}, error() {} },
  });

  const req = {
    body: {
      playId: 'play-123',
      auth0Id: 'auth0|player-1',
      finalState: 'completed',
    },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(finalizePayload?.playId, 'play-123');
  assert.equal(finalizePayload?.auth0Id, 'auth0|player-1');
  assert.equal(finalizePayload?.finalState, 'completed');
  assert.equal(finalizePayload?.finalizedAt instanceof Date, true);
});

test('finalizeCustomGameSession rejects abandoned when no interaction happened', async () => {
  const handler = createFinalizeCustomGameSessionHandler({
    findSessionFn: async () => ({
      playId: 'play-123',
      auth0Id: 'auth0|player-1',
      hasInteraction: false,
    }),
    finalizeSessionFn: async () => {
      throw new Error('should not finalize');
    },
    logger: { info() {}, error() {} },
  });

  const req = {
    body: {
      playId: 'play-123',
      auth0Id: 'auth0|player-1',
      finalState: 'abandoned',
    },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    error: 'Cannot mark a custom game as abandoned before interaction.',
  });
});
