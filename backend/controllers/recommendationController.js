import { getCustomGameSessionsCollection, getGameFeedbackCollection, getTopicCollection } from '../config/db.js';
import { appLogger } from '../lib/logger.js';
import { normalizeTopicKey, normalizeTopicTokens } from '../services/topicNormalization.js';

const MAX_RECOMMENDATIONS = 6;
const MAX_TOPICS_PER_USER = 20;
const NEGATIVE_PENALTY_WEIGHT = 0.75;
const MIN_CUSTOM_IDEAS = 3;
const TRENDING_RECENCY_WINDOW_MS = 1000 * 60 * 60 * 24 * 90;
const recommendationLogger = appLogger.child({ component: 'recommendations' });

let cachedGameFeedbackCollection = null;
let cachedCustomGameSessionsCollection = null;
let cachedTopicCollection = null;

function getCachedGameFeedbackCollection() {
  if (!cachedGameFeedbackCollection) cachedGameFeedbackCollection = getGameFeedbackCollection();
  return cachedGameFeedbackCollection;
}

function getCachedCustomGameSessionsCollection() {
  if (!cachedCustomGameSessionsCollection) cachedCustomGameSessionsCollection = getCustomGameSessionsCollection();
  return cachedCustomGameSessionsCollection;
}

function getCachedTopicCollection() {
  if (!cachedTopicCollection) cachedTopicCollection = getTopicCollection();
  return cachedTopicCollection;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function createTopicPairKey(leftTopicKey, rightTopicKey) {
  return leftTopicKey < rightTopicKey
    ? `${leftTopicKey}||${rightTopicKey}`
    : `${rightTopicKey}||${leftTopicKey}`;
}

function buildFeedbackEvents(feedbackDocs) {
  return feedbackDocs
    .map((doc) => {
      const auth0Id = normalizeOptionalString(doc?.auth0Id);
      const topic = normalizeOptionalString(doc?.topic);
      const topicKey = normalizeTopicKey(topic || doc?.topicKey || '');
      if (!auth0Id || !topicKey) return null;

      return {
        auth0Id,
        topic: topic || topicKey,
        topicKey,
        type: doc.liked ? 'liked' : 'disliked',
        value: doc.liked ? 5 : -5,
        occurredAt: toTimestamp(doc.createdAt),
      };
    })
    .filter(Boolean);
}

// Sessions should contribute to the profile but with less weight than explicit feedback and only when they reach a meaningful conclusion (completed or abandoned).
function buildSessionEvents(sessionDocs) {
  return sessionDocs
    .map((doc) => {
      const auth0Id = normalizeOptionalString(doc?.auth0Id);
      const topic = normalizeOptionalString(doc?.topic);
      const topicKey = normalizeTopicKey(topic || doc?.topicKey || '');
      if (!auth0Id || !topicKey) return null;
      if (doc.finalState !== 'completed' && doc.finalState !== 'abandoned') return null;

      return {
        auth0Id,
        topic: topic || topicKey,
        topicKey,
        type: doc.finalState,
        value: doc.finalState === 'completed' ? 2 : -2,
        occurredAt: toTimestamp(doc.finalizedAt || doc.startedAt),
      };
    })
    .filter(Boolean);
}

function scoreTopics(events) {
  const sortedEvents = [...events].sort((left, right) => right.occurredAt - left.occurredAt);
  const scoreMap = new Map();

  sortedEvents.forEach((event, index) => {
    // Newer actions should matter more than old ones without fully discarding older history, so we apply exponential decay by recency.
    const recencyMultiplier = Math.pow(0.9, index);
    const weightedValue = event.value * recencyMultiplier;
    const existing = scoreMap.get(event.topicKey) || {
      topicKey: event.topicKey,
      topic: event.topic,
      score: 0,
      lastOccurredAt: 0,
      strongestPositiveType: null,
      strongestPositiveValue: 0,
    };

    existing.topic = existing.topic || event.topic;
    existing.score += weightedValue;
    existing.lastOccurredAt = Math.max(existing.lastOccurredAt, event.occurredAt);

    if (weightedValue > existing.strongestPositiveValue) {
      existing.strongestPositiveValue = weightedValue;
      existing.strongestPositiveType = event.type;
    }

    scoreMap.set(event.topicKey, existing);
  });

  return scoreMap;
}

// Build a profile for each user based on their feedback and session history.
// Each topic they have interacted with gets a score based on the type of interaction, recency, and frequency.
function buildUserProfiles(events) {
  const eventsByUser = new Map();

  events.forEach((event) => {
    const userEvents = eventsByUser.get(event.auth0Id) || [];
    userEvents.push(event);
    eventsByUser.set(event.auth0Id, userEvents);
  });

  const profiles = new Map();

  eventsByUser.forEach((userEvents, auth0Id) => {
    const allTopics = scoreTopics(userEvents);
    const positiveTopics = [...allTopics.values()]
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || right.lastOccurredAt - left.lastOccurredAt)
      // Cap per-user history so one very active player cannot dominate the co-occurrence graph.
      .slice(0, MAX_TOPICS_PER_USER);

    profiles.set(auth0Id, {
      auth0Id,
      allTopics,
      positiveTopics,
    });
  });

  return profiles;
}

// Build a topic similarity graph based on co-occurrence in users' positive topics.
function buildTopicSimilarityGraph(userProfiles) {
  const topicStats = new Map();
  const pairStats = new Map();

  userProfiles.forEach((profile) => {
    profile.positiveTopics.forEach((entry) => {
      const existing = topicStats.get(entry.topicKey) || {
        topicKey: entry.topicKey,
        topic: entry.topic,
        totalPositiveWeight: 0,
      };

      existing.topic = existing.topic || entry.topic;
      existing.totalPositiveWeight += entry.score;
      topicStats.set(entry.topicKey, existing);
    });

    for (let leftIndex = 0; leftIndex < profile.positiveTopics.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < profile.positiveTopics.length; rightIndex += 1) {
        const left = profile.positiveTopics[leftIndex];
        const right = profile.positiveTopics[rightIndex];
        const pairKey = createTopicPairKey(left.topicKey, right.topicKey);
        const existingPair = pairStats.get(pairKey) || {
          pairKey,
          sharedUserCount: 0,
          sharedWeight: 0,
        };

        existingPair.sharedUserCount += 1;
        existingPair.sharedWeight += Math.min(left.score, right.score);
        pairStats.set(pairKey, existingPair);
      }
    }
  });

  const graph = new Map();

  pairStats.forEach((pair) => {
    const [leftTopicKey, rightTopicKey] = pair.pairKey.split('||');
    const leftStats = topicStats.get(leftTopicKey);
    const rightStats = topicStats.get(rightTopicKey);
    if (!leftStats || !rightStats) return;

    // Normalize shared weight by each topic's total positive weight so generic high-volume topics do not drown out more specific but meaningful pairs.
    const similarity = pair.sharedWeight / Math.sqrt(leftStats.totalPositiveWeight * rightStats.totalPositiveWeight);
    if (!Number.isFinite(similarity) || similarity <= 0) return;

    const leftNeighbors = graph.get(leftTopicKey) || [];
    leftNeighbors.push({
      topicKey: rightTopicKey,
      topic: rightStats.topic,
      similarity,
      sharedUserCount: pair.sharedUserCount,
    });
    graph.set(leftTopicKey, leftNeighbors);

    const rightNeighbors = graph.get(rightTopicKey) || [];
    rightNeighbors.push({
      topicKey: leftTopicKey,
      topic: leftStats.topic,
      similarity,
      sharedUserCount: pair.sharedUserCount,
    });
    graph.set(rightTopicKey, rightNeighbors);
  });

  return graph;
}

// Collaborative recommendations are surfaced based on the target user's positive topics and the similarity graph built from all users' positive topics.
// Topics that are similar to ones the user strongly liked or repeatedly completed should be more likely to show up, 
// while topics related to things the user disliked or abandoned should be suppressed.
function buildCollaborativeCustomRecommendations(targetProfile, similarityGraph) {
  if (!targetProfile) return [];

  const seenTopicKeys = new Set(targetProfile.allTopics.keys());
  const negativeTopics = [...targetProfile.allTopics.values()]
    .filter((entry) => entry.score < 0)
    .sort((left, right) => left.score - right.score);
  const candidateMap = new Map();

  targetProfile.positiveTopics.forEach((entry) => {
    const neighbors = similarityGraph.get(entry.topicKey) || [];
    neighbors.forEach((neighbor) => {
      if (seenTopicKeys.has(neighbor.topicKey)) return;

      // A candidate gets stronger when it is similar to a topic the user strongly liked or repeatedly completed.
      const contribution = entry.score * neighbor.similarity;
      if (contribution <= 0) return;

      const existing = candidateMap.get(neighbor.topicKey) || {
        type: 'custom',
        topic: neighbor.topic,
        reason: entry.strongestPositiveType === 'liked' ? 'liked_topic' : 'completed_topic',
        score: 0,
        strongestContribution: 0,
        support: 0,
      };

      existing.topic = existing.topic || neighbor.topic;
      existing.score += contribution;
      existing.support = Math.max(existing.support, neighbor.sharedUserCount);

      if (contribution > existing.strongestContribution) {
        existing.strongestContribution = contribution;
        existing.reason = entry.strongestPositiveType === 'liked' ? 'liked_topic' : 'completed_topic';
      }

      candidateMap.set(neighbor.topicKey, existing);
    });
  });

  negativeTopics.forEach((entry) => {
    const neighbors = similarityGraph.get(entry.topicKey) || [];
    neighbors.forEach((neighbor) => {
      const existing = candidateMap.get(neighbor.topicKey);
      if (!existing || seenTopicKeys.has(neighbor.topicKey)) return;

      // Negative topics should suppress related candidates, but not so strongly that one bad interaction erases every nearby recommendation.
      existing.score -= Math.abs(entry.score) * neighbor.similarity * NEGATIVE_PENALTY_WEIGHT;
    });
  });

  return [...candidateMap.values()]
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.support - left.support || left.topic.localeCompare(right.topic));
}

// Trending recommendations are surfaced based on the most popular topics in recent user activity across the platform
// Exclude anything the target user has already seen or any collaborative recommendations already surfaced.
function buildTrendingCustomRecommendations(userProfiles, options = {}) {
  const excludedTopicKeys = new Set(options.excludedTopicKeys ?? []);
  const topicMap = new Map();

  userProfiles.forEach((profile) => {
    profile.allTopics.forEach((entry) => {
      const existing = topicMap.get(entry.topicKey) || {
        type: 'custom',
        topic: entry.topic,
        reason: 'trending_custom',
        score: 0,
        support: 0,
        topicKey: entry.topicKey,
      };

      existing.topic = existing.topic || entry.topic;
      existing.score += entry.score;
      if (entry.score > 0) {
        existing.support += 1;
      }

      topicMap.set(entry.topicKey, existing);
    });
  });

  return [...topicMap.values()]
    .filter((entry) => entry.score > 0)
    .filter((entry) => !excludedTopicKeys.has(entry.topicKey))
    .sort((left, right) => right.score - left.score || right.support - left.support || left.topic.localeCompare(right.topic));
}

// Popular fallback recommendations are surfaced based on the overall most popular topics
// This is a safety net to ensure we can always return some recommendations even for users with no history
function buildPopularFallbackRecommendations(targetProfile, topics, excludedTopicNames) {
  if (!targetProfile) return [];

  const positiveEntries = targetProfile.positiveTopics.filter((entry) => entry.score > 0);
  const weightedTokens = new Map();
  const excludedTopicKeys = new Set([...excludedTopicNames].map((value) => normalizeTopicKey(value)));

  positiveEntries.forEach((entry) => {
    normalizeTopicTokens(entry.topic).forEach((token) => {
      weightedTokens.set(token, (weightedTokens.get(token) || 0) + entry.score);
    });
  });

  return topics
    .map((topic) => {
      const topicName = normalizeOptionalString(topic.topicName);
      const topicKey = normalizeTopicKey(topicName);
      const matchScore = normalizeTopicTokens(topicName)
        .reduce((sum, token) => sum + (weightedTokens.get(token) || 0), 0);

      return {
        type: 'popular',
        topic: topicName,
        topicId: topic.topicId,
        reason: 'popular_fallback',
        matchScore,
        topicKey,
      };
    })
    .filter((item) => item.topic && !excludedTopicKeys.has(item.topicKey))
    .sort((left, right) => right.matchScore - left.matchScore || left.topicId - right.topicId);
}

export function createGetRecommendationsHandler({
  findAllFeedbackFn = async () =>
    getCachedGameFeedbackCollection()
      .find({ auth0Id: { $exists: true, $ne: null } })
      .toArray(),
  findAllSessionsFn = async () =>
    getCachedCustomGameSessionsCollection()
      .find({ auth0Id: { $exists: true, $ne: null }, finalState: { $in: ['completed', 'abandoned'] } })
      .toArray(),
  findTopicsFn = async () =>
    getCachedTopicCollection()
      .find({})
      .sort({ topicId: 1 })
      .toArray(),
  logger = recommendationLogger,
  nowFn = () => Date.now(),
} = {}) {
  return async function getRecommendations(req, res) {
    const auth0Id = normalizeOptionalString(req.params?.auth0Id);

    if (!auth0Id) {
      return res.status(400).json({ error: 'Please provide an auth0Id in the route.' });
    }

    try {
      const [feedbackDocs, sessionDocs, topics] = await Promise.all([
        findAllFeedbackFn(),
        findAllSessionsFn(),
        findTopicsFn(),
      ]);

      const allEvents = [
        ...buildFeedbackEvents(feedbackDocs),
        ...buildSessionEvents(sessionDocs),
      ];

      if (!allEvents.length) {
        return res.json({ items: [] });
      }

      const userProfiles = buildUserProfiles(allEvents);
      const trendingCutoff = nowFn() - TRENDING_RECENCY_WINDOW_MS;
      // Trending ideas should be based on recent activity to keep up with trends
      const recentTrendingProfiles = buildUserProfiles(
        allEvents.filter((event) => event.occurredAt >= trendingCutoff)
      );
      const targetProfile = userProfiles.get(auth0Id);

      const targetSeenTopicKeys = targetProfile
        ? new Set(targetProfile.allTopics.keys())
        : new Set();
      const similarityGraph = buildTopicSimilarityGraph(userProfiles);
      const collaborativeCustomRecommendations = targetProfile?.positiveTopics.length
        ? buildCollaborativeCustomRecommendations(targetProfile, similarityGraph)
        : [];
      const trendingCustomRecommendations = buildTrendingCustomRecommendations(recentTrendingProfiles, {
        excludedTopicKeys: new Set([
          ...targetSeenTopicKeys,
          ...collaborativeCustomRecommendations.map((item) => normalizeTopicKey(item.topic)),
        ]),
      });
      const customRecommendations = [
        ...collaborativeCustomRecommendations,
        ...trendingCustomRecommendations,
      ].slice(0, Math.max(MIN_CUSTOM_IDEAS, MAX_RECOMMENDATIONS));
      const popularFallbacks = targetProfile?.positiveTopics.length
        ? buildPopularFallbackRecommendations(
            targetProfile,
            topics,
            customRecommendations.map((item) => item.topic)
          )
        : [];

      const items = [
        ...customRecommendations,
        ...popularFallbacks,
      ]
        .slice(0, MAX_RECOMMENDATIONS)
        .map(({ score, strongestContribution, support, matchScore, topicKey, ...item }) => item);

      return res.json({ items });
    } catch (error) {
      logger.error('recommendations_fetch_failed', {
        requestId: req.id || null,
        auth0Id,
        error,
      });
      return res.status(500).json({ error: 'Failed to load recommendations.' });
    }
  };
}

export const getRecommendations = createGetRecommendationsHandler();
