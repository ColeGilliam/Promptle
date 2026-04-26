import { getCustomGameSessionsCollection } from '../config/db.js';
import { appLogger } from '../lib/logger.js';
import { normalizeTopicKey } from '../services/topicNormalization.js';

const ALLOWED_GAME_TYPES = new Set(['promptle', 'connections', 'crossword']);
const ALLOWED_FINAL_STATES = new Set(['completed', 'abandoned']);
const sessionLogger = appLogger.child({ component: 'custom-game-session' });

let cachedCustomGameSessionsCollection = null;

function getCachedCustomGameSessionsCollection() {
  if (!cachedCustomGameSessionsCollection) {
    cachedCustomGameSessionsCollection = getCustomGameSessionsCollection();
  }
  return cachedCustomGameSessionsCollection;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePayload(body = {}) {
  const playId = normalizeOptionalString(body.playId);
  const auth0Id = normalizeOptionalString(body.auth0Id);
  const topic = normalizeOptionalString(body.topic);
  const gameType = normalizeOptionalString(body.gameType).toLowerCase();
  const finalState = normalizeOptionalString(body.finalState).toLowerCase();

  return {
    playId,
    auth0Id,
    topic,
    topicKey: normalizeTopicKey(topic),
    gameType,
    finalState,
  };
}

export function createStartCustomGameSessionHandler({
  upsertSessionFn = async ({ playId, auth0Id, topic, topicKey, gameType, startedAt }) =>
    getCachedCustomGameSessionsCollection().updateOne(
      { playId },
      {
        $setOnInsert: {
          playId,
          auth0Id,
          topic,
          topicKey,
          gameType,
          startedAt,
          hasInteraction: false,
        },
      },
      { upsert: true }
    ),
  logger = sessionLogger,
} = {}) {
  return async function startCustomGameSession(req, res) {
    const { playId, auth0Id, topic, topicKey, gameType } = normalizePayload(req.body);

    if (!playId) {
      return res.status(400).json({ error: 'Please provide a playId in the request body.' });
    }

    if (!auth0Id) {
      return res.status(400).json({ error: 'Please provide an auth0Id in the request body.' });
    }

    if (!topic) {
      return res.status(400).json({ error: 'Please provide a topic in the request body.' });
    }

    if (!ALLOWED_GAME_TYPES.has(gameType)) {
      return res.status(400).json({ error: 'Please provide a valid game type.' });
    }

    try {
      await upsertSessionFn({
        playId,
        auth0Id,
        topic,
        topicKey,
        gameType,
        startedAt: new Date(),
      });

      logger.info?.('custom_game_session_started', {
        requestId: req.id || null,
        playId,
        auth0Id,
        topic,
        gameType,
      });

      return res.json({ success: true });
    } catch (error) {
      logger.error('custom_game_session_start_failed', {
        requestId: req.id || null,
        playId,
        auth0Id,
        topic,
        gameType,
        error,
      });
      return res.status(500).json({ error: 'Failed to start custom game session.' });
    }
  };
}

export function createMarkCustomGameSessionInteractedHandler({
  markInteractedFn = async ({ playId, auth0Id }) =>
    getCachedCustomGameSessionsCollection().updateOne(
      { playId, auth0Id, finalState: { $exists: false } },
      { $set: { hasInteraction: true } }
    ),
  logger = sessionLogger,
} = {}) {
  return async function markCustomGameSessionInteracted(req, res) {
    const { playId, auth0Id } = normalizePayload(req.body);

    if (!playId) {
      return res.status(400).json({ error: 'Please provide a playId in the request body.' });
    }

    if (!auth0Id) {
      return res.status(400).json({ error: 'Please provide an auth0Id in the request body.' });
    }

    try {
      await markInteractedFn({ playId, auth0Id });

      logger.info?.('custom_game_session_marked_interacted', {
        requestId: req.id || null,
        playId,
        auth0Id,
      });

      return res.json({ success: true });
    } catch (error) {
      logger.error('custom_game_session_mark_interacted_failed', {
        requestId: req.id || null,
        playId,
        auth0Id,
        error,
      });
      return res.status(500).json({ error: 'Failed to update custom game session.' });
    }
  };
}

export function createFinalizeCustomGameSessionHandler({
  findSessionFn = async ({ playId, auth0Id }) =>
    getCachedCustomGameSessionsCollection().findOne({ playId, auth0Id }),
  finalizeSessionFn = async ({ playId, auth0Id, finalState, finalizedAt }) =>
    getCachedCustomGameSessionsCollection().updateOne(
      { playId, auth0Id, finalState: { $exists: false } },
      { $set: { finalState, finalizedAt } }
    ),
  logger = sessionLogger,
} = {}) {
  return async function finalizeCustomGameSession(req, res) {
    const { playId, auth0Id, finalState } = normalizePayload(req.body);

    if (!playId) {
      return res.status(400).json({ error: 'Please provide a playId in the request body.' });
    }

    if (!auth0Id) {
      return res.status(400).json({ error: 'Please provide an auth0Id in the request body.' });
    }

    if (!ALLOWED_FINAL_STATES.has(finalState)) {
      return res.status(400).json({ error: 'Please provide a valid final state.' });
    }

    try {
      const existingSession = await findSessionFn({ playId, auth0Id });

      if (!existingSession) {
        return res.status(404).json({ error: 'Custom game session not found.' });
      }

      if (existingSession.finalState) {
        return res.json({ success: true });
      }

      if (finalState === 'abandoned' && !existingSession.hasInteraction) {
        return res.status(400).json({ error: 'Cannot mark a custom game as abandoned before interaction.' });
      }

      await finalizeSessionFn({
        playId,
        auth0Id,
        finalState,
        finalizedAt: new Date(),
      });

      logger.info?.('custom_game_session_finalized', {
        requestId: req.id || null,
        playId,
        auth0Id,
        finalState,
      });

      return res.json({ success: true });
    } catch (error) {
      logger.error('custom_game_session_finalize_failed', {
        requestId: req.id || null,
        playId,
        auth0Id,
        finalState,
        error,
      });
      return res.status(500).json({ error: 'Failed to finalize custom game session.' });
    }
  };
}

export const startCustomGameSession = createStartCustomGameSessionHandler();
export const markCustomGameSessionInteracted = createMarkCustomGameSessionInteractedHandler();
export const finalizeCustomGameSession = createFinalizeCustomGameSessionHandler();
