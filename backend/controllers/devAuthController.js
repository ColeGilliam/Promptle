/* ===============================================================
 * Dev Auth Controller to support development authentication sessions.
 * Only enabled when DEV_AUTH_ENABLED=true in the environment variables.
 * ==================================================
*/

import { getUsersCollection } from '../config/db.js';
import {
  DEV_AUTH_ENABLED,
  DEV_AUTH0_ID,
  DEV_AUTH_EMAIL,
  DEV_AUTH_NAME,
} from '../config/config.js';

let cachedUsersCollection = null;

function getCachedUsersCollection() {
  if (!cachedUsersCollection) cachedUsersCollection = getUsersCollection();
  return cachedUsersCollection;
}

// Endpoint to get or create a dev auth session based on the DEV_AUTH0_ID environment variable.
export async function getDevAuthSession(_req, res) {
  if (!DEV_AUTH_ENABLED) {
    return res.json({ enabled: false });
  }

  if (!DEV_AUTH0_ID) {
    return res.status(500).json({ error: 'DEV_AUTH0_ID is required when DEV_AUTH_ENABLED=true.' });
  }

  // Upsert the user record in the database based on DEV_AUTH0_ID, and return the user info in the response.
  const usersCollection = getCachedUsersCollection();
  const now = new Date();
  const userRecord = {
    auth0Id: DEV_AUTH0_ID,
    email: DEV_AUTH_EMAIL || null,
    name: DEV_AUTH_NAME || DEV_AUTH_EMAIL || DEV_AUTH0_ID,
  };

  try {
    await usersCollection.updateOne(
      { auth0Id: DEV_AUTH0_ID },
      {
        $set: {
          email: userRecord.email,
          name: userRecord.name,
          lastLogin: now,
        },
        $setOnInsert: {
          auth0Id: DEV_AUTH0_ID,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    return res.json({
      enabled: true,
      user: {
        sub: userRecord.auth0Id,
        email: userRecord.email,
        name: userRecord.name,
      },
    });
  } catch (err) {
    console.error('Error creating dev auth session:', err);
    return res.status(500).json({ error: 'Failed to create dev auth session.' });
  }
}
