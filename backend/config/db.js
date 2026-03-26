// config/db.js
import { MongoClient, ServerApiVersion } from 'mongodb';
import { MONGODB_URI } from './config.js';

let client;
let db;
let topicCollection;
let guessesCollection;
let usersCollection;
let topicModerationAttemptsCollection;

let cachedMultiplayerGamesCollection = null;
let cachedDevSettingsCollection = null;

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
    console.log('Connected to MongoDB!');

    db = client.db('promptle');
    topicCollection = db.collection('topic');
    guessesCollection = db.collection('guesses');
    usersCollection = db.collection('users');
    topicModerationAttemptsCollection = db.collection('topicModerationAttempts');

    return { db, topicCollection, guessesCollection, usersCollection, topicModerationAttemptsCollection };
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
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

// Optional: Close connection on shutdown (add to server.js if needed)
export async function closeDB() {
  if (client) await client.close();
}
