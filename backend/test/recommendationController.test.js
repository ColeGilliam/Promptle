import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { createGetRecommendationsHandler } = await import('../controllers/recommendationController.js');

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

test('getRecommendations suggests unseen custom topics from other users first', async () => {
  const handler = createGetRecommendationsHandler({
    findAllFeedbackFn: async () => ([
      { auth0Id: 'auth0|player-1', topic: 'Pokemon', liked: true, createdAt: new Date('2026-04-20T10:00:00Z') },
      { auth0Id: 'auth0|player-1', topic: 'Basketball', liked: false, createdAt: new Date('2026-04-18T10:00:00Z') },
      { auth0Id: 'auth0|player-2', topic: 'Pokemon', liked: true, createdAt: new Date('2026-04-20T09:00:00Z') },
      { auth0Id: 'auth0|player-2', topic: 'Mario', liked: true, createdAt: new Date('2026-04-20T08:00:00Z') },
      { auth0Id: 'auth0|player-3', topic: 'Pokemon', liked: true, createdAt: new Date('2026-04-19T09:00:00Z') },
      { auth0Id: 'auth0|player-3', topic: 'Mario', liked: true, createdAt: new Date('2026-04-19T08:00:00Z') },
      { auth0Id: 'auth0|player-4', topic: 'Nintendo Games', liked: true, createdAt: new Date('2026-04-19T07:00:00Z') },
      { auth0Id: 'auth0|player-4', topic: 'Zelda', liked: true, createdAt: new Date('2026-04-19T06:00:00Z') },
      { auth0Id: 'auth0|player-5', topic: 'Nintendo Games', liked: true, createdAt: new Date('2026-04-18T07:00:00Z') },
      { auth0Id: 'auth0|player-5', topic: 'Zelda', liked: true, createdAt: new Date('2026-04-18T06:00:00Z') },
    ]),
    findAllSessionsFn: async () => ([
      { auth0Id: 'auth0|player-1', topic: 'Nintendo Games', finalState: 'completed', finalizedAt: new Date('2026-04-19T10:00:00Z') },
      { auth0Id: 'auth0|player-1', topic: 'Basketball', finalState: 'abandoned', finalizedAt: new Date('2026-04-17T10:00:00Z') },
    ]),
    findTopicsFn: async () => ([
      { topicId: 2, topicName: 'Pokemon Regions' },
      { topicId: 3, topicName: 'Nintendo Characters' },
      { topicId: 4, topicName: 'Classic Movies' },
    ]),
    logger: { error() {} },
  });

  const req = { params: { auth0Id: 'auth0|player-1' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    items: [
      { type: 'custom', topic: 'Mario', reason: 'liked_topic' },
      { type: 'custom', topic: 'Zelda', reason: 'completed_topic' },
      { type: 'popular', topic: 'Pokemon Regions', topicId: 2, reason: 'popular_fallback' },
      { type: 'popular', topic: 'Nintendo Characters', topicId: 3, reason: 'popular_fallback' },
      { type: 'popular', topic: 'Classic Movies', topicId: 4, reason: 'popular_fallback' },
    ],
  });
});

test('getRecommendations falls back to trending custom topics when the target user has no positive signal', async () => {
  const handler = createGetRecommendationsHandler({
    findAllFeedbackFn: async () => ([
      { auth0Id: 'auth0|player-2', topic: 'Pokemon', liked: true, createdAt: new Date('2026-04-20T10:00:00Z') },
      { auth0Id: 'auth0|player-3', topic: 'Mario', liked: true, createdAt: new Date('2026-04-19T10:00:00Z') },
      { auth0Id: 'auth0|player-4', topic: 'Zelda', liked: true, createdAt: new Date('2026-04-18T10:00:00Z') },
    ]),
    findAllSessionsFn: async () => [],
    findTopicsFn: async () => [{ topicId: 1, topicName: 'Movies' }],
    logger: { error() {} },
    nowFn: () => new Date('2026-04-21T10:00:00Z').getTime(),
  });

  const req = { params: { auth0Id: 'auth0|player-1' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    items: [
      { type: 'custom', topic: 'Mario', reason: 'trending_custom' },
      { type: 'custom', topic: 'Pokemon', reason: 'trending_custom' },
      { type: 'custom', topic: 'Zelda', reason: 'trending_custom' },
    ],
  });
});

test('getRecommendations excludes stale topics from trending custom fallback', async () => {
  const handler = createGetRecommendationsHandler({
    findAllFeedbackFn: async () => ([
      { auth0Id: 'auth0|player-2', topic: 'Pokemon', liked: true, createdAt: new Date('2026-04-20T10:00:00Z') },
      { auth0Id: 'auth0|player-3', topic: 'Mario', liked: true, createdAt: new Date('2026-04-19T10:00:00Z') },
      { auth0Id: 'auth0|player-4', topic: 'Old Movies', liked: true, createdAt: new Date('2025-11-01T10:00:00Z') },
    ]),
    findAllSessionsFn: async () => [],
    findTopicsFn: async () => [],
    logger: { error() {} },
    nowFn: () => new Date('2026-04-21T10:00:00Z').getTime(),
  });

  const req = { params: { auth0Id: 'auth0|player-1' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    items: [
      { type: 'custom', topic: 'Mario', reason: 'trending_custom' },
      { type: 'custom', topic: 'Pokemon', reason: 'trending_custom' },
    ],
  });
});
