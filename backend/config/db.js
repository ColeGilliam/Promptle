// config/db.js
import { MongoClient, ServerApiVersion } from 'mongodb';
import { MONGODB_URI } from './config.js';

let client;
let db;
let topicCollection;
let guessesCollection;
let usersCollection;

export async function connectDB() {
  if (db) return { db, topicCollection, guessesCollection, usersCollection }; // Already connected

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

    return { db, topicCollection, guessesCollection, usersCollection };
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

// Optional: Close connection on shutdown (add to server.js if needed)
export async function closeDB() {
  if (client) await client.close();
}