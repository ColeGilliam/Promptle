// controllers/devSettingsController.js
import { getDevSettingsCollection, getUsersCollection } from '../config/db.js';
import { appLogger } from '../lib/logger.js';
const DEV_EMAIL = 'promptle99@gmail.com';
const SETTINGS_ID = 'global';
const devSettingsLogger = appLogger.child({ component: 'dev-settings' });

const DEFAULT_SETTINGS = {
  allowGuestsCreateRooms: false,
  allowAllAIGeneration: false,
};

async function isDevAccount(auth0Id) {
  if (!auth0Id) return false;
  try {
    const user = await getUsersCollection().findOne({ auth0Id });
    return user?.email === DEV_EMAIL;
  } catch {
    return false;
  }
}

// Used by other controllers to read current settings
export async function fetchDevSettings() {
  try {
    const doc = await getDevSettingsCollection().findOne({ _id: SETTINGS_ID });
    return { ...DEFAULT_SETTINGS, ...(doc || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function getDevSettings(req, res) {
  try {
    const settings = await fetchDevSettings();
    res.json({
      allowGuestsCreateRooms: settings.allowGuestsCreateRooms,
      allowAllAIGeneration: settings.allowAllAIGeneration,
    });
  } catch (err) {
    devSettingsLogger.error('dev_settings_load_failed', {
      requestId: req.id || null,
      error: err,
    });
    res.status(500).json({ error: 'Failed to load settings.' });
  }
}

export async function updateDevSettings(req, res) {
  try {
    const { auth0Id, allowGuestsCreateRooms, allowAllAIGeneration } = req.body;

    if (!(await isDevAccount(auth0Id))) {
      return res.status(403).json({ error: 'Only the dev account can update settings.' });
    }

    const coll = getDevSettingsCollection();
    await coll.updateOne(
      { _id: "global" },
      { $set: { allowGuestsCreateRooms: !!allowGuestsCreateRooms, allowAllAIGeneration: !!allowAllAIGeneration } },
      { upsert: true }
    );

    res.json({ success: true, allowGuestsCreateRooms: !!allowGuestsCreateRooms, allowAllAIGeneration: !!allowAllAIGeneration });
  } catch (err) {
    devSettingsLogger.error('dev_settings_update_failed', {
      requestId: req.id || null,
      auth0Id: req.body?.auth0Id || null,
      error: err,
    });
    res.status(500).json({ error: 'Failed to update settings.' });
  }
}
