import { getUsersCollection } from '../config/db.js';
import { ManagementClient } from 'auth0';
import { appLogger } from '../lib/logger.js';

const auth0Manager = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_M2M_CLIENT_ID,
  clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET,
});
const authLogger = appLogger.child({ component: 'auth' });

let cachedUsersCollection = null;

function getCachedUsersCollection() {
  if (!cachedUsersCollection) {
    cachedUsersCollection = getUsersCollection();
  }
  return cachedUsersCollection;
}

export async function authUser(req, res) {
  const usersCollection = getCachedUsersCollection();

  const { auth0Id, email, name } = req.body;

  if (!auth0Id) {
    return res.status(400).json({ error: 'Missing auth0Id' });
  }

  try {
    const existing = await usersCollection.findOne({ auth0Id });

    if (existing) {
      await usersCollection.updateOne(
        { auth0Id },
        { $set: { lastLogin: new Date() } }
      );
      return res.json({ status: 'existing-user-updated' });
    }

    await usersCollection.insertOne({
      auth0Id,
      email,
      name,
      createdAt: new Date(),
      lastLogin: new Date(),
    });

    res.json({ status: 'new-user-created' });
  } catch (err) {
    authLogger.error('auth_user_failed', {
      requestId: req.id || null,
      auth0Id,
      error: err,
    });
    res.status(500).json({ error: 'Server error in auth' });
  }
}

export async function deleteUserAccount(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id } = req.params;

  if (!auth0Id) {
    return res.status(400).json({ error: 'Missing auth0Id' });
  }

  try {
    await auth0Manager.users.delete(auth0Id);

    const result = await usersCollection.deleteOne({ auth0Id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found in local database' });
    }

    res.json({ status: 'account-deleted-successfully' });
  } catch (err) {
    authLogger.error('delete_user_failed', {
      requestId: req.id || null,
      auth0Id,
      error: err,
    });
    res.status(500).json({ error: 'Failed to fully delete account' });
  }
}

export async function incrementWin(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id, guessCount, finishMs } = req.body;

  if (!auth0Id) return res.status(400).json({ error: 'Missing auth0Id' });

  try {
    const user = await usersCollection.findOne(
      { auth0Id },
      { projection: { winStreak: 1, bestStreak: 1 } }
    );
    const currentStreak = user?.winStreak ?? 0;
    const newStreak = currentStreak + 1;
    const newBest = Math.max(newStreak, user?.bestStreak ?? 0);

    const inc = { wins: 1 };
    if (typeof guessCount === 'number' && guessCount > 0) inc.totalGuesses = guessCount;
    if (typeof finishMs === 'number' && finishMs > 0) {
      inc.totalFinishMs = finishMs;
      inc.timedWins = 1;
    }

    await usersCollection.updateOne(
      { auth0Id },
      { $inc: inc, $set: { winStreak: newStreak, bestStreak: newBest } }
    );
    res.json({ success: true, message: 'Win counted' });
  } catch (err) {
    authLogger.error('increment_win_failed', {
      requestId: req.id || null,
      auth0Id,
      error: err,
    });
    res.status(500).json({ error: 'Server error' });
  }
}
