// controllers/saveController.js
import { getUsersCollection } from '../config/db.js';
import { appLogger } from '../lib/logger.js';

let cachedUsersCollection = null;
const saveLogger = appLogger.child({ component: 'saved-game' });

function getCachedUsersCollection() {
  if (!cachedUsersCollection) cachedUsersCollection = getUsersCollection();
  return cachedUsersCollection;
}

export async function saveGame(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id, game } = req.body;

  if (!auth0Id) return res.status(400).json({ error: 'Missing auth0Id' });
  if (!game) return res.status(400).json({ error: 'Missing game payload' });

  try {
    const result = await usersCollection.updateOne(
      { auth0Id },
      { $set: { savedGame: { ...game, savedAt: Date.now() } } }
    );

    if (result.matchedCount === 0) {
      // If user record does not exist, return 404 to encourage client to call auth-user first
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    saveLogger.error('saved_game_save_failed', {
      requestId: req.id || null,
      auth0Id,
      error: err,
    });
    return res.status(500).json({ error: 'Server error saving game' });
  }
}

export async function loadGame(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id } = req.params;

  if (!auth0Id) return res.status(400).json({ error: 'Missing auth0Id' });

  try {
    const user = await usersCollection.findOne({ auth0Id }, { projection: { savedGame: 1 } });
    if (!user || !user.savedGame) {
      return res.status(404).json({ error: 'No saved game' });
    }

    return res.json(user.savedGame);
  } catch (err) {
    saveLogger.error('saved_game_load_failed', {
      requestId: req.id || null,
      auth0Id,
      error: err,
    });
    return res.status(500).json({ error: 'Server error loading saved game' });
  }
}

export async function deleteSavedGame(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id } = req.params;

  if (!auth0Id) return res.status(400).json({ error: 'Missing auth0Id' });

  try {
    const result = await usersCollection.updateOne(
      { auth0Id },
      { $unset: { savedGame: '' } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    saveLogger.error('saved_game_delete_failed', {
      requestId: req.id || null,
      auth0Id,
      error: err,
    });
    return res.status(500).json({ error: 'Server error deleting saved game' });
  }
}
