import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion } from 'mongodb';

const app = express();
app.use(cors());
app.use(express.json());


const uri = process.env.MONGODB_URI;
const port = process.env.PORT || 3001;

// Global references
let topicCollection;
let guessesCollection;

// ROUTES

app.get("/", (_req, res) => {
  res.send("Backend is running!");
});

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

//Query Param 
//EX:
//localhost:3001/api/game/start?topicId=1
app.get("/api/game/start", async (req, res) => {
  try {
    const topicId = Number(req.query.topicId);
    const includeAnswer = req.query.includeAnswer === "true";

    if (isNaN(topicId)) {
      return res.status(400).json({ error: "Invalid or missing topicId" });
    }

    // --- fetch topic meta: name + headers ---
    const topic = await topicCollection.findOne({ topicId });

    if (!topic) {
      return res.status(404).json({ error: "Topic not found" });
    }

    const headers = topic.headers || [];
    const topicName = topic.topicName || "Unknown Topic";

    if (!headers.length) {
      return res.status(500).json({ error: "Topic has no headers defined" });
    }

    // --- fetch all guesses for topic ---
    const docs = await guessesCollection.find({ topicId }).toArray();

    if (!docs.length) {
      return res.status(404).json({ error: "No guesses found for topic" });
    }

    // --- build the answers array ---
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

    // --- pick a random correct answer ---
    const correctAnswer = answers[Math.floor(Math.random() * answers.length)];

    // --- return normalized JSON matching AI structure ---
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

  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
}

startServer();
