// controllers/authController.js
import { getUsersCollection } from '../config/db.js';

// Module-level cache (initialized on first use)
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
    console.error('Error in auth-user:', err);
    res.status(500).json({ error: 'Server error in auth' });
  }
}