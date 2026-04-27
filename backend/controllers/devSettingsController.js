// controllers/devSettingsController.js
import { getDevSettingsCollection, getUsersCollection } from '../config/db.js';
import { appLogger } from '../lib/logger.js';
import { fetchDevSettings } from '../services/devSettings.js';
import {
  buildAdminDailyGamesSummary,
  buildPublicDailyGamesSummary,
  getEffectiveDailyGames,
  mergeDailyGameQueues,
  prepareDailyGamesForToday,
  regenerateUpcomingDailyGame,
  sanitizeDailyGames,
} from '../services/dailyGames.js';

const DEV_EMAIL = 'promptle99@gmail.com';
const SETTINGS_ID = 'global';
const devSettingsLogger = appLogger.child({ component: 'dev-settings' });

function triggerDailyGamePreparation({
  requestId = null,
  coll,
} = {}) {
  void prepareDailyGamesForToday({
    requestId,
    logger: devSettingsLogger,
    ...(coll ? { coll } : {}),
  }).catch((error) => {
    devSettingsLogger.error('daily_game_background_preparation_failed', {
      requestId,
      error,
    });
  });
}

async function isDevAccount(auth0Id) {
  if (!auth0Id) return false;
  try {
    const user = await getUsersCollection().findOne({ auth0Id });
    return user?.email === DEV_EMAIL;
  } catch {
    return false;
  }
}

export async function getDevSettings(req, res) {
  try {
    const settings = await fetchDevSettings();
    // Return the effective queue/schedule immediately, even if the generated payload is still pending.
    const effectiveDailyGames = getEffectiveDailyGames(settings.dailyGames);
    const isDevUser = await isDevAccount(req.query?.auth0Id);

    res.json({
      allowGuestsCreateRooms: settings.allowGuestsCreateRooms,
      allowAllAIGeneration: settings.allowAllAIGeneration,
      showPromptleAnswerAtTop: settings.showPromptleAnswerAtTop,
      dailyGames: buildPublicDailyGamesSummary(effectiveDailyGames),
      ...(isDevUser
        ? {
            dailyGameAdmin: buildAdminDailyGamesSummary(effectiveDailyGames),
          }
        : {}),
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
    const {
      auth0Id,
      allowGuestsCreateRooms,
      allowAllAIGeneration,
      showPromptleAnswerAtTop,
      dailyGameQueues,
    } = req.body;

    if (!(await isDevAccount(auth0Id))) {
      return res.status(403).json({ error: 'Only the dev account can update settings.' });
    }

    const coll = getDevSettingsCollection();
    const existingDoc = await coll.findOne({ _id: SETTINGS_ID });
    const effectiveDailyGames = getEffectiveDailyGames(
      sanitizeDailyGames(existingDoc?.dailyGames)
    );
    // The top queued topic becomes the active game right away, but the queue itself should only advance automatically when the date rolls over.
    const mergedDailyGames = mergeDailyGameQueues(
      effectiveDailyGames,
      dailyGameQueues
    );

    // When the queued topics update, we should ensure the top game is generated
    await coll.updateOne(
      { _id: SETTINGS_ID },
      {
        $set: {
          allowGuestsCreateRooms: !!allowGuestsCreateRooms,
          allowAllAIGeneration: !!allowAllAIGeneration,
          showPromptleAnswerAtTop: !!showPromptleAnswerAtTop,
          dailyGames: mergedDailyGames,
        },
      },
      { upsert: true }
    );

    triggerDailyGamePreparation({
      requestId: req.id || null,
      coll,
    });

    // Return the merged/updated settings immediately, even if the generated payload is still pending.
    res.json({
      success: true,
      allowGuestsCreateRooms: !!allowGuestsCreateRooms,
      allowAllAIGeneration: !!allowAllAIGeneration,
      showPromptleAnswerAtTop: !!showPromptleAnswerAtTop,
      dailyGames: buildPublicDailyGamesSummary(mergedDailyGames),
      dailyGameAdmin: buildAdminDailyGamesSummary(mergedDailyGames),
    });
  } catch (err) {
    devSettingsLogger.error('dev_settings_update_failed', {
      requestId: req.id || null,
      auth0Id: req.body?.auth0Id || null,
      error: err,
    });
    res.status(500).json({ error: 'Failed to update settings.' });
  }
}

export async function regenerateDailyGame(req, res) {
  try {
    const { auth0Id } = req.body || {};

    if (!(await isDevAccount(auth0Id))) {
      return res.status(403).json({ error: 'Only the dev account can regenerate daily games.' });
    }

    const coll = getDevSettingsCollection();
    const dailyGames = await regenerateUpcomingDailyGame({
      mode: req.params.mode,
      requestId: req.id || null,
      logger: devSettingsLogger,
      coll,
    });

    res.json({
      success: true,
      dailyGames: buildPublicDailyGamesSummary(dailyGames),
      dailyGameAdmin: buildAdminDailyGamesSummary(dailyGames),
    });
  } catch (err) {
    const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;

    if (statusCode >= 500) {
      devSettingsLogger.error('daily_game_regeneration_failed', {
        requestId: req.id || null,
        auth0Id: req.body?.auth0Id || null,
        mode: req.params.mode,
        error: err,
      });
    }

    res.status(statusCode).json({
      error: err.message || 'Failed to regenerate the daily game.',
    });
  }
}
