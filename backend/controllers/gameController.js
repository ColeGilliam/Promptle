// controllers/gameController.js
import { getTopicCollection, getGuessesCollection, getMultiplayerGamesCollection, getUsersCollection }
from '../config/db.js';
import { generateSubjects } from './subjectController.js';  // adjust path if needed
import { getIo } from '../sockets/socketState.js';

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
async function buildGameData(topicIdentifier, isNumericId = true, answerOverride = null) {
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

  // Pick correct answer — use override if provided (share link seeding), else random
  const overrideMatch = answerOverride
    ? answers.find(a => a.name === answerOverride)
    : null;
  const correctAnswer = overrideMatch ?? answers[Math.floor(Math.random() * answers.length)];

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
    const { topicId, room, answer } = req.query;

    let gameData;

    if (room) {
      // Multiplayer mode – load saved snapshot
      const coll = getMultiplayerGamesColl();
      gameData = await coll.findOne({ _id: room });

      if (!gameData) {
        return res.status(404).json({ error: 'Room not found or expired' });
      }

      if (gameData.started) {
        return res.status(403).json({ error: 'This game has already started and cannot be joined' });
      }

      // Remove internal fields before sending (keep mode)
      delete gameData._id;
      delete gameData.createdAt;
      delete gameData.expiresAt;
      delete gameData.started;
      delete gameData.isMultiplayer;

    } else if (topicId) {
      // Single-player classic mode (answer param seeds a specific correct answer)
      gameData = await buildGameData(topicId, true, answer || null);
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
    const { topic, id, mode, auth0Id } = req.body;

    // ── All multiplayer room creation is restricted to the dev account ──
    if (!(await isDevAccount(auth0Id))) {
      return res.status(403).json({ error: 'Multiplayer room creation is restricted to the dev account.' });
    }

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
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),  // 20min TTL (unstarted)
      started: false,
      isMultiplayer: true,
      mode: mode || 'standard',
      source: topic ? 'ai' : 'db'
    });

    console.log(`Multiplayer room created: ${roomId} (${topic ? 'AI' : 'DB'})`);

    res.status(201).json({ roomId });

  } catch (error) {
    console.error('createMultiplayerGame error:', error.message || error);
    console.error(error.stack);
    res.status(500).json({ error: 'Failed to create multiplayer game: ' + (error.message || 'unknown') });
  }
};

// ────────────────────────────────────────────────
// List all active (non-expired) multiplayer rooms
// ────────────────────────────────────────────────
export async function listRooms(req, res) {
  try {
    const coll = getMultiplayerGamesColl();
    const now = new Date();

    // MongoDB driver v6 requires cursor methods instead of a second options arg
    const rooms = await coll
      .find({ expiresAt: { $gt: now }, started: { $ne: true } })
      .project({ _id: 1, topic: 1, createdAt: 1, source: 1, mode: 1 })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    console.log(`[listRooms] Found ${rooms.length} active room(s)`);

    // Enrich with live player count from the socket.io adapter
    const io = getIo();
    const enriched = rooms.map(room => {
      let playerCount = 0;
      if (io) {
        const socketRoom = io.sockets.adapter.rooms.get(room._id);
        playerCount = socketRoom ? socketRoom.size : 0;
      }
      return {
        roomId: room._id,
        topic: room.topic,
        playerCount,
        createdAt: room.createdAt,
        source: room.source || 'db',
        mode: room.mode || 'standard',
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('listRooms error:', err);
    res.status(500).json({ error: 'Failed to list rooms' });
  }
}

// ────────────────────────────────────────────────
// Mark a room as started (called by socket handler)
// ────────────────────────────────────────────────
// ────────────────────────────────────────────────
// Get a room's game mode (used by socket handler)
// ────────────────────────────────────────────────
export async function getRoomMode(roomId) {
  try {
    const coll = getMultiplayerGamesColl();
    const doc = await coll.findOne({ _id: roomId }, { projection: { mode: 1 } });
    return doc?.mode || 'standard';
  } catch {
    return 'standard';
  }
}

export async function markRoomStarted(roomId) {
  try {
    const coll = getMultiplayerGamesColl();
    await coll.updateOne({ _id: roomId }, { $set: { started: true } });
    console.log(`[markRoomStarted] Room ${roomId} marked as started`);
  } catch (err) {
    console.error('[markRoomStarted] error:', err);
  }
}

// ────────────────────────────────────────────────
// Delete a room (dev account only)
// ────────────────────────────────────────────────
export async function deleteRoom(req, res) {
  try {
    const { roomId } = req.params;
    const { auth0Id } = req.body;

    if (!(await isDevAccount(auth0Id))) {
      return res.status(403).json({ error: 'Only the dev account can delete rooms.' });
    }

    const coll = getMultiplayerGamesColl();
    const result = await coll.deleteOne({ _id: roomId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    console.log(`[deleteRoom] Room ${roomId} deleted by dev account`);
    res.json({ success: true });
  } catch (err) {
    console.error('deleteRoom error:', err);
    res.status(500).json({ error: 'Failed to delete room.' });
  }
}