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
const SUBJECT_GENERATION_MODEL = 'gpt-4.1-mini';
const SUSPICIOUS_HEADER_PATTERN = /\b(main|primary|signature|exact|specific|full name|real name|civilian|alias|birthplace|dominant|unique)\b/i;
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
    const { topic, minCategories = 5, maxCategories = 6, auth0Id } = req.body || {};
    const MIN_COUNT = 12;
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
        model: SUBJECT_GENERATION_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `
            You generate structured game data for Promptle, a subject guessing game where clues only work when categories and values overlap across many subjects.
            Return ONLY a single JSON object with this exact shape:
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

            Hard requirements:
            (1) Subject count must be 12-80. Aim for at least 25 subjects if the topic can support it. Prefer 25-40 subjects for most viable topics. If the topic has a very large roster, you may return up to 80 diverse subjects. If the topic is a small finite roster below 25, return the full roster as long as it has at least 12 valid subjects.
            (2) Total number of columns, including "Subject", must be between the provided min and max.
            (3) The best output is the one where many different subjects share the same category values, making deduction work well.
            (4) Prefer fewer, stronger categories. Do not add filler columns just to hit the maximum. If the topic is already well-described with a smaller set of strong categories, stop there.
            (5) Most non-Subject categories should be specific to the topic's domain rather than generic metadata, as long as they still overlap across many subjects.
            (6) If a category naturally supports multiple reusable traits, memberships, attributes, abilities, themes, or affiliations, use kind "set" instead of forcing one single text value.
            (7) Do not use headers that imply only one dominant value when several reusable values are natural. Avoid words like main, primary, signature, exact, specific, dominant, or unique in headers.
            (8) The first column must be { "header": "Subject", "kind": "text" }. The first cell for each answer must equal the subject name.
            (9) All answers must share the exact same column order and semantic meaning.
            (10) Keep display values concise. Use "parts.tokens" for important words when needed.
            (11) Use "set" for reusable multi-item tags. Every set cell must include "items".
            (12) Use "reference" only for true title-or-index references such as issue numbers. Every reference cell must include parts.label and parts.number.
            (13) Use "number" for numeric values or measurements. Every number cell must include parts.value and include parts.unit when shown.
            (14) Use "text" for ordinary single values and include parts.tokens.

            Category design rules:
            (15) Every non-Subject header must be reusable across the roster. Do not use headers where most rows would be unique.
            (16) Avoid identity-only or trivia-style headers such as real name, full name, civilian name, alter ego, exact birthplace, signature move, alias meaning, or other one-off facts.
            (17) Prefer broad recurring taxonomies such as affiliation, faction, role, class, archetype, region, origin, element, family, type, status, group, era, genre, or trait cluster.
            (18) Prefer headers that represent reusable category families rather than single standout facts. Plural or family-style headers are often better than singular "main" or "primary" headers when overlap matters.
            (19) Standardize values into a canonical shared vocabulary. Use one broad label instead of near-duplicates like "Super strength" and "God-like strength". If both describe the same bucket, output one shared value such as "Strength".
            (20) If a fact is too specific, generalize it up one or two levels until it becomes reusable across multiple subjects.
            (21) Prefer broad shared labels over narrow manifestations. For example, if a raw value is only one expression of a broader reusable trait, output the broader trait.
            (22) For set columns, reuse a small fixed vocabulary across the whole roster. Prefer shared tags over bespoke descriptions.
            (23) Before answering, self-check every non-Subject column: multiple different subjects should share values in that column, text columns should not behave like near-unique identifiers, and the category set should feel compact, topic-aware, and high quality rather than exhaustive.

            Examples:
            Bad headers: Real Name, Main Trait, Primary Ability, Signature Move, Exact Homeplace, Significant Other, or anything else that would be unique to just one subject or not reusable across multiple subjects.
            `,
          },
          {
            role: 'user',
            content: `
            Topic: "${normalizedTopic}"

            Generate distinct subjects and structured categories for this topic.
            Subject count policy: generate at least 12 subjects; aim for at least 25 if viable; usually stay in the 25-40 range; if this topic has a very large roster, you may generate up to 80 diverse subjects.
            Category policy: use fewer, higher-quality categories; favor topic-specific categories; avoid generic filler; most non-Subject categories should feel native to this topic; prefer reusable set-style categories when multiple shared traits are natural; prefer broad shared labels over narrow one-off facts.
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
      const suspiciousHeaders = payload.headers.filter((header, index) => index !== 0 && SUSPICIOUS_HEADER_PATTERN.test(header));

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
        model: SUBJECT_GENERATION_MODEL,
        correctAnswer: payload.correctAnswer?.name,
        correctAnswerCells: payload.correctAnswer?.cells || [],
        suspiciousHeaders,
        tokenUsage: completion.usage || 'No usage data',
      };
      if (suspiciousHeaders.length) {
        const suspiciousHeaderLogPayload = {
          requestId: req.id || null,
          auth0Id: auth0Id || null,
          topic: payload.topic,
          headers: payload.headers,
          suspiciousHeaders,
        };
        if (typeof logger.warn === 'function') {
          logger.warn('subject_generation_suspicious_headers', suspiciousHeaderLogPayload);
        } else if (typeof logger.info === 'function') {
          logger.info('subject_generation_suspicious_headers', suspiciousHeaderLogPayload);
        } else if (typeof logger.debug === 'function') {
          logger.debug('subject_generation_suspicious_headers', suspiciousHeaderLogPayload);
        }
      }
      if (typeof logger.debug === 'function') {
        logger.debug('subject_generation_succeeded', successLogPayload);
      } else if (typeof logger.info === 'function') {
        logger.info('subject_generation_succeeded', successLogPayload);
      }

      return res.json(payload);
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
