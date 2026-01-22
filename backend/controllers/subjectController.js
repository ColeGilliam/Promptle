// controllers/subjectController.js
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/config.js';

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

export async function generateSubjects(req, res) {
  const { topic, minCategories = 6, maxCategories = 8 } = req.body || {};
  const MIN_COUNT = 7;
  const MAX_COUNT = 100;
  const TARGET_DEFAULT = 20;

  if (!topic) {
    return res.status(400).json({ error: 'Please provide a topic in the request body.' });
  }

  if (!openai || !OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key is missing. Set OPENAI_API_KEY in your environment.' });
  }

  try {
    const completion = await openai.chat.completions.create({
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
          Topic: "${topic}". 
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
      console.error('Failed to parse OpenAI response as JSON:', raw, error);
      return res.status(500).json({ error: 'AI response was not valid JSON.' });
    }

    let headers = Array.isArray(parsed.headers) ? parsed.headers : [];
    let answers = Array.isArray(parsed.answers) ? parsed.answers : [];

    if (!headers.length || !answers.length) {
      return res.status(500).json({ error: 'AI response was missing headers or answers.' });
    }

    if (answers.length < MIN_COUNT) {
      console.error('AI response contained too few subjects:', answers.length);
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
    const finalTopic = parsed.topic || topic;

    console.info('[AI subjects] summary', {
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
    console.error('Error generating subjects from OpenAI:', error);
    res.status(500).json({ error: 'Failed to generate subjects.' });
  }
}