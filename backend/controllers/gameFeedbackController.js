import { getGameFeedbackCollection } from '../config/db.js';
import { appLogger } from '../lib/logger.js';
import { normalizeTopicKey } from '../services/topicNormalization.js';

const ALLOWED_GAME_TYPES = new Set(['promptle', 'connections', 'crossword']);
const ALLOWED_RESULTS = new Set(['won', 'revealed']);
const feedbackLogger = appLogger.child({ component: 'game-feedback' });

let cachedGameFeedbackCollection = null;

function getCachedGameFeedbackCollection() {
  if (!cachedGameFeedbackCollection) cachedGameFeedbackCollection = getGameFeedbackCollection();
  return cachedGameFeedbackCollection;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function createSaveGameFeedbackHandler({
  insertFeedbackFn = async (doc) => getCachedGameFeedbackCollection().insertOne(doc),
  logger = feedbackLogger,
} = {}) {
  return async function saveGameFeedback(req, res) {
    const { auth0Id, topic, liked, gameType, result } = req.body || {};
    const normalizedTopic = normalizeOptionalString(topic);
    const normalizedAuth0Id = normalizeOptionalString(auth0Id) || null;
    const normalizedGameType = normalizeOptionalString(gameType).toLowerCase();
    const normalizedResult = normalizeOptionalString(result).toLowerCase();

    if (!normalizedTopic) {
      return res.status(400).json({ error: 'Please provide a topic in the request body.' });
    }

    if (typeof liked !== 'boolean') {
      return res.status(400).json({ error: 'Please provide whether the player liked the game.' });
    }

    if (!ALLOWED_GAME_TYPES.has(normalizedGameType)) {
      return res.status(400).json({ error: 'Please provide a valid game type.' });
    }

    if (normalizedResult && !ALLOWED_RESULTS.has(normalizedResult)) {
      return res.status(400).json({ error: 'Please provide a valid game result.' });
    }

    const feedbackDoc = {
      auth0Id: normalizedAuth0Id,
      topic: normalizedTopic,
      topicKey: normalizeTopicKey(normalizedTopic),
      liked,
      gameType: normalizedGameType,
      createdAt: new Date(),
      ...(normalizedResult ? { result: normalizedResult } : {}),
    };

    try {
      await insertFeedbackFn(feedbackDoc);

      if (typeof logger.info === 'function') {
        logger.info('custom_game_feedback_saved', {
          requestId: req.id || null,
          auth0Id: normalizedAuth0Id,
          topic: normalizedTopic,
          gameType: normalizedGameType,
          liked,
          result: normalizedResult || null,
        });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error('custom_game_feedback_save_failed', {
        requestId: req.id || null,
        auth0Id: normalizedAuth0Id,
        topic: normalizedTopic,
        gameType: normalizedGameType,
        liked,
        result: normalizedResult || null,
        error,
      });
      return res.status(500).json({ error: 'Failed to save game feedback.' });
    }
  };
}

export const saveGameFeedback = createSaveGameFeedbackHandler();
