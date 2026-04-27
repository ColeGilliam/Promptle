const DEFAULT_AI_GENERATION_WINDOW_MS = 60 * 1000;
const DEFAULT_AI_GENERATION_MAX_REQUESTS = 6;
const DEFAULT_MAX_TRACKED_KEYS = 10000;
const DEFAULT_LIMIT_ERROR_MESSAGE = 'Too many generation requests. Please wait a moment and try again.';
const DEFAULT_LIMIT_ERROR_CODE = 'too_many_generation_requests';

function getRequestIp(req) {
  return req.ip || 'unknown';
}

function pruneExpiredEntries(store, cutoff) {
  for (const [key, timestamps] of store.entries()) {
    const activeTimestamps = timestamps.filter((timestamp) => timestamp > cutoff);
    if (activeTimestamps.length) {
      store.set(key, activeTimestamps);
    } else {
      store.delete(key);
    }
  }
}

export function createBurstRateLimiter({
  windowMs = DEFAULT_AI_GENERATION_WINDOW_MS,
  maxRequests = DEFAULT_AI_GENERATION_MAX_REQUESTS,
  maxTrackedKeys = DEFAULT_MAX_TRACKED_KEYS,
  keyGenerator = getRequestIp,
  shouldLimit = () => true,
  errorMessage = DEFAULT_LIMIT_ERROR_MESSAGE,
  errorCode = DEFAULT_LIMIT_ERROR_CODE,
  now = () => Date.now(),
  store = new Map(),
} = {}) {
  return function burstRateLimiter(req, res, next) {
    if (!shouldLimit(req)) {
      return next();
    }

    const nowMs = now();
    const cutoff = nowMs - windowMs;
    const key = String(keyGenerator(req) || 'unknown');
    const previousTimestamps = store.get(key) || [];
    const activeTimestamps = previousTimestamps.filter((timestamp) => timestamp > cutoff);

    if (activeTimestamps.length >= maxRequests) {
      const resetMs = activeTimestamps[0] + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - nowMs) / 1000));

      res.set('Retry-After', String(retryAfterSeconds));
      res.set('RateLimit-Limit', String(maxRequests));
      res.set('RateLimit-Remaining', '0');
      res.set('RateLimit-Reset', String(Math.ceil(resetMs / 1000)));

      return res.status(429).json({
        error: errorMessage,
        code: errorCode,
      });
    }

    activeTimestamps.push(nowMs);
    store.set(key, activeTimestamps);

    if (store.size > maxTrackedKeys) {
      pruneExpiredEntries(store, cutoff);
      if (store.size > maxTrackedKeys) {
        const oldestKey = store.keys().next().value;
        if (oldestKey) store.delete(oldestKey);
      }
    }

    res.set('RateLimit-Limit', String(maxRequests));
    res.set('RateLimit-Remaining', String(Math.max(0, maxRequests - activeTimestamps.length)));
    res.set('RateLimit-Reset', String(Math.ceil((activeTimestamps[0] + windowMs) / 1000)));

    return next();
  };
}

const aiGenerationRateLimitStore = new Map();

export const aiGenerationBurstLimiter = createBurstRateLimiter({
  store: aiGenerationRateLimitStore,
  errorMessage: 'Too many generation requests. Please wait a moment and try again.',
  errorCode: 'too_many_generation_requests',
});

export const topicAiGenerationBurstLimiter = createBurstRateLimiter({
  store: aiGenerationRateLimitStore,
  errorMessage: 'Too many generation requests. Please wait a moment and try again.',
  errorCode: 'too_many_generation_requests',
  shouldLimit: (req) => {
    const topic = req.body?.topic;
    return typeof topic === 'string' && Boolean(topic.trim());
  },
});

const sharedGameRateLimitStore = new Map();

export const sharedGameCreationBurstLimiter = createBurstRateLimiter({
  store: sharedGameRateLimitStore,
  windowMs: 60 * 1000,
  maxRequests: 2,
  keyGenerator: (req) => {
    const auth0Id = typeof req.body?.auth0Id === 'string' ? req.body.auth0Id.trim() : '';
    return auth0Id || getRequestIp(req);
  },
  shouldLimit: (req) => {
    const gameType = req.body?.gameType;
    const payload = req.body?.payload;
    return typeof gameType === 'string' && Boolean(gameType.trim()) && !!payload;
  },
  errorMessage: 'Too many share links created. Please wait before creating another one.',
  errorCode: 'too_many_share_links',
});
