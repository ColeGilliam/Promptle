import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';

const app = express();
app.use(cors());
app.use(express.json());

// Mongo URI from .env (keeps credentials out of source code)
// TODO (future): add a separate DB/cluster or URI for production vs. development.
const uri = process.env.MONGODB_URI;

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

//Start Server
async function startServer() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("promptle");
    const guessesCollection = db.collection("guesses");
    const topicCollection = db.collection("topic");

    app.get("/", (req, res) => {
      res.send("Backend is running!");
    });

    app.get("/api/topics/:topicId/headers", async (req, res) => {
      try {
        const topicId = Number(req.params.topicId);
        if (isNaN(topicId)) {
          return res.status(400).json({ error: "Invalid topicId" });
        }

        const topic = await topicCollection.findOne({ topicId: topicId });

        if (!topic) {
          return res.status(404).json({ error: "Topic Not Found" });
        }

        res.json({ headers: topic.headers });
      } catch (err) {
        console.error("Error fetching headers:", err);
        res.status(500).json({ error: "Server error 3" });
      }
    });

    //Get popular topics list with ID
    app.get("/api/popularTopics/list", async (_req, res) =>{
      try{
        const topicList = await topicCollection.find({}).toArray();
        if(!topicList.length){
          return res.status(404).json({error: "No values Found for topics"});
        }
        const result = topicList.map(t => ({
          topicId: t.topicId,
          topicName: t.topicName
        }));
        
        res.json(result);
      } catch (err){
        console.error(err);
        res.status(500).json({error: "Server error Popular topics"})
      }
    });

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
        res.status(500).json({ error: "Server error 2" });
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
        res.status(500).json({ error: "Server error 1" });
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

startServer(); // Entry point for starting the backend
