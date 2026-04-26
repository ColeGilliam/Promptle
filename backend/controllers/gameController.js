// controllers/gameController.js
import { getTopicCollection, getGuessesCollection, getMultiplayerGamesCollection, getUsersCollection }
from '../config/db.js';
import { generateSubjects } from './subjectController.js';  // adjust path if needed
import { getIo } from '../sockets/socketState.js';
import { fetchDevSettings } from '../services/devSettings.js';
import { normalizeGameAnswer, normalizeGamePayload } from '../services/gameCells.js';
import { appLogger } from '../lib/logger.js';

const DEV_EMAIL = 'promptle99@gmail.com';
const gameLogger = appLogger.child({ component: 'multiplayer' });

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
async function buildGameData(topicIdentifier, isNumericId = true, fixedAnswer = null) {
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
  const columns = Array.isArray(topic.columns) && topic.columns.length
    ? topic.columns
    : headers.map((header, index) => ({
        header,
        ...(Array.isArray(topic.columnKinds) && typeof topic.columnKinds[index] === 'string'
          ? { kind: topic.columnKinds[index] }
          : {}),
        ...(index === 0 ? { kind: 'text' } : {}),
      }));
  const topicName = topic.topicName || 'Unknown Topic';

  if (!headers.length) throw new Error('Topic has no headers defined');

  // For numeric topicId we use topic.topicId; for custom we assume it's stored
  const searchTopicId = topic.topicId || topicIdentifier;

  const docs = await guessesColl.find({ topicId: searchTopicId }).toArray();

  if (!docs.length) throw new Error('No guesses found for topic');

  const answers = docs.map((doc) => {
    const cells = headers.map((h) => {
      const val = doc[h];
      return val;
    });
    return normalizeGameAnswer({ name: doc.name, cells }, columns);
  });

  // Pick correct answer — use override if provided (share link seeding), else random
  const selectedAnswer = fixedAnswer
    ? answers.find(a => a.name === fixedAnswer)
    : null;
  const correctAnswer = selectedAnswer ?? answers[Math.floor(Math.random() * answers.length)];

  return normalizeGamePayload({
    topic: topicName,
    columns,
    answers,
    correctAnswer,
  });
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
    const { topicId, room, answer: fixedAnswer } = req.query;

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
      gameData = normalizeGamePayload(gameData);

    } else if (topicId) {
      // Single-player classic mode (answer param seeds a specific correct answer)
      gameData = await buildGameData(topicId, true, fixedAnswer || null);
    } else {
      return res.status(400).json({ error: 'Missing topicId or room' });
    }

    res.json(gameData);
  } catch (err) {
    gameLogger.error('start_game_failed', {
      requestId: req.id || null,
      topicId: req.query?.topicId || null,
      room: req.query?.room || null,
      fixedAnswer: req.query?.answer || null,
      error: err,
    });
    res.status(500).json({ error: err.message || 'Server error' });
  }
}

// ────────────────────────────────────────────────
// Create new multiplayer room + save snapshot
// ────────────────────────────────────────────────
export const createMultiplayerGame = async (req, res) => {
  try {
    const { topic, id, mode, auth0Id } = req.body;
    const normalizedTopic = typeof topic === 'string' ? topic.trim() : '';

    const isDevUser = await isDevAccount(auth0Id);

    if (!isDevUser) {
      const settings = await fetchDevSettings();
      if (topic && !settings.allowAllAIGeneration) {
        return res.status(403).json({ error: 'AI game generation is restricted to the dev account.' });
      }
      if (id && !settings.allowGuestsCreateRooms) {
        return res.status(403).json({ error: 'Multiplayer room creation is restricted to the dev account.' });
      }
    }

    let gameData;

    if (normalizedTopic) {
      // ── AI / custom topic path ──
      gameLogger.debug('multiplayer_ai_generation_requested', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topic: normalizedTopic,
        mode: mode || 'standard',
      });

      // Simulate the POST body your generateSubjects expects
      const aiReq = {
        id: req.id,
        body: {
          topic: normalizedTopic,
          auth0Id,
        }
      };

      const aiRes = {
        status: (code) => ({ json: (data) => { throw new Error(`AI failed with ${code}: ${JSON.stringify(data)}`) } }),
        json: (data) => data  // success case
      };

      // Use a Promise wrapper to capture the async result from generateSubjects
      const aiOutput = await new Promise((resolve, reject) => {
        aiRes.json = resolve;
        aiRes.status = (code) => ({
          // Override to capture error responses from generateSubjects
          json: (errData) => {
            const error = new Error(errData?.error || `AI error ${code}`);
            error.statusCode = code;
            error.payload = errData;
            reject(error);
          }
        });
        Promise.resolve(generateSubjects(aiReq, aiRes)).catch(reject); // Handle any unexpected errors thrown by generateSubjects
      });

      if (!aiOutput || !aiOutput.topic || !aiOutput.headers || !aiOutput.answers) {
        gameLogger.error('multiplayer_ai_generation_invalid_payload', {
          requestId: req.id || null,
          auth0Id: auth0Id || null,
          topic: normalizedTopic,
          mode: mode || 'standard',
        });
        return res.status(500).json({ error: 'AI generation failed to produce valid game data' });
      }

      gameData = normalizeGamePayload(aiOutput);

    } else if (id) {
      // ── Existing numeric topic from DB ──
      gameLogger.debug('multiplayer_existing_topic_selected', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topicId: id,
        mode: mode || 'standard',
      });
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
      gameLogger.error('multiplayer_room_code_generation_failed', {
        requestId: req.id || null,
        auth0Id: auth0Id || null,
        topicId: id || null,
        topic: normalizedTopic || null,
        attempts,
      });
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
      source: normalizedTopic ? 'ai' : 'db'
    });

    gameLogger.debug('multiplayer_room_created', {
      requestId: req.id || null,
      auth0Id: auth0Id || null,
      roomId,
      topicId: id || null,
      topic: normalizedTopic || null,
      mode: mode || 'standard',
      source: normalizedTopic ? 'ai' : 'db',
    });

    res.status(201).json({ roomId });

  } catch (error) {
    if (error?.statusCode) {
      if (error.statusCode >= 500) {
        gameLogger.error('multiplayer_room_creation_failed', {
          requestId: req.id || null,
          auth0Id: req.body?.auth0Id || null,
          topicId: req.body?.id || null,
          topic: typeof req.body?.topic === 'string' ? req.body.topic.trim() : null,
          mode: req.body?.mode || 'standard',
          statusCode: error.statusCode,
          payload: error.payload || null,
          error,
        });
      }
      return res.status(error.statusCode).json(error.payload || { error: error.message || 'Failed to create multiplayer game' });
    }

    gameLogger.error('multiplayer_room_creation_failed', {
      requestId: req.id || null,
      auth0Id: req.body?.auth0Id || null,
      topicId: req.body?.id || null,
      topic: typeof req.body?.topic === 'string' ? req.body.topic.trim() : null,
      mode: req.body?.mode || 'standard',
      error,
    });
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

    gameLogger.debug('multiplayer_rooms_listed', {
      requestId: req.id || null,
      roomCount: rooms.length,
    });

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
    gameLogger.error('multiplayer_room_list_failed', {
      requestId: req.id || null,
      error: err,
    });
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
  } catch (error) {
    gameLogger.error('multiplayer_room_mode_lookup_failed', {
      roomId,
      error,
    });
    return 'standard';
  }
}

export async function markRoomStarted(roomId) {
  try {
    const coll = getMultiplayerGamesColl();
    await coll.updateOne({ _id: roomId }, { $set: { started: true } });
    gameLogger.debug('multiplayer_room_started', { roomId });
  } catch (err) {
    gameLogger.error('multiplayer_room_start_mark_failed', {
      roomId,
      error: err,
    });
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

    gameLogger.debug('multiplayer_room_deleted', {
      requestId: req.id || null,
      roomId,
      auth0Id,
    });
    res.json({ success: true });
  } catch (err) {
    gameLogger.error('multiplayer_room_delete_failed', {
      requestId: req.id || null,
      roomId: req.params?.roomId || null,
      auth0Id: req.body?.auth0Id || null,
      error: err,
    });
    res.status(500).json({ error: 'Failed to delete room.' });
  }
}
