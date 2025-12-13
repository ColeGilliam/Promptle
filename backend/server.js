import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion } from 'mongodb';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());


const uri = process.env.MONGODB_URI;
const port = process.env.PORT || 3001;
const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

if (!uri || typeof uri !== "string" || !uri.trim()) {
  console.error("MONGODB_URI is missing or empty. Set it in your .env (e.g., mongodb+srv://... or mongodb://...).");
  process.exit(1);
}

if (!openaiApiKey) {
  console.warn("OPENAI_API_KEY is not set; /api/subjects will be unavailable.");
}

// Global references
let topicCollection;
let guessesCollection;

// ROUTES

app.get("/", (_req, res) => {
  res.send("Backend is running!");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/subjects", async (req, res) => {
  const { topic, minCategories = 6, maxCategories = 8 } = req.body || {};
  const MIN_COUNT = 7;
  const MAX_COUNT = 100;
  const TARGET_DEFAULT = 20;

  // Cody - Validate topic input
  if (!topic) {
    return res.status(400).json({ error: "Please provide a topic in the request body." });
  }

  // Cody - ensure OpenAI key exists
  if (!openai || !openaiApiKey) {
    return res.status(500).json({ error: "OpenAI API key is missing. Set OPENAI_API_KEY in your environment." });
  }

  // Cody - Code as a template from online, adjusted to be custom
  // Call OpenAI with prompt to generate subjects
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
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
          `
        },
        {
          role: "user",
          content: `
          Topic: "${topic}". 
          Generate distinct subjects and structured categories using the rules above.
          Stay within 7-100 subjects: aim for 15-30 by default, but if the domain is a small finite list under 100 return them all, and if the domain is very large (hundreds) return 80-100 diverse subjects.

          Min categories: ${minCategories}
          Max categories: ${maxCategories}
          `
        }
      ]
    });

    // Cody - Code as a template from online (with prompt template), adjusted to be custom
    // Parse and validate OpenAI response
    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error("Failed to parse OpenAI response as JSON:", raw, error);
      return res.status(500).json({ error: "AI response was not valid JSON." });
    }

    let headers = Array.isArray(parsed.headers) ? parsed.headers : [];
    let answers = Array.isArray(parsed.answers) ? parsed.answers : [];

    // Cody - Validate parsed response
    if (!headers.length || !answers.length) {
      return res.status(500).json({ error: "AI response was missing headers or answers." });
    }

    // Cody - Validate counts
    if (answers.length < MIN_COUNT) {
      console.error("AI response contained too few subjects:", answers.length);
      return res.status(500).json({ error: `AI returned too few subjects. Need at least ${MIN_COUNT}.` });
    }

    headers = headers.slice(0, Math.min(maxCategories, headers.length));
    const targetCount = Math.max(
      MIN_COUNT,
      Math.min(
        MAX_COUNT,
        Math.max(answers.length || TARGET_DEFAULT, MIN_COUNT)
      )
    );

    // Cody - Normalize answers
    answers = answers.slice(0, targetCount).map(answer => {
      const values = Array.isArray(answer.values) ? answer.values.slice(0, headers.length) : [];
      const name = answer.name || values[0] || "";
      return { name, values };
    });

    const correctAnswer = answers[Math.floor(Math.random() * answers.length)];
    const finalTopic = parsed.topic || topic;

    // Cody - Log summary info
    console.info("[AI subjects] summary", {
      topic: finalTopic,
      headersCount: headers.length,
      subjectCount: answers.length,
      targetCount,
      minCategories,
      maxCategories,
      correctAnswer: correctAnswer?.name,
      tokenUsage: completion.usage || "No usage data"
    });

    res.json({
      topic: finalTopic,
      headers,
      answers,
      correctAnswer
    });
  } catch (error) {
    console.error("Error generating subjects from OpenAI:", error);
    res.status(500).json({ error: "Failed to generate subjects." });
  }
});

//Not currently in use
app.get("/api/topics/:topicId/headers", async (req, res) => {
  try {
    const topicId = Number(req.params.topicId);

    if (isNaN(topicId)) {
      return res.status(400).json({ error: "Invalid topicId" });
    }

    const topic = await topicCollection.findOne({ topicId });

    if (!topic) {
      return res.status(404).json({ error: "Topic Not Found" });
    }

    res.json({ headers: topic.headers });

  } catch (err) {
    console.error("Error fetching headers:", err);
    res.status(500).json({ error: "Server error 3" });
  }
});

//Implemented by Cole Gilliam
//Use: This endpoint fills the frontend dropdown with all the toipcs from the database
//Source: Mainly taking insperation from Jorge's earlier code
app.get("/api/popularTopics/list", async (_req, res) => {
  try {
    const topicList = await topicCollection.find({}).toArray();

    if (!topicList.length) {
      return res.status(404).json({ error: "No topics found" });
    }

    const result = topicList.map(t => ({
      topicId: t.topicId,
      topicName: t.topicName
    }));

    res.json(result);

  } catch (err) {
    console.error("Error fetching topics:", err);
    res.status(500).json({ error: "Server error Popular topics" });
  }
});

//Implemented by Cole Gilliam
//Use: This endpoint genorates all the core logic of the game for the frontend
//Source: Refering to other code from Jorge and refactoring

//Query Param 
//EX:
//localhost:3001/api/game/start?topicId=1
// Cody - Code partially from online, adjusted
// Start a new game session
app.get("/api/game/start", async (req, res) => {
  try {
    const topicId = Number(req.query.topicId);
    const includeAnswer = req.query.includeAnswer === "true";

    if (isNaN(topicId)) {
      return res.status(400).json({ error: "Invalid or missing topicId" });
    }

    // --- 
    const topic = await topicCollection.findOne({ topicId });

    if (!topic) {
      return res.status(404).json({ error: "Topic not found" });
    }

    const headers = topic.headers || [];
    const topicName = topic.topicName || "Unknown Topic";

    if (!headers.length) {
      return res.status(500).json({ error: "Topic has no headers defined" });
    }

    // Fetch all guesses for the topic
    const docs = await guessesCollection.find({ topicId }).toArray();

    if (!docs.length) {
      return res.status(404).json({ error: "No guesses found for topic" });
    }

    // Build answers array
    const answers = docs.map(doc => {
      const values = headers.map(h => {
        const val = doc[h];
        if (Array.isArray(val)) return val.join(", ");
        if (val === undefined || val === null) return "";
        return String(val);
      });

      return {
        name: doc.name,
        values
      };
    });

    // Pick a random correct answer if requested
    const correctAnswer = answers[Math.floor(Math.random() * answers.length)];

    // Return json response
    res.json({
      topic: topicName,
      headers,
      answers,
      correctAnswer
    });

  } catch (err) {
    console.error("Error starting game:", err);
    res.status(500).json({ error: "Server error starting game" });
  }
});


// SERVER + DB INIT

async function startServer() {
  try {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      }
    });

    await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("promptle");

    // Assign collections
    topicCollection = db.collection("topic");
    guessesCollection = db.collection("guesses");


    // Start server
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });

    //Richard implemented API for auth0 connection to mongodb for user db storage
    app.post('/api/auth-user', async (req, res) => {
      const { auth0Id, email, name} = req.body;

      if (!auth0Id) return res.status(400).json({ error: 'Missing auth0Id' });

      const users = db.collection('users');

      // Check if user already exists
      const existing = await users.findOne({ auth0Id });

      if (existing) {
        await users.updateOne(
          { auth0Id },
          { $set: { lastLogin: new Date() } }
        );
        return res.json({ status: 'existing-user-updated' });
      }

      // Create new user
      await users.insertOne({
        auth0Id,
        email,
        name,
        createdAt: new Date(),
        lastLogin: new Date()
      });

      res.json({ status: 'new-user-created' });
    });

  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
}

startServer();
