// controllers/subjectController.js
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
import { normalizeGameAnswer, normalizeGamePayload } from '../services/gameCells.js';
import { appLogger } from '../lib/logger.js';

const DEV_EMAIL = 'promptle99@gmail.com';
const subjectLogger = appLogger.child({ component: 'subjects' });

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

export function createGenerateSubjectsHandler({
  openaiClient = openai,
  apiKey = OPENAI_API_KEY,
  logger = subjectLogger,
  isDevAccountFn = isDevAccount,
  fetchDevSettingsFn = fetchDevSettings,
  moderateTopicInputFn = moderateTopicInput,
  logRejectedTopicAttemptFn = logRejectedTopicAttempt,
} = {}) {
  return async function generateSubjects(req, res) {
    const { topic, minCategories = 6, maxCategories = 8, auth0Id } = req.body || {};
    const MIN_COUNT = 7;
    const MAX_COUNT = 100;
    const TARGET_DEFAULT = 20;
    const normalizedTopic = typeof topic === 'string' ? topic.trim() : '';

    // Input validation for topic
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
      logger.error('subject_generation_missing_api_key', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
      });
      return res.status(500).json({ error: 'OpenAI API key is missing. Set OPENAI_API_KEY in your environment.' });
    }

    // Moderate the topic input using the provided moderation function
    let moderationResult;
    try {
      // Pass the openaiClient to the moderation function in case it needs to make API calls for moderation
      moderationResult = await moderateTopicInputFn({
        openaiClient,
        topic: normalizedTopic,
      });
    } catch (error) {
      logger.error('topic_moderation_failed', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
        error,
      });
      return res.status(500).json({ error: TOPIC_MODERATION_FAILED_ERROR });
    }

    // If the topic is flagged by moderation, log the attempt and return an error response
    if (moderationResult.flagged) {
      try {
        await logRejectedTopicAttemptFn({
          auth0Id,
          topic: normalizedTopic,
          moderationResult,
        });
      } catch (error) {
        logger.error('blocked_topic_attempt_log_failed', {
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
        logger.info('ai_topic_blocked', blockedLogPayload);
      } else if (typeof logger.debug === 'function') {
        logger.debug('ai_topic_blocked', blockedLogPayload);
      }

      // Returns a user error message indicating the topic is not allowed
      return res.status(400).json({
        error: TOPIC_NOT_ALLOWED_ERROR,
        code: 'topic_not_allowed',
      });
    }

    try {
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `
            You generate structured game data for a wordle-like subject guessing game. 
            Always respond ONLY with a single JSON object using this exact shape: 
            {
              "topic": string,
              "columns": [
                {
                  "header": string,
                  "kind": "text" | "set" | "reference" | "number",
                  "unit"?: string
                }
              ],
              "answers": [
                {
                  "name": string,
                  "cells": [
                    {
                      "display": string,
                      "items"?: [string],
                      "parts"?: {
                        "tokens"?: [string],
                        "label"?: string,
                        "number"?: string,
                        "value"?: number,
                        "unit"?: string
                      }
                    }
                  ]
                }
              ]
            }
            
            Rules:
            (1) Subject count must be between 7-100, aim for 15–30 most of the time unless:
            the topic has a small finite roster of 50 or less (e.g., NFL teams, U.S. states), then include them all.
            the topic has substantially more than 100 possible subjects, then select around 80–100 different subjects. 
            (2) Total number of columns, including "Subject", must be between the provided min and max number of categories, and should be sufficient enough to properly describe and identify the subject.
            (3) The first column must be { "header": "Subject", "kind": "text" }. The first cell for each answer must have a display value equal to the subject name.
            (4) All answers must share identical column structure and value ordering.
            (5) Keep display values concise (1-3 words) unless a longer name is necessary for clarity. Use the "parts" field to break down longer names into important tokens for guessing.
            (6) Every column must declare the semantic kind for that entire column. All cells in a column must match the declared kind.
            (7) Use "set" when a column contains multiple items such as powers, members, colors, genres, or teams. Every cell in a set column must include "items".
            (8) Use "reference" ONLY for true entity-specific title/index values such as "Amazing Fantasy #15". Every cell in a reference column must include both parts.label and parts.number.
            (9) Use "number" for numeric quantities or identifiers, including values with units like "2.5 m" or "220 kg". Every cell in a number column must include parts.value, and include parts.unit when a unit is shown. The display string must include the unit text when a unit exists. Use digits, not roman numerals or spelled-out numbers.
            (10) Use "text" for ordinary single values and include parts.tokens with the important words.
          `,
          },
          {
            role: 'user',
            content: `
          Topic: "${normalizedTopic}". 
          Generate distinct subjects and structured categories using the rules above.
          Stay within 7-100 subjects: aim for 15-30 by default, but if the domain is a small finite list under 100 return them all, and if the domain is very large (hundreds) return 80-100 diverse subjects.

          Min categories: ${minCategories}
          Max categories: ${maxCategories}
          `,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        logger.error('subject_generation_invalid_json', {
          requestId: req.id || null,
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          raw,
          error,
        });
        return res.status(500).json({ error: 'AI response was not valid JSON.' });
      }

      let columns = Array.isArray(parsed.columns) ? parsed.columns : [];
      let headers = Array.isArray(parsed.headers) ? parsed.headers : [];
      let answers = Array.isArray(parsed.answers) ? parsed.answers : [];

      if (!columns.length && headers.length) {
        columns = headers.map((header, index) => ({
          header,
          ...(index === 0 ? { kind: 'text' } : {}),
        }));
      }

      if (columns.length) {
        headers = columns
          .map((column) => (typeof column?.header === 'string' ? column.header : ''))
          .filter(Boolean);
      }

      if (!columns.length || !answers.length) {
        logger.error('subject_generation_missing_required_fields', {
          requestId: req.id || null,
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          hasColumns: Boolean(columns.length),
          hasAnswers: Boolean(answers.length),
        });
        return res.status(500).json({ error: 'AI response was missing columns or answers.' });
      }

      if (answers.length < MIN_COUNT) {
        logger.error('subject_generation_too_few_answers', {
          requestId: req.id || null,
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          answerCount: answers.length,
          minRequired: MIN_COUNT,
        });
        return res.status(500).json({ error: `AI returned too few subjects. Need at least ${MIN_COUNT}.` });
      }

      columns = columns.slice(0, Math.min(maxCategories, columns.length));
      const targetCount = Math.max(
        MIN_COUNT,
        Math.min(MAX_COUNT, Math.max(answers.length || TARGET_DEFAULT, MIN_COUNT))
      );

      answers = answers.slice(0, targetCount).map((answer) => normalizeGameAnswer(answer, columns));

      const correctAnswer = answers[Math.floor(Math.random() * answers.length)];
      const finalTopic = parsed.topic || normalizedTopic;
      const payload = normalizeGamePayload({
        topic: finalTopic,
        columns,
        answers,
        correctAnswer,
      });

      const successLogPayload = {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: payload.topic,
        headers: payload.headers,
        headersCount: payload.headers.length,
        subjectCount: payload.answers.length,
        targetCount,
        minCategories,
        maxCategories,
        correctAnswer: payload.correctAnswer?.name,
        correctAnswerCells: payload.correctAnswer?.cells || [],
        tokenUsage: completion.usage || 'No usage data',
      };
      if (typeof logger.debug === 'function') {
        logger.debug('subject_generation_succeeded', successLogPayload);
      } else if (typeof logger.info === 'function') {
        logger.info('subject_generation_succeeded', successLogPayload);
      }

      res.json(payload);
    } catch (error) {
      logger.error('subject_generation_failed', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
        error,
      });
      res.status(500).json({ error: 'Failed to generate subjects.' });
    }
  };
}

export const generateSubjects = createGenerateSubjectsHandler();
