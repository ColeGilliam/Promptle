import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/config.js';
import { getUsersCollection } from '../config/db.js';
import { fetchDevSettings } from './devSettingsController.js';
import {
  logRejectedTopicAttempt,
  moderateTopicInput,
  TOPIC_MODERATION_FAILED_ERROR,
  TOPIC_NOT_ALLOWED_ERROR,
} from '../services/topicModeration.js';
import { normalizeConnectionsGamePayload } from '../services/connectionsGame.js';

const DEV_EMAIL = 'promptle99@gmail.com';

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

// Default OpenAI client for live requests; tests can supply a fake replacement through the factory.
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

export function createGenerateConnectionsHandler({
  openaiClient = openai,
  apiKey = OPENAI_API_KEY,
  logger = console,
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
      logger.error('Error moderating connections topic input:', error);
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
        logger.error('Failed to log rejected connections topic attempt:', error);
      }

      if (typeof logger.warn === 'function') {
        logger.warn('[Connections topic blocked]', {
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          flaggedCategories: moderationResult.flaggedCategories,
          moderationModel: moderationResult.moderationModel,
        });
      } else {
        logger.info('[Connections topic blocked]', {
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          flaggedCategories: moderationResult.flaggedCategories,
          moderationModel: moderationResult.moderationModel,
        });
      }

      return res.status(400).json({
        error: TOPIC_NOT_ALLOWED_ERROR,
        code: 'topic_not_allowed',
      });
    }

    try {
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.9,
        // Ask for JSON up front, then still validate the result because model output is untrusted input.
        response_format: { type: 'json_object' },
        messages: [
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
            Topic: "${normalizedTopic}"

            Make a Connections puzzle inspired by this topic. Keep it clever, slightly deceptive, and fair.
            Lean toward cross-category red herrings so multiple words appear to belong together before the real categories become clear.
          `,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        logger.error('Failed to parse Connections AI response as JSON:', raw, error);
        return res.status(500).json({ error: 'AI response was not valid JSON.' });
      }

      let payload;
      try {
        // Accept small model drift in field names/order, but enforce a strict 4x4 game contract.
        payload = normalizeConnectionsGamePayload(parsed, normalizedTopic);
      } catch (error) {
        logger.error('Connections AI response failed validation:', error, parsed);
        return res.status(500).json({ error: error.message || 'AI response was not a valid Connections puzzle.' });
      }

      logger.info('[AI connections] summary', {
        topic: payload.topic,
        groups: payload.groups.map((group) => ({
          category: group.category,
          difficulty: group.difficulty,
          words: group.words,
        })),
        tokenUsage: completion.usage || 'No usage data',
      });

      res.json(payload);
    } catch (error) {
      logger.error('Error generating Connections game from OpenAI:', error);
      // Keep the client response generic rather than exposing raw SDK or model details.
      res.status(500).json({ error: 'Failed to generate Connections puzzle.' });
    }
  };
}

// Production export wired to the real OpenAI client, logger, moderation flow, and dev-settings lookup.
export const generateConnectionsGame = createGenerateConnectionsHandler();
