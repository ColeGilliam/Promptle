
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import OpenAI from 'openai';

// Initialize Express app and OpenAI client
const app = express();
const port = process.env.PORT || 3000;
const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: openaiApiKey });

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Endpoint to generate subjects based on a topic
app.post('/api/subjects', async (req, res) => {
  const { topic, count, minCategories = 6, maxCategories = 8 } = req.body || {}; // Destructure request body with defaults
  const MIN_COUNT = 7; // Minimum 7 subjects
  const MAX_COUNT = 100; // Maximum 100 subjects
  const TARGET_DEFAULT = 20; // Default aim for 20 subjects unless specified otherwise

  // No topic provided gaurd clause
  if (!topic) {
    return res.status(400).json({ error: 'Please provide a topic in the request body.' });
  }

  // No API key gaurd clause
  if (!openaiApiKey) {
    return res.status(500).json({ error: 'OpenAI API key is missing. Set OPENAI_API_KEY in your environment.' });
  }

  // Call OpenAI to generate subjects
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
            (1) Subject count must be between 7-100, aim for 10–30 most of the time unless:
             - the topic has a small finite roster under 100 (e.g., NFL teams, U.S. states), then include them all.
             - if the topic has substantially more than 100 subjects, select around 80–100 different subjects. 
            (2) Total number of headers, including "Subject", must be between the provided min and max number of categories, and should be sufficient enough to properly describe and identify the subject.
            (3) The first header is "Subject". The first value for each answer must match the subject name.
            (4) All answers must share identical header structure and value ordering.
            (5) Keep values concise (1-3 words).
          `
        },
        {
          role: 'user',
          content: `
          Topic: "${topic}". 
          Generate distinct subjects and structured categories using the rules above.

          Min categories: ${minCategories}
          Max categories: ${maxCategories}
          `
        }
      ]
    });

    // Log token usage for monitoring
    console.log('TOKEN USAGE (subjects):', completion.usage);

    // Parse and validate the response
    const raw = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error('Failed to parse OpenAI response as JSON:', raw, error);
      return res.status(500).json({ error: 'AI response was not valid JSON.' });
    }

    // Validate structure
    let headers = Array.isArray(parsed.headers) ? parsed.headers : [];
    let answers = Array.isArray(parsed.answers) ? parsed.answers : [];

    if (!headers.length || !answers.length) {
      return res.status(500).json({ error: 'AI response was missing headers or answers.' });
    }

    // Enforce bounds: clamp headers count and subject count; align values to headers length
    headers = headers.slice(0, Math.min(maxCategories, headers.length));
    const requestedCount = Number(count);
    const targetCount = Number.isFinite(requestedCount)
      ? Math.max(MIN_COUNT, Math.min(MAX_COUNT, requestedCount))
      : Math.max(
          MIN_COUNT,
          Math.min(
            MAX_COUNT,
            // Prefer what the model returned; fall back toward 20 if missing
            Math.max(answers.length || TARGET_DEFAULT, MIN_COUNT)
          )
        );

    answers = answers.slice(0, targetCount).map(answer => {
      const values = Array.isArray(answer.values) ? answer.values.slice(0, headers.length) : [];
      return { ...answer, values };
    });

    // Select a random correct answer from the generated list
    const correctAnswer = answers[Math.floor(Math.random() * answers.length)]?.name;

    // Return the structured subjects data
    res.json({
      topic: parsed.topic || topic,
      headers,
      answers,
      correctAnswer
    });
  } catch (error) {
    console.error('Error generating subjects from OpenAI:', error);
    res.status(500).json({ error: 'Failed to generate subjects.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Promptle backend listening on http://localhost:${port}`);
});
