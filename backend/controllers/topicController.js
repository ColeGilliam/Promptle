// controllers/topicController.js
import { getTopicCollection } from '../config/db.js';

// Single module-level variable (will be initialized on first use)
let cachedTopicCollection = null;

function getCachedTopicCollection() {
  if (!cachedTopicCollection) {
    cachedTopicCollection = getTopicCollection();
  }
  return cachedTopicCollection;
}

export async function getHeaders(req, res) {
  try {
    const topicCollection = getCachedTopicCollection();
    const topicId = Number(req.params.topicId);

    if (isNaN(topicId)) {
      return res.status(400).json({ error: 'Invalid topicId' });
    }

    const topic = await topicCollection.findOne({ topicId });

    if (!topic) {
      return res.status(404).json({ error: 'Topic Not Found' });
    }

    res.json({ headers: topic.headers });
  } catch (err) {
    console.error('Error fetching headers:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getPopularTopics(req, res) {
  try {
    const topicCollection = getCachedTopicCollection();

    const topicList = await topicCollection.find({}).toArray();

    if (!topicList.length) {
      return res.status(404).json({ error: 'No topics found' });
    }

    const result = topicList.map((t) => ({
      topicId: t.topicId,
      topicName: t.topicName,
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching popular topics:', err);
    res.status(500).json({ error: 'Server error' });
  }
}