import { getUsersCollection } from '../config/db.js';
import {
  moderateProfileImage,
  moderateProfileUsername,
  profileModerationOpenAI,
  PFP_VALIDATION_FAILED_ERROR,
  USERNAME_VALIDATION_FAILED_ERROR,
} from '../services/profileModeration.js';

let cachedUsersCollection = null;
function getCachedUsersCollection() {
  if (!cachedUsersCollection) cachedUsersCollection = getUsersCollection();
  return cachedUsersCollection;
}

export async function getProfile(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id } = req.params;

  try {
    const user = await usersCollection.findOne({ auth0Id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching profile' });
  }
}

export async function updateProfile(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id, username, profilePic } = req.body || {};

  if (!auth0Id) {
    return res.status(400).json({ error: 'Missing auth0Id' });
  }

  try {
    const existingUser = await usersCollection.findOne({ auth0Id });
    const requestedUsername = typeof username === 'string' ? username.trim() : '';

    let usernameModeration = {
      allowed: true,
      normalizedUsername: '',
      flaggedCategories: [],
    };

    // An empty username means "use the default Player fallback" instead of a custom name.
    if (requestedUsername) {
      try {
        usernameModeration = await moderateProfileUsername({
          openaiClient: profileModerationOpenAI,
          username: requestedUsername,
        });
      } catch (error) {
        console.error('Username moderation failed:', error);
        return res.status(500).json({
          error: USERNAME_VALIDATION_FAILED_ERROR,
          code: 'profile_username_validation_failed',
        });
      }

      if (!usernameModeration.allowed) {
        return res.status(400).json({
          error: usernameModeration.error,
          code: usernameModeration.code,
          reasons: usernameModeration.flaggedCategories ?? [],
        });
      }
    }

    const requestedProfilePic = typeof profilePic === 'string'
      ? profilePic
      : existingUser?.profilePic || '';
    const shouldModerateImage =
      typeof requestedProfilePic === 'string' &&
      requestedProfilePic !== (existingUser?.profilePic || '');
    let nextProfilePic = requestedProfilePic;

    // Only re-moderate the image when the user actually changed it.
    if (shouldModerateImage) {
      let imageModeration;
      try {
        imageModeration = await moderateProfileImage({
          openaiClient: profileModerationOpenAI,
          profilePic: requestedProfilePic,
        });
      } catch (error) {
        console.error('Profile image moderation failed:', error);
        return res.status(500).json({
          error: PFP_VALIDATION_FAILED_ERROR,
          code: 'profile_image_validation_failed',
        });
      }

      if (!imageModeration.allowed) {
        return res.status(400).json({
          error: imageModeration.error,
          code: imageModeration.code,
          reasons: imageModeration.reasons ?? [],
        });
      }

      nextProfilePic = requestedProfilePic;
    }

    await usersCollection.updateOne(
      { auth0Id },
      {
        $set: {
          username: usernameModeration.normalizedUsername,
          profilePic: nextProfilePic,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.json({
      message: 'Success',
      username: usernameModeration.normalizedUsername,
      profilePic: nextProfilePic,
    });
  } catch (err) {
    console.error('Database Error:', err);
    return res.status(500).json({ error: 'Failed to save' });
  }
}
