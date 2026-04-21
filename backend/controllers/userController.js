import { getUsersCollection } from '../config/db.js';
import {
  moderateProfileImage,
  moderateProfileUsername,
  profileModerationOpenAI,
  PFP_VALIDATION_FAILED_ERROR,
  USERNAME_VALIDATION_FAILED_ERROR,
} from '../services/profileModeration.js';
import { appLogger } from '../lib/logger.js';

let cachedUsersCollection = null;
const userLogger = appLogger.child({ component: 'profile' });

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
    userLogger.error('profile_fetch_failed', {
      requestId: req.id || null,
      auth0Id,
      error: err,
    });
    res.status(500).json({ error: 'Error fetching profile' });
  }
}

export async function updateProfile(req, res) {
  const usersCollection = getCachedUsersCollection();
  const { auth0Id, username, profilePic } = req.body || {};
  const requestedUsername = typeof username === 'string' ? username.trim() : '';
  let shouldModerateImage = false;

  if (!auth0Id) {
    return res.status(400).json({ error: 'Missing auth0Id' });
  }

  try {
    const existingUser = await usersCollection.findOne({ auth0Id });

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
        userLogger.error('profile_username_moderation_failed', {
          requestId: req.id || null,
          auth0Id,
          requestedUsername,
          error,
        });
        return res.status(500).json({
          error: USERNAME_VALIDATION_FAILED_ERROR,
          code: 'profile_username_validation_failed',
        });
      }

      if (!usernameModeration.allowed) {
        userLogger.info('profile_username_blocked', {
          requestId: req.id || null,
          auth0Id,
          requestedUsername,
          code: usernameModeration.code,
          reasons: usernameModeration.flaggedCategories ?? [],
        });
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
    shouldModerateImage =
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
        userLogger.error('profile_image_moderation_failed', {
          requestId: req.id || null,
          auth0Id,
          imageLength: requestedProfilePic.length,
          error,
        });
        return res.status(500).json({
          error: PFP_VALIDATION_FAILED_ERROR,
          code: 'profile_image_validation_failed',
        });
      }

      if (!imageModeration.allowed) {
        userLogger.info('profile_image_blocked', {
          requestId: req.id || null,
          auth0Id,
          code: imageModeration.code,
          reasons: imageModeration.reasons ?? [],
          imageLength: requestedProfilePic.length,
        });
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
    userLogger.error('profile_save_failed', {
      requestId: req.id || null,
      auth0Id,
      requestedUsername,
      hasProfilePicUpdate: Boolean(shouldModerateImage),
      error: err,
    });
    return res.status(500).json({ error: 'Failed to save' });
  }
}
