import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/promptle-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

// Import the functions to be tested
const {
  logRejectedTopicAttempt,
  moderateTopicInput,
} = await import('../services/topicModeration.js');

// Test that moderateTopicInput correctly identifies flagged categories from the OpenAI moderation response
test('moderateTopicInput returns flagged categories from the moderation response', async () => {
  const openaiClient = {
    moderations: {
      create: async () => ({
        id: 'mod_123',
        model: 'omni-moderation-latest',
        results: [
          {
            flagged: true,
            categories: {
              harassment: false,
              hate: false,
              sexual: true,
              'sexual/minors': false,
            },
          },
        ],
      }),
    },
  };

  // Call moderateTopicInput with the mocked OpenAI client and a sample topic
  const result = await moderateTopicInput({
    openaiClient,
    topic: 'Explicit content',
  });

  // Assert that the result indicates the topic was flagged and includes the correct flagged categories and moderation metadata
  assert.deepEqual(result, {
    flagged: true,
    flaggedCategories: ['sexual'],
    moderationId: 'mod_123',
    moderationModel: 'omni-moderation-latest',
  });
});

// Test that logRejectedTopicAttempt writes a moderation attempt to the database when a user exists for the given auth0Id
test('logRejectedTopicAttempt writes a moderation attempt when the user exists', async () => {
  let insertedDoc = null;

  // Mock the users collection to return a user for a specific auth0Id
  const usersCollection = {
    findOne: async ({ auth0Id }) => (
      auth0Id === 'auth0|player-123' ? { _id: 'mongo-user-1', auth0Id } : null
    ),
  };

  // Mock the attempts collection to capture the inserted document
  const attemptsCollection = {
    insertOne: async (doc) => {
      insertedDoc = doc;
      return { acknowledged: true, insertedId: 'attempt-1' };
    },
  };

  // Call logRejectedTopicAttempt with the mocked collections and a sample moderation result
  const didLog = await logRejectedTopicAttempt({
    auth0Id: 'auth0|player-123',
    topic: 'Explicit content',
    moderationResult: {
      flaggedCategories: ['sexual'],
      moderationId: 'mod_123',
      moderationModel: 'omni-moderation-latest',
    },
    usersCollection,
    attemptsCollection,
  });

  // Assert that the attempt was logged and the inserted document contains the correct data
  assert.equal(didLog, true);
  assert.equal(insertedDoc.auth0Id, 'auth0|player-123');
  assert.equal(insertedDoc.userId, 'mongo-user-1');
  assert.equal(insertedDoc.topic, 'Explicit content');
  assert.deepEqual(insertedDoc.flaggedCategories, ['sexual']);
  assert.equal(insertedDoc.moderationId, 'mod_123');
  assert.equal(insertedDoc.moderationModel, 'omni-moderation-latest');
  assert.equal(insertedDoc.source, 'topic-input');
  assert.equal(insertedDoc.createdAt instanceof Date, true);
});
