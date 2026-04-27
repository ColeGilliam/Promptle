import test from 'node:test';
import assert from 'node:assert/strict';

const { createBurstRateLimiter } = await import('../middleware/rateLimit.js');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    set(name, value) {
      this.headers[name] = String(value);
      return this;
    },
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

test('burst limiter rejects rapid requests from the same key', () => {
  let currentTime = 1000;
  let nextCalls = 0;
  const limiter = createBurstRateLimiter({
    windowMs: 1000,
    maxRequests: 2,
    keyGenerator: (req) => req.ip,
    now: () => currentTime,
  });

  const req = { ip: '203.0.113.10' };

  const firstRes = createMockRes();
  limiter(req, firstRes, () => { nextCalls += 1; });
  assert.equal(firstRes.statusCode, 200);

  const secondRes = createMockRes();
  limiter(req, secondRes, () => { nextCalls += 1; });
  assert.equal(secondRes.statusCode, 200);

  const blockedRes = createMockRes();
  limiter(req, blockedRes, () => { nextCalls += 1; });
  assert.equal(blockedRes.statusCode, 429);
  assert.equal(blockedRes.body.code, 'too_many_generation_requests');
  assert.equal(blockedRes.headers['Retry-After'], '1');
  assert.equal(nextCalls, 2);

  currentTime = 2001;
  const laterRes = createMockRes();
  limiter(req, laterRes, () => { nextCalls += 1; });
  assert.equal(laterRes.statusCode, 200);
  assert.equal(nextCalls, 3);
});

test('burst limiter can skip requests that do not trigger AI generation', () => {
  let nextCalls = 0;
  const limiter = createBurstRateLimiter({
    windowMs: 1000,
    maxRequests: 1,
    keyGenerator: (req) => req.ip,
    shouldLimit: (req) => Boolean(req.body?.topic),
    now: () => 1000,
  });

  const roomOnlyReq = { ip: '203.0.113.20', body: {} };
  const roomOnlyRes = createMockRes();
  limiter(roomOnlyReq, roomOnlyRes, () => { nextCalls += 1; });
  assert.equal(roomOnlyRes.statusCode, 200);

  const generationReq = { ip: '203.0.113.20', body: { topic: 'Pokemon' } };
  const firstGenerationRes = createMockRes();
  limiter(generationReq, firstGenerationRes, () => { nextCalls += 1; });
  assert.equal(firstGenerationRes.statusCode, 200);

  const blockedGenerationRes = createMockRes();
  limiter(generationReq, blockedGenerationRes, () => { nextCalls += 1; });
  assert.equal(blockedGenerationRes.statusCode, 429);
  assert.equal(nextCalls, 2);
});

test('burst limiter supports custom error payloads and custom keys', () => {
  let currentTime = 5000;
  let nextCalls = 0;
  const limiter = createBurstRateLimiter({
    windowMs: 60_000,
    maxRequests: 1,
    keyGenerator: (req) => req.body?.auth0Id,
    errorMessage: 'Too many share links created. Please wait before creating another one.',
    errorCode: 'too_many_share_links',
    now: () => currentTime,
  });

  const req = {
    body: {
      auth0Id: 'auth0|player-1',
      gameType: 'promptle',
      payload: { topic: 'Space Movies' },
    },
  };

  const firstRes = createMockRes();
  limiter(req, firstRes, () => { nextCalls += 1; });
  assert.equal(firstRes.statusCode, 200);

  const blockedRes = createMockRes();
  limiter(req, blockedRes, () => { nextCalls += 1; });
  assert.equal(blockedRes.statusCode, 429);
  assert.deepEqual(blockedRes.body, {
    error: 'Too many share links created. Please wait before creating another one.',
    code: 'too_many_share_links',
  });
  assert.equal(nextCalls, 1);

  currentTime += 60_001;
  const laterRes = createMockRes();
  limiter(req, laterRes, () => { nextCalls += 1; });
  assert.equal(laterRes.statusCode, 200);
  assert.equal(nextCalls, 2);
});
