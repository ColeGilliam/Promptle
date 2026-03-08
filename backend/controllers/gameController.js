// controllers/gameController.js
import { getTopicCollection, getGuessesCollection, getMultiplayerGamesCollection } 
from '../config/db.js';
import { generateSubjects } from './subjectController.js';  // adjust path if needed

// Cache collections (your existing pattern)
let cachedTopicCollection = null;
let cachedGuessesCollection = null;
let cachedMultiplayerGamesCollection = null;

function getTopicColl() {
  if (!cachedTopicCollection) cachedTopicCollection = getTopicCollection();
  return cachedTopicCollection;
}

function getGuessesColl() {
  if (!cachedGuessesCollection) cachedGuessesCollection = getGuessesCollection();
  return cachedGuessesCollection;
}

function getMultiplayerGamesColl() {
  if (!cachedMultiplayerGamesCollection) cachedMultiplayerGamesCollection = getMultiplayerGamesCollection();
  return cachedMultiplayerGamesCollection;
}

// ────────────────────────────────────────────────
// Shared logic: build full game data from a topic
// ────────────────────────────────────────────────
async function buildGameData(topicIdentifier, isNumericId = true) {
  const topicColl = getTopicColl();
  const guessesColl = getGuessesColl();

  let topicQuery;

  if (isNumericId) {
    topicQuery = { topicId: Number(topicIdentifier) };
  } else {
    topicQuery = { topicName: topicIdentifier };   // custom topic match
  }

  const topic = await topicColl.findOne(topicQuery);

  if (!topic) throw new Error('Topic not found');

  const headers = topic.headers || [];
  const topicName = topic.topicName || 'Unknown Topic';

  if (!headers.length) throw new Error('Topic has no headers defined');

  // For numeric topicId we use topic.topicId; for custom we assume it's stored
  const searchTopicId = topic.topicId || topicIdentifier;

  const docs = await guessesColl.find({ topicId: searchTopicId }).toArray();

  if (!docs.length) throw new Error('No guesses found for topic');

  const answers = docs.map((doc) => {
    const values = headers.map((h) => {
      const val = doc[h];
      if (Array.isArray(val)) return val.join(', ');
      if (val === undefined || val === null) return '';
      return String(val);
    });
    return { name: doc.name, values };
  });

  // Pick one correct answer (random once per room)
  const correctAnswer = answers[Math.floor(Math.random() * answers.length)];

  return {
    topic: topicName,
    headers,
    answers,
    correctAnswer,
  };
}

// ────────────────────────────────────────────────
// Helper: generate 6-char room code
// ────────────────────────────────────────────────
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ────────────────────────────────────────────────
// Helper: check if room code already exists
// ────────────────────────────────────────────────
async function roomExists(roomId) {
  const coll = getMultiplayerGamesColl();
  return !!(await coll.findOne({ _id: roomId }));
}

// ────────────────────────────────────────────────
// Existing endpoint – now also supports ?room=XXXXXX
// ────────────────────────────────────────────────
export async function startGame(req, res) {
  try {
    const { topicId, room } = req.query;

    let gameData;

    if (room) {
      // Multiplayer mode – load saved snapshot
      const coll = getMultiplayerGamesColl();
      gameData = await coll.findOne({ _id: room });

      if (!gameData) {
        return res.status(404).json({ error: 'Room not found or expired' });
      }

      // Remove internal fields before sending
      delete gameData._id;
      delete gameData.createdAt;
      delete gameData.expiresAt;
      delete gameData.isMultiplayer;

    } else if (topicId) {
      // Single-player classic mode
      gameData = await buildGameData(topicId, true);
    } else {
      return res.status(400).json({ error: 'Missing topicId or room' });
    }

    res.json(gameData);
  } catch (err) {
    console.error('startGame error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}

// ────────────────────────────────────────────────
// Create new multiplayer room + save snapshot
// ────────────────────────────────────────────────
export const createMultiplayerGame = async (req, res) => {
  try {
    const { topic, id } = req.body;

    let gameData;

    if (topic) {
      // ── AI / custom topic path ──
      console.log('Generating AI game for custom topic:', topic);

      // Simulate the POST body your generateSubjects expects
      const aiReq = {
        body: {
          topic: topic.trim(),
          minCategories: 6,
          maxCategories: 8
        }
      };

      const aiRes = {
        status: (code) => ({ json: (data) => { throw new Error(`AI failed with ${code}: ${JSON.stringify(data)}`) } }),
        json: (data) => data  // success case
      };

      // Call your existing function (it uses res.json on success)
      const aiOutput = await new Promise((resolve, reject) => {
        aiRes.json = resolve;
        aiRes.status = (code) => ({
          json: (errData) => reject(new Error(`AI error ${code}: ${JSON.stringify(errData)}`))
        });
        generateSubjects(aiReq, aiRes);
      });

      if (!aiOutput || !aiOutput.topic || !aiOutput.headers || !aiOutput.answers) {
        return res.status(500).json({ error: 'AI generation failed to produce valid game data' });
      }

      gameData = aiOutput;

    } else if (id) {
      // ── Existing numeric topic from DB ──
      console.log('Using existing topicId:', id);
      gameData = await buildGameData(id, true);
    } else {
      return res.status(400).json({ error: 'Either "topic" (custom) or "id" (existing) required' });
    }

    // ── Common save logic ──
    let roomId = generateRoomCode();
    let attempts = 0;
    while (await roomExists(roomId) && attempts < 5) {
      roomId = generateRoomCode();
      attempts++;
    }

    if (await roomExists(roomId)) {
      return res.status(500).json({ error: 'Failed to generate unique room code' });
    }

    const coll = getMultiplayerGamesColl();
    await coll.insertOne({
      _id: roomId,
      ...gameData,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),  // 24h TTL
      isMultiplayer: true,
      source: topic ? 'ai' : 'db'   // optional: track how it was created
    });

    console.log(`Multiplayer room created: ${roomId} (${topic ? 'AI' : 'DB'})`);

    res.status(201).json({ roomId });

  } catch (error) {
    console.error('createMultiplayerGame error:', error.message || error);
    console.error(error.stack);
    res.status(500).json({ error: 'Failed to create multiplayer game: ' + (error.message || 'unknown') });
  }
};