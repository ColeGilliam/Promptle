import { getTopicModerationAttemptsCollection, getUsersCollection } from '../config/db.js';

export const TOPIC_MODERATION_MODEL = 'omni-moderation-latest';
export const TOPIC_NOT_ALLOWED_ERROR = 'That topic is not allowed. Please try a different topic.';
export const TOPIC_MODERATION_FAILED_ERROR = 'Unable to validate that topic right now. Please try again.';

// Helper function to extract flagged categories from moderation response
export function getFlaggedCategories(categories = {}) {
  return Object.entries(categories)
    .filter(([, flagged]) => flagged === true)
    .map(([category]) => category);
}

// Moderates the topic input using OpenAI's moderation endpoint
export async function moderateTopicInput({
  openaiClient,
  topic,
  model = TOPIC_MODERATION_MODEL,
} = {}) {
  if (!openaiClient?.moderations?.create) { 
    throw new Error('OpenAI moderations client is unavailable.');
  }

  // Call the OpenAI moderation endpoint with the topic input
  const moderationResponse = await openaiClient.moderations.create({
    model,
    input: topic,
  });

  // Extract the moderation result and determine if the topic is flagged, along with any flagged categories
  const moderationResult = moderationResponse?.results?.[0];
  if (!moderationResult) {
    throw new Error('Moderation response did not include a result.');
  }

  const flaggedCategories = getFlaggedCategories(moderationResult.categories);

  // Return the moderation result, including whether the topic was flagged, which categories were flagged, and moderation metadata
  return {
    flagged: Boolean(moderationResult.flagged || flaggedCategories.length),
    flaggedCategories,
    moderationId: moderationResponse.id ?? null,
    moderationModel: moderationResponse.model ?? model,
  };
}

// Logs a rejected topic attempt to the database, associating it with the user if auth0Id is provided
export async function logRejectedTopicAttempt({
  auth0Id,
  topic,
  moderationResult,
  usersCollection = getUsersCollection(),
  attemptsCollection = getTopicModerationAttemptsCollection(),
} = {}) {
  if (!auth0Id) {
    return false;
  }

  // Look up the user in the database using the provided auth0Id
  const user = await usersCollection.findOne(
    { auth0Id },
    { projection: { _id: 1, auth0Id: 1 } }
  );

  if (!user) {
    return false;
  }

  // Insert a new document into the topicModerationAttempts collection with the user ID, topic, moderation result, and timestamp
  await attemptsCollection.insertOne({
    auth0Id,
    userId: user._id,
    topic,
    flaggedCategories: moderationResult?.flaggedCategories ?? [],
    moderationModel: moderationResult?.moderationModel ?? TOPIC_MODERATION_MODEL,
    moderationId: moderationResult?.moderationId ?? null,
    createdAt: new Date(),
    source: 'topic-input',
  });

  return true;
}
