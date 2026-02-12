// controllers/authController.js
import { getUsersCollection } from '../config/db.js';
import { ManagementClient } from 'auth0';

const auth0Manager = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_M2M_CLIENT_ID,
  clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET,
});

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
    console.error('Error in delete-user:', err);
    res.status(500).json({ error: 'Failed to fully delete account' });
  }
}

export async function incrementWin(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id } = req.body;

  if (!auth0Id) return res.status(400).json({ error: 'Missing auth0Id' });

  try {
    const result = await usersCollection.updateOne(
      { auth0Id },
      { $inc: { wins: 1 } } // Increment field by 1
    );
    res.json({ success: true, message: 'Win counted' });
  } catch (err) {
    console.error('Error incrementing win:', err);
    res.status(500).json({ error: 'Server error' });
  }
}