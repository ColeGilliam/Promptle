// config/db.js
import { MongoClient, ServerApiVersion } from 'mongodb';
import { DB_NAME, DB_PING_INTERVAL_MS, MONGODB_URI, NODE_ENV } from './config.js';
import { appLogger } from '../lib/logger.js';

let client;
let db;
let topicCollection;
let guessesCollection;
let usersCollection;
let topicModerationAttemptsCollection;
let dbPingTimer = null;
let lastDbPingFailedAt = null;

let cachedMultiplayerGamesCollection = null;
let cachedDevSettingsCollection = null;
const dbLogger = appLogger.child({ component: 'db' });

function resetCachedCollections() {
  topicCollection = null;
  guessesCollection = null;
  usersCollection = null;
  topicModerationAttemptsCollection = null;
  cachedMultiplayerGamesCollection = null;
  cachedDevSettingsCollection = null;
}

function startDbPingMonitor() {
  if (!db || dbPingTimer || NODE_ENV === 'test') {
    return;
  }

  // This is an app-level availability check so we notice the DB dropping after startup.
  dbPingTimer = setInterval(async () => {
    try {
      await db.command({ ping: 1 });

      if (lastDbPingFailedAt) {
        dbLogger.error('db_ping_recovered', {
          dbName: db.databaseName,
          recoveredAt: new Date(),
          lastDbPingFailedAt,
        });
        lastDbPingFailedAt = null;
      }
    } catch (error) {
      lastDbPingFailedAt = new Date();
      dbLogger.error('db_ping_failed', {
        dbName: db?.databaseName || DB_NAME,
        failedAt: lastDbPingFailedAt,
        error,
      });
    }
  }, DB_PING_INTERVAL_MS);

  // Do not keep the Node process alive solely because the periodic ping timer exists.
  dbPingTimer.unref?.();
}

export function getMultiplayerGamesCollection() {
  if (!cachedMultiplayerGamesCollection) {
    cachedMultiplayerGamesCollection = db.collection('multiplayerGames');
  }
  return cachedMultiplayerGamesCollection;
}

export function getDevSettingsCollection() {
  if (!cachedDevSettingsCollection) {
    cachedDevSettingsCollection = db.collection('devSettings');
  }
  return cachedDevSettingsCollection;
}

export async function connectDB() {
  // Controllers import collection accessors directly, so initialize all shared handles here once.
  if (db) return { db, topicCollection, guessesCollection, usersCollection, topicModerationAttemptsCollection }; // Already connected

  try {
    client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    await client.connect();
    db = client.db(DB_NAME);

    topicCollection = db.collection('topic');
    guessesCollection = db.collection('guesses');
    usersCollection = db.collection('users');
    topicModerationAttemptsCollection = db.collection('topicModerationAttempts');
    startDbPingMonitor();

    dbLogger.warn('db_connected', {
      dbName: db.databaseName,
    });

    return { db, topicCollection, guessesCollection, usersCollection, topicModerationAttemptsCollection };
  } catch (err) {
    dbLogger.error('db_connect_failed', {
      dbName: DB_NAME,
      error: err,
    });
    throw err;
  }
}

export function getTopicCollection() {
  if (!topicCollection) throw new Error('Database not connected. Call connectDB() first!');
  return topicCollection;
}

export function getGuessesCollection() {
  if (!guessesCollection) throw new Error('Database not connected. Call connectDB() first!');
  return guessesCollection;
}

export function getUsersCollection() {
  if (!usersCollection) throw new Error('Database not connected. Call connectDB() first!');
  return usersCollection;
}

export function getTopicModerationAttemptsCollection() {
  if (!topicModerationAttemptsCollection) throw new Error('Database not connected. Call connectDB() first!');
  return topicModerationAttemptsCollection;
}

// Close connection on shutdown
export async function closeDB() {
  if (dbPingTimer) {
    clearInterval(dbPingTimer);
    dbPingTimer = null;
  }

  if (!client) {
    return;
  }

  await client.close();
  client = null;
  db = null;
  lastDbPingFailedAt = null;
  // Drop cached collection references so the next startup path cannot accidentally reuse stale handles.
  resetCachedCollections();

  dbLogger.warn('db_connection_closed', {
    dbName: DB_NAME,
  });
}
