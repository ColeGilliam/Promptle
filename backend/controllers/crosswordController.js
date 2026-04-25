import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/config.js';
import { getUsersCollection } from '../config/db.js';
import { fetchDevSettings } from './devSettingsController.js';
import {
  logRejectedTopicAttempt,
  moderateTopicInput,
  TOPIC_NOT_ALLOWED_ERROR,
} from '../services/topicModeration.js';
import {
  buildCrosswordGameFromCandidatePool,
  normalizeCrosswordCandidatePool,
} from '../services/crosswordGame.js';
import { appLogger } from '../lib/logger.js';

const DEV_EMAIL = 'promptle99@gmail.com';
const GENERATION_ATTEMPTS = 3;
const CROSSWORD_GENERATION_ERROR = 'Sorry! The puzzle failed to generate. Please try again.';
const crosswordLogger = appLogger.child({ component: 'crossword' });

async function isDevAccount(auth0Id) {
  if (!auth0Id) return false;
  try {
    const user = await getUsersCollection().findOne({ auth0Id });
    return user?.email === DEV_EMAIL;
  } catch {
    return false;
  }
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

export function createGenerateCrosswordHandler({
  openaiClient = openai,
  apiKey = OPENAI_API_KEY,
  logger = crosswordLogger,
  isDevAccountFn = isDevAccount,
  fetchDevSettingsFn = fetchDevSettings,
  moderateTopicInputFn = moderateTopicInput,
  logRejectedTopicAttemptFn = logRejectedTopicAttempt,
} = {}) {
  return async function generateCrosswordGame(req, res) {
    const { topic, auth0Id } = req.body || {};
    const normalizedTopic = typeof topic === 'string' ? topic.trim() : '';

    if (!normalizedTopic) {
      return res.status(400).json({ error: 'Please provide a topic in the request body.' });
    }

    const isDevUser = await isDevAccountFn(auth0Id);
    if (!isDevUser) {
      const settings = await fetchDevSettingsFn();
      if (!settings.allowAllAIGeneration) {
        return res.status(403).json({ error: 'AI game generation is restricted to the dev account.' });
      }
    }

    if (!openaiClient || !apiKey) {
      logger.error('crossword_generation_missing_api_key', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
      });
      return res.status(500).json({ error: CROSSWORD_GENERATION_ERROR });
    }

    let moderationResult;
    try {
      moderationResult = await moderateTopicInputFn({
        openaiClient,
        topic: normalizedTopic,
      });
    } catch (error) {
      logger.error('crossword_topic_moderation_failed', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
        error,
      });
      return res.status(500).json({ error: CROSSWORD_GENERATION_ERROR });
    }

    if (moderationResult.flagged) {
      try {
        await logRejectedTopicAttemptFn({
          auth0Id,
          topic: normalizedTopic,
          moderationResult,
        });
      } catch (error) {
        logger.error('blocked_crossword_topic_attempt_log_failed', {
          requestId: req.id || null,
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          error,
        });
      }

      const blockedLogPayload = {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
        flaggedCategories: moderationResult.flaggedCategories,
        moderationModel: moderationResult.moderationModel,
      };
      if (typeof logger.info === 'function') {
        logger.info('crossword_topic_blocked', blockedLogPayload);
      } else if (typeof logger.debug === 'function') {
        logger.debug('crossword_topic_blocked', blockedLogPayload);
      }

      return res.status(400).json({
        error: TOPIC_NOT_ALLOWED_ERROR,
        code: 'topic_not_allowed',
      });
    }

    // Let the model provide a broad answer pool, then rely on local construction and validation.
    for (let attempt = 1; attempt <= GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const completion = await openaiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.8,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `
              You generate candidate answer pools for topic-themed crosswords.
              Return ONLY a single JSON object with this exact shape:
              {
                "topic": string,
                "candidates": [
                  {
                    "answer": string,
                    "clue": string,
                    "kind": "theme" | "support"
                  }
                ]
              }

              Hard requirements:
              (1) Return 30-48 candidates.
              (2) Every answer must be 3-15 characters and may use letters and numbers only.
              (3) Most candidates should be strongly tied to the topic. A smaller number of flexible support-fill answers is allowed when the layout needs it.
              (4) Aim mostly for shorter, cross-friendly answers in the 4-8 character range, but include some longer answers when the topic supports them.
              (5) Favor familiar, cross-friendly words with common letters. Do NOT attempt to place them on a grid.
              (6) Avoid duplicate answers, obscure trivia, and forced strings. Use numbers only when they are natural to the topic, such as model names, sequels, or titles.
              (7) Every clue must be short, fair, and specific to that answer.
              (8) Make the theme obvious and central to the selected topic.
            `,
            },
            {
              role: 'user',
              content: `
              Topic: "${normalizedTopic}"

              Generate a candidate pool for a themed crossword based on this topic.
              The pool should feel playful, polished, and solvable by someone reasonably familiar with the topic.
              Focus on answer quality and clue quality, not coordinates or grid structure.
            `,
            },
          ],
        });

        const raw = completion.choices[0]?.message?.content || '{}';
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (error) {
          logger.error('crossword_generation_invalid_json', {
            requestId: req.id || null,
            auth0Id: auth0Id || null,
            topic: normalizedTopic,
            attempt,
            raw,
            error,
          });
          continue;
        }

        let candidatePool;
        try {
          candidatePool = normalizeCrosswordCandidatePool(parsed, normalizedTopic);
        } catch (error) {
          logger.error('crossword_candidate_pool_validation_failed', {
            requestId: req.id || null,
            auth0Id: auth0Id || null,
            topic: normalizedTopic,
            attempt,
            parsed,
            error,
          });
          continue;
        }

        let result;
        try {
          // The builder handles actual layout search so the model does not have to solve the grid itself.
          result = buildCrosswordGameFromCandidatePool(candidatePool);
        } catch (error) {
          logger.error('crossword_construction_failed', {
            requestId: req.id || null,
            auth0Id: auth0Id || null,
            topic: normalizedTopic,
            attempt,
            candidatePool,
            error,
          });
          continue;
        }

        const successLogPayload = {
          requestId: req.id || null,
          auth0Id: auth0Id || null,
          topic: result.puzzle.topic,
          size: result.puzzle.size,
          entryCount: result.puzzle.entries.length,
          candidateCount: candidatePool.candidates.length,
          boardSize: result.stats.boardSize,
          targetWordCount: result.stats.targetWordCount,
          actualWordCount: result.stats.actualWordCount,
          attempt,
          tokenUsage: completion.usage || 'No usage data',
        };
        if (typeof logger.debug === 'function') {
          logger.debug('crossword_generation_succeeded', successLogPayload);
        } else if (typeof logger.info === 'function') {
          logger.info('crossword_generation_succeeded', successLogPayload);
        }

        return res.json(result.puzzle);
      } catch (error) {
        logger.error('crossword_generation_attempt_failed', {
          requestId: req.id || null,
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          attempt,
          error,
        });
      }
    }

    logger.error('crossword_generation_exhausted', {
      requestId: req.id || null,
      auth0Id: auth0Id || null,
      topic: normalizedTopic,
      attempts: GENERATION_ATTEMPTS,
    });
    return res.status(500).json({ error: CROSSWORD_GENERATION_ERROR });
  };
}

export const generateCrosswordGame = createGenerateCrosswordHandler();
