import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const {
  SHARED_GAME_DURATION_MS,
  createCreateSharedGameHandler,
  createLoadSharedGameHandler,
} = await import('../controllers/sharedGameController.js');

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

test('createSharedGame stores shared snapshot metadata', async () => {
  let insertedDoc = null;
  const fixedNow = new Date('2026-04-25T18:00:00.000Z');
  const handler = createCreateSharedGameHandler({
    findUserFn: async () => ({ _id: 'user-1', auth0Id: 'auth0|player-1' }),
    insertSharedGameFn: async (doc) => {
      insertedDoc = doc;
      return { acknowledged: true };
    },
    createShareCodeFn: () => 'abc123de',
    nowFn: () => fixedNow,
    logger: { error() {} },
  });

  const req = {
    body: {
      auth0Id: ' auth0|player-1 ',
      gameType: 'promptle',
      payload: {
        topic: 'Space Movies',
        answers: [{ name: 'Alien' }],
        correctAnswer: { name: 'Alien' },
      },
    },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body?.shareCode, 'ABC123DE');
  assert.equal(res.body?.gameType, 'promptle');
  assert.equal(insertedDoc?._id, 'ABC123DE');
  assert.equal(insertedDoc?.auth0Id, 'auth0|player-1');
  assert.equal(insertedDoc?.gameType, 'promptle');
  assert.deepEqual(insertedDoc?.payload, req.body.payload);
  assert.equal(insertedDoc?.createdAt, fixedNow);
  assert.equal(insertedDoc?.expiresAt.getTime(), fixedNow.getTime() + SHARED_GAME_DURATION_MS);
});

test('createSharedGame requires a signed-in user', async () => {
  const handler = createCreateSharedGameHandler({
    findUserFn: async () => ({ _id: 'user-1' }),
    insertSharedGameFn: async () => {
      throw new Error('should not insert');
    },
    logger: { error() {} },
  });

  const req = {
    body: {
      auth0Id: '',
      gameType: 'promptle',
      payload: {
        topic: 'Space Movies',
        answers: [{ name: 'Alien' }],
        correctAnswer: { name: 'Alien' },
      },
    },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Sign in to share a game.' });
});

test('loadSharedGame returns stored payload for matching game type', async () => {
  const sharedGame = {
    _id: 'ABC123DE',
    gameType: 'connections',
    expiresAt: new Date('2026-04-28T18:00:00.000Z'),
    createdAt: new Date('2026-04-25T18:00:00.000Z'),
    payload: {
      topic: 'Greek Mythology',
      groups: [{ category: 'Olympians', difficulty: 'yellow', words: ['HERA', 'ARES', 'APOLLO', 'ARTEMIS'] }],
    },
  };
  const handler = createLoadSharedGameHandler({
    findSharedGameFn: async () => sharedGame,
    deleteSharedGameFn: async () => ({ deletedCount: 0 }),
    nowFn: () => new Date('2026-04-26T18:00:00.000Z'),
    logger: { error() {} },
  });

  const req = {
    params: { shareCode: 'abc123de' },
    query: { gameType: 'connections' },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.shareCode, 'ABC123DE');
  assert.equal(res.body?.gameType, 'connections');
  assert.deepEqual(res.body?.payload, sharedGame.payload);
});

test('loadSharedGame returns 410 when the snapshot has expired', async () => {
  let deletedCode = null;
  const handler = createLoadSharedGameHandler({
    findSharedGameFn: async () => ({
      _id: 'ABC123DE',
      gameType: 'crossword',
      expiresAt: new Date('2026-04-25T18:00:00.000Z'),
      payload: {
        topic: 'Space',
        size: 7,
        entries: [{ row: 0, col: 0, direction: 'across', answer: 'MARS', clue: 'Red planet' }],
      },
    }),
    deleteSharedGameFn: async (shareCode) => {
      deletedCode = shareCode;
      return { deletedCount: 1 };
    },
    nowFn: () => new Date('2026-04-25T18:00:01.000Z'),
    logger: { error() {} },
  });

  const req = {
    params: { shareCode: 'ABC123DE' },
    query: { gameType: 'crossword' },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 410);
  assert.deepEqual(res.body, { error: 'This shared game has expired.' });
  assert.equal(deletedCode, 'ABC123DE');
});
