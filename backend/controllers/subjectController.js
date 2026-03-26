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

const DEV_EMAIL = 'promptle99@gmail.com';

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
  logger = console,
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
      logger.error('Error moderating topic input:', error);
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
        logger.error('Failed to log rejected topic attempt:', error);
      }

      // Log the blocked attempt with user ID, topic, flagged categories, and moderation model used, using warn level if available, otherwise fallback to info
      if (typeof logger.warn === 'function') {
        logger.warn('[AI topic blocked]', {
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          flaggedCategories: moderationResult.flaggedCategories,
          moderationModel: moderationResult.moderationModel,
        });
      } else {
        logger.info('[AI topic blocked]', {
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          flaggedCategories: moderationResult.flaggedCategories,
          moderationModel: moderationResult.moderationModel,
        });
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
              "headers": ["Subject", "Category 1", ...],
              "answers": [
                {
                  "name": string,
                  "values": ["Subject", "Category 1 value", ...]
                }
              ]
            }
            
            Rules:
            (1) Subject count must be between 7-100, aim for 15–30 most of the time unless:
            the topic has a small finite roster of 50 or less (e.g., NFL teams, U.S. states), then include them all.
            the topic has substantially more than 100 possible subjects, then select around 80–100 different subjects. 
            (2) Total number of headers, including "Subject", must be between the provided min and max number of categories, and should be sufficient enough to properly describe and identify the subject.
            (3) The first header is "Subject". The first value for each answer must match the subject name.
            (4) All answers must share identical header structure and value ordering.
            (5) Keep values concise (1-3 words).
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
        logger.error('Failed to parse OpenAI response as JSON:', raw, error);
        return res.status(500).json({ error: 'AI response was not valid JSON.' });
      }

      let headers = Array.isArray(parsed.headers) ? parsed.headers : [];
      let answers = Array.isArray(parsed.answers) ? parsed.answers : [];

      if (!headers.length || !answers.length) {
        return res.status(500).json({ error: 'AI response was missing headers or answers.' });
      }

      if (answers.length < MIN_COUNT) {
        logger.error('AI response contained too few subjects:', answers.length);
        return res.status(500).json({ error: `AI returned too few subjects. Need at least ${MIN_COUNT}.` });
      }

      headers = headers.slice(0, Math.min(maxCategories, headers.length));
      const targetCount = Math.max(
        MIN_COUNT,
        Math.min(MAX_COUNT, Math.max(answers.length || TARGET_DEFAULT, MIN_COUNT))
      );

      answers = answers.slice(0, targetCount).map((answer) => {
        const values = Array.isArray(answer.values) ? answer.values.slice(0, headers.length) : [];
        const name = answer.name || values[0] || '';
        return { name, values };
      });

      const correctAnswer = answers[Math.floor(Math.random() * answers.length)];
      const finalTopic = parsed.topic || normalizedTopic;

      logger.info('[AI subjects] summary', {
        topic: finalTopic,
        headersCount: headers.length,
        subjectCount: answers.length,
        targetCount,
        minCategories,
        maxCategories,
        correctAnswer: correctAnswer?.name,
        tokenUsage: completion.usage || 'No usage data',
      });

      res.json({
        topic: finalTopic,
        headers,
        answers,
        correctAnswer,
      });
    } catch (error) {
      logger.error('Error generating subjects from OpenAI:', error);
      res.status(500).json({ error: 'Failed to generate subjects.' });
    }
  };
}

export const generateSubjects = createGenerateSubjectsHandler();
