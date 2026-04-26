import { randomBytes } from 'node:crypto';
import { getSharedGamesCollection, getUsersCollection } from '../config/db.js';
import { appLogger } from '../lib/logger.js';

export const SHARED_GAME_DURATION_HOURS = 24;
export const SHARED_GAME_DURATION_MS = SHARED_GAME_DURATION_HOURS * 60 * 60 * 1000;

const sharedGameLogger = appLogger.child({ component: 'shared-game' });

let cachedUsersCollection = null;
let cachedSharedGamesCollection = null;

function getCachedUsersCollection() {
  if (!cachedUsersCollection) cachedUsersCollection = getUsersCollection();
  return cachedUsersCollection;
}

function getCachedSharedGamesCollection() {
  if (!cachedSharedGamesCollection) cachedSharedGamesCollection = getSharedGamesCollection();
  return cachedSharedGamesCollection;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeShareCode(value) {
  return normalizeOptionalString(value).toUpperCase();
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createShareCode() {
  return randomBytes(5).toString('hex').toUpperCase();
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

export function createCreateSharedGameHandler({
  findUserFn = async (auth0Id) => getCachedUsersCollection().findOne(
    { auth0Id },
    { projection: { _id: 1, auth0Id: 1 } }
  ),
  insertSharedGameFn = async (doc) => getCachedSharedGamesCollection().insertOne(doc),
  createShareCodeFn = createShareCode,
  nowFn = () => new Date(),
  logger = sharedGameLogger,
} = {}) {
  return async function createSharedGame(req, res) {
    const auth0Id = normalizeOptionalString(req.body?.auth0Id);
    const gameType = normalizeOptionalString(req.body?.gameType);
    const payload = req.body?.payload;

    if (!auth0Id) {
      return res.status(401).json({ error: 'Sign in to share a game.' });
    }

    if (!gameType || !isPlainObject(payload)) {
      return res.status(400).json({ error: 'Unable to create a share link.' });
    }

    try {
      const user = await findUserFn(auth0Id);
      if (!user) {
        return res.status(404).json({ error: 'Unable to create a share link.' });
      }

      const createdAt = nowFn();
      const expiresAt = new Date(createdAt.getTime() + SHARED_GAME_DURATION_MS);
      let shareCode = '';

      for (let attempt = 0; attempt < 5; attempt += 1) {
        shareCode = normalizeShareCode(createShareCodeFn());

        try {
          await insertSharedGameFn({
            _id: shareCode,
            auth0Id,
            creatorUserId: user._id,
            gameType,
            payload,
            createdAt,
            expiresAt,
          });

          return res.status(201).json({
            shareCode,
            gameType,
            expiresAt: expiresAt.toISOString(),
          });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            continue;
          }
          throw error;
        }
      }

      return res.status(500).json({ error: 'Unable to create a share link.' });
    } catch (error) {
      logger.error('shared_game_create_failed', {
        requestId: req.id || null,
        auth0Id,
        gameType,
        error,
      });
      return res.status(500).json({ error: 'Unable to create a share link.' });
    }
  };
}

export function createLoadSharedGameHandler({
  findSharedGameFn = async (shareCode) => getCachedSharedGamesCollection().findOne({ _id: shareCode }),
  deleteSharedGameFn = async (shareCode) => getCachedSharedGamesCollection().deleteOne({ _id: shareCode }),
  nowFn = () => new Date(),
  logger = sharedGameLogger,
} = {}) {
  return async function loadSharedGame(req, res) {
    const shareCode = normalizeShareCode(req.params?.shareCode);
    const expectedGameType = normalizeOptionalString(req.query?.gameType);

    if (!shareCode) {
      return res.status(404).json({ error: 'This shared game is unavailable.' });
    }

    try {
      const sharedGame = await findSharedGameFn(shareCode);
      if (!sharedGame) {
        return res.status(404).json({ error: 'This shared game is unavailable.' });
      }

      if (expectedGameType && sharedGame.gameType !== expectedGameType) {
        return res.status(404).json({ error: 'This shared game is unavailable.' });
      }

      if (!(sharedGame.expiresAt instanceof Date) || sharedGame.expiresAt.getTime() <= nowFn().getTime()) {
        await Promise.resolve(deleteSharedGameFn(shareCode)).catch(() => {});
        return res.status(410).json({ error: 'This shared game has expired.' });
      }

      return res.json({
        shareCode,
        gameType: sharedGame.gameType,
        expiresAt: sharedGame.expiresAt.toISOString(),
        createdAt: sharedGame.createdAt instanceof Date ? sharedGame.createdAt.toISOString() : null,
        payload: sharedGame.payload,
      });
    } catch (error) {
      logger.error('shared_game_load_failed', {
        requestId: req.id || null,
        shareCode,
        expectedGameType: expectedGameType || null,
        error,
      });
      return res.status(500).json({ error: 'This shared game is unavailable right now.' });
    }
  };
}

export const createSharedGame = createCreateSharedGameHandler();
export const loadSharedGame = createLoadSharedGameHandler();
