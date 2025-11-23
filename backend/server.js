import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env (Mongo URI, future API keys, etc.)

import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';

const app = express();
app.use(cors());           // Allow frontend (localhost:4200 etc.) to call this API
app.use(express.json());   // Parse JSON request bodies

// Mongo URI from .env (keeps credentials out of source code)
// TODO (future): add a separate DB/cluster or URI for production vs. development.
const uri = process.env.MONGODB_URI;

// Create the MongoDB client
// This is the shared MongoDB connection for the whole server.
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Helper: Turn "releaseYear" -> "Release Year", "target" -> "Target"
function prettyLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function startServer() {
  try {
    // Connect to MongoDB once and keep connection open
    await client.connect();
    console.log("Connected to MongoDB!");

    // Select your database and collection
    // NOTE: "promptle" DB and "J_Demo" collection are the current demo setup.
    // TODO (future): if you add more collections (e.g., prompts, cached topics),
    // create them here too, e.g. const prompts = db.collection("Prompts");
    const db = client.db("promptle");
    const demoCollection = db.collection("J_Demo");

    // Test route
    // Quick health check so you can see the backend is alive.
    app.get("/", (req, res) => {
      res.send("Backend is running!");
    });

    // === YOUR TASK ENDPOINT ===
    // Get one random champion from J_Demo (raw MongoDB document).
    // Currently used mainly for debugging / demo.
    // TODO (future): If you want a "random challenge" endpoint, you can
    // standardize the shape or add filters here.
    app.get("/api/demo/one/random", async (_req, res) => {
      try {
        const docs = await demoCollection
          .aggregate([{ $sample: { size: 1 } }])
          .toArray();

        if (!docs.length) {
          return res.status(404).json({ error: "No documents found" });
        }

        res.json(docs[0]);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
      }
    });

    // Game data endpoint: returns topic, headers, answers[], correctAnswer
    //
    // This endpoint returns data in the same shape as the old mock-data.json:
    // {
    //   topic: string,
    //   headers: string[],
    //   answers: [{ name: string, values: string[] }],
    //   correctAnswer: string
    // }
    //
    // The frontend uses this to:
    //  - fill the dropdown (answers[].name)
    //  - fill the grid columns (headers + answers[].values)
    //  - know which answer is the correct one (correctAnswer)
    //
    // TODO (future, ChatGPT integration):
    //  - Instead of always using J_Demo, you can:
    //      * accept a "topic" or "prompt" from the client (req.query or req.body)
    //      * call ChatGPT to generate a topic + list of entities
    //      * cache those entities & topic in MongoDB
    //      * return the same { topic, headers, answers, correctAnswer } shape.
    //  - This endpoint is the ideal place to add "if cached → read from DB,
    //    else → call ChatGPT + store result".
    app.get("/api/demo/game-data", async (_req, res) => {
      try {
        const docs = await demoCollection.find({}).toArray();
        if (!docs.length) {
          return res.status(404).json({ error: "No documents found in J_Demo" });
        }

        // Use the first doc to determine field order
        const sample = docs[0];

        // Use all keys except _id for the game fields
        const fields = Object.keys(sample).filter((k) => k !== "_id");

        // Headers: pretty labels of those keys
        const headers = fields.map((key) => prettyLabel(key));

        // Answers: same shape as your mock-data.json
        const answers = docs.map((doc) => ({
          // what shows in dropdown
          // NOTE: Right now we assume "character" exists for display. If you switch
          // to other topics (e.g., countries, movies), you can swap this to
          // doc.name or doc.title, etc.
          name: doc.character ?? String(doc[fields[0]] ?? "Unknown"),
          // what fills each column in the grid
          values: fields.map((f) => String(doc[f] ?? ""))
        }));

        // Pick a random correct answer from docs
        // TODO (future): If you want deterministic "daily" puzzles, replace this
        // random choice with a seed based on the date or a given puzzle ID.
        const randomDoc = docs[Math.floor(Math.random() * docs.length)];
        const correctAnswer =
          randomDoc.character ?? String(randomDoc[fields[0]] ?? "Unknown");

        // Topic label for the UI
        // TODO (future): change this to match the current category (e.g., "Movie Guess",
        // "Country Guess") or pull from a "topic" field in the DB/ChatGPT response.
        const topic = "Champion Guess";

        res.json({ topic, headers, answers, correctAnswer });
      } catch (err) {
        console.error("Error building game-data:", err);
        res.status(500).json({ error: "Server error" });
      }
    });

    // Optional: get by id if needed later
    //
    // Currently unused by the Promptle UI, but this can be helpful for
    // admin/debug tools (e.g., view a specific doc in J_Demo).
    // TODO (future): You can repurpose this route for editing/deleting
    // specific entries from an admin page.
    app.get("/api/demo/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const doc = await demoCollection.findOne({ _id: new ObjectId(id) });
        if (!doc) return res.status(404).json({ error: "Not found" });
        res.json(doc);
      } catch (err) {
        res.status(400).json({ error: "Invalid id" });
      }
    });

    // Start HTTP server
    // TODO (future): when you deploy, this port will likely come from the
    // hosting platform (Render, Railway, etc.) via process.env.PORT.
    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });

  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
}

startServer(); // Entry point for starting the backend
