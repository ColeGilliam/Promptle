import { OPENAI_API_KEY } from '../config/config.js';
import { getUsersCollection } from '../config/db.js';
import { fetchDevSettings } from '../services/devSettings.js';
import {
  logRejectedTopicAttempt,
  moderateTopicInput,
  TOPIC_MODERATION_FAILED_ERROR,
  TOPIC_NOT_ALLOWED_ERROR,
} from '../services/topicModeration.js';
import { normalizeConnectionsGamePayload } from '../services/connectionsGame.js';
import {
  generationOpenAiClient,
  getTokenUsageLabel,
  requireOpenAi,
} from '../services/gameGenerationShared.js';
import { appLogger } from '../lib/logger.js';

const DEV_EMAIL = 'promptle99@gmail.com';
const connectionsLogger = appLogger.child({ component: 'connections' });

// Matches the same dev identity check used elsewhere to restrict access.
async function isDevAccount(auth0Id) {
  if (!auth0Id) return false;
  try {
    const user = await getUsersCollection().findOne({ auth0Id });
    return user?.email === DEV_EMAIL;
  } catch {
    return false;
  }
}

const CONNECTIONS_GENERATION_MODEL = 'gpt-4o-mini';

export function buildConnectionsGenerationMessages({ topic } = {}) {
  return [
    {
      role: 'system',
      content: `
          You generate original Connections-style word grouping puzzles.
          Return ONLY a single JSON object with this exact shape:
          {
            "topic": string,
            "groups": [
              {
                "category": string,
                "difficulty": "yellow" | "green" | "blue" | "purple",
                "words": [string, string, string, string],
                "explanation": string
              }
            ]
          }

          Hard requirements:
          (1) Return exactly 4 groups and exactly 4 words per group.
          (2) All 16 words must be globally unique. No duplicates, no singular/plural duplicates, no repeated phrases with punctuation changes.
          (3) Order groups from easiest to hardest: yellow, green, blue, purple.
          (4) Words should be concise, display-friendly entries, usually 1-2 words.
          (5) Categories must be precise and defensible.
          (6) Build in misdirection: several words should look like they could fit other groups at first glance, but the intended solution must still be uniquely solvable.
          (7) Avoid using the category name as one of the words.
          (8) Avoid overly obscure trivia unless the topic clearly calls for it.
          (9) explanation must be one short sentence explaining the actual connection.
        `,
    },
    {
      role: 'user',
      content: `
          Topic: "${topic}"

          Make a Connections puzzle inspired by this topic. Keep it clever, slightly deceptive, and fair.
          Lean toward cross-category red herrings so multiple words appear to belong together before the real categories become clear.
        `,
    },
  ];
}

export async function generateConnectionsGameForTopic({
  topic,
  model = CONNECTIONS_GENERATION_MODEL,
  openaiClient = generationOpenAiClient,
  apiKey = OPENAI_API_KEY,
  logger = connectionsLogger,
  requestId = null,
  auth0Id = null,
} = {}) {
  const normalizedTopic = typeof topic === 'string' ? topic.trim() : '';
  if (!normalizedTopic) {
    throw new Error('Please provide a topic in the request body.');
  }

  requireOpenAi(openaiClient, apiKey, 'OpenAI API key is missing. Set OPENAI_API_KEY in your environment.');

  const completion = await openaiClient.chat.completions.create({
    model,
    temperature: 0.9,
    response_format: { type: 'json_object' },
    messages: buildConnectionsGenerationMessages({ topic: normalizedTopic }),
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logger.error('connections_generation_invalid_json', {
      requestId,
      auth0Id,
      topic: normalizedTopic,
      raw,
      error,
    });
    throw new Error('AI response was not valid JSON.');
  }

  let payload;
  try {
    payload = normalizeConnectionsGamePayload(parsed, normalizedTopic);
  } catch (error) {
    logger.error('connections_generation_validation_failed', {
      requestId,
      auth0Id,
      topic: normalizedTopic,
      parsed,
      error,
    });
    throw new Error(error.message || 'AI response was not a valid Connections puzzle.');
  }

  const successLogPayload = {
    requestId,
    auth0Id,
    topic: payload.topic,
    groups: payload.groups.map((group) => ({
      category: group.category,
      difficulty: group.difficulty,
      words: group.words,
    })),
    model,
    tokenUsage: getTokenUsageLabel(completion),
  };

  if (typeof logger.debug === 'function') {
    logger.debug('connections_generation_succeeded', successLogPayload);
  } else if (typeof logger.info === 'function') {
    logger.info('connections_generation_succeeded', successLogPayload);
  }

  return payload;
}

export function createGenerateConnectionsHandler({
  openaiClient = generationOpenAiClient,
  apiKey = OPENAI_API_KEY,
  logger = connectionsLogger,
  isDevAccountFn = isDevAccount,
  fetchDevSettingsFn = fetchDevSettings,
  moderateTopicInputFn = moderateTopicInput,
  logRejectedTopicAttemptFn = logRejectedTopicAttempt,
} = {}) {
  // The factory keeps the controller easy to test by letting callers replace network/db dependencies.
  return async function generateConnectionsGame(req, res) {
    const { topic, auth0Id } = req.body || {};
    const normalizedTopic = typeof topic === 'string' ? topic.trim() : '';

    if (!normalizedTopic) {
      return res.status(400).json({ error: 'Please provide a topic in the request body.' });
    }

    const isDevUser = await isDevAccountFn(auth0Id);
    if (!isDevUser) {
      // Non-dev users can only generate boards when the dev toggle explicitly opens generation up.
      const settings = await fetchDevSettingsFn();
      if (!settings.allowAllAIGeneration) {
        return res.status(403).json({ error: 'AI game generation is restricted to the dev account.' });
      }
    }

    if (!openaiClient || !apiKey) {
      logger.error('connections_generation_missing_api_key', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
      });
      return res.status(500).json({ error: 'OpenAI API key is missing. Set OPENAI_API_KEY in your environment.' });
    }

    let moderationResult;
    try {
      // Moderate the topic before generation so blocked topics never reach the puzzle prompt.
      moderationResult = await moderateTopicInputFn({
        openaiClient,
        topic: normalizedTopic,
      });
    } catch (error) {
      logger.error('connections_topic_moderation_failed', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
        error,
      });
      return res.status(500).json({ error: TOPIC_MODERATION_FAILED_ERROR });
    }

    if (moderationResult.flagged) {
      // Persist blocked attempts when possible so moderation incidents are not silently lost.
      try {
        await logRejectedTopicAttemptFn({
          auth0Id,
          topic: normalizedTopic,
          moderationResult,
        });
      } catch (error) {
        logger.error('blocked_connections_topic_attempt_log_failed', {
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
        logger.info('connections_topic_blocked', blockedLogPayload);
      } else if (typeof logger.debug === 'function') {
        logger.debug('connections_topic_blocked', blockedLogPayload);
      }

      return res.status(400).json({
        error: TOPIC_NOT_ALLOWED_ERROR,
        code: 'topic_not_allowed',
      });
    }

    try {
      const payload = await generateConnectionsGameForTopic({
        topic: normalizedTopic,
        openaiClient,
        apiKey,
        logger,
        requestId: req.id || null,
        auth0Id: auth0Id || null,
      });
      res.json(payload);
    } catch (error) {
      logger.error('connections_generation_failed', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
        error,
      });
      res.status(500).json({
        error: error instanceof Error && error.message ? error.message : 'Failed to generate Connections puzzle.',
      });
    }
  };
}

// Production export wired to the real OpenAI client, logger, moderation flow, and dev-settings lookup.
export const generateConnectionsGame = createGenerateConnectionsHandler();
