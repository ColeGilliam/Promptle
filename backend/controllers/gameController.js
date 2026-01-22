// controllers/gameController.js
import { getTopicCollection, getGuessesCollection } from '../config/db.js';

// These will be initialized lazily on first use (and only once)
let cachedTopicCollection = null;
let cachedGuessesCollection = null;

function getTopicColl() {
  if (!cachedTopicCollection) {
    cachedTopicCollection = getTopicCollection();
  }
  return cachedTopicCollection;
}

function getGuessesColl() {
  if (!cachedGuessesCollection) {
    cachedGuessesCollection = getGuessesCollection();
  }
  return cachedGuessesCollection;
}

export async function startGame(req, res) {
  try {
    const topicCollection = getTopicColl();
    const guessesCollection = getGuessesColl();

    const topicId = Number(req.query.topicId);
    const includeAnswer = req.query.includeAnswer === 'true'; // still unused, kept for future

    if (isNaN(topicId)) {
      return res.status(400).json({ error: 'Invalid or missing topicId' });
    }

    // Fetch topic meta
    const topic = await topicCollection.findOne({ topicId });

    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const headers = topic.headers || [];
    const topicName = topic.topicName || 'Unknown Topic';

    if (!headers.length) {
      return res.status(500).json({ error: 'Topic has no headers defined' });
    }

    // Fetch guesses
    const docs = await guessesCollection.find({ topicId }).toArray();

    if (!docs.length) {
      return res.status(404).json({ error: 'No guesses found for topic' });
    }

    // Build answers
    const answers = docs.map((doc) => {
      const values = headers.map((h) => {
        const val = doc[h];
        if (Array.isArray(val)) return val.join(', ');
        if (val === undefined || val === null) return '';
        return String(val);
      });

      return {
        name: doc.name,
        values,
      };
    });

    // Pick random correct answer
    const correctAnswer = answers[Math.floor(Math.random() * answers.length)];

    res.json({
      topic: topicName,
      headers,
      answers,
      correctAnswer,
    });
  } catch (err) {
    console.error('Error starting game:', err);
    res.status(500).json({ error: 'Server error starting game' });
  }
}