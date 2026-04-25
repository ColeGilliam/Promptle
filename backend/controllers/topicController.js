// controllers/topicController.js
import { getTopicCollection } from '../config/db.js';
import { appLogger } from '../lib/logger.js';

// Single module-level variable (will be initialized on first use)
let cachedTopicCollection = null;
const topicLogger = appLogger.child({ component: 'topics' });

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
    topicLogger.error('topic_headers_fetch_failed', {
      requestId: req.id || null,
      topicId: req.params.topicId,
      error: err,
    });
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
    topicLogger.error('popular_topics_fetch_failed', {
      requestId: req.id || null,
      error: err,
    });
    res.status(500).json({ error: 'Server error' });
  }
}
