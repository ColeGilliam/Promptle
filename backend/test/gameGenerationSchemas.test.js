import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildCrosswordResponseFormat,
  buildPromptleResponseFormat,
  CONNECTIONS_RESPONSE_FORMAT,
} = await import('../services/gameGenerationSchemas.js');
const {
  CONNECTIONS_GENERATION_CONFIG,
  OUTPUT_LIMITS,
} = await import('../services/gameGenerationConfig.js');

test('buildPromptleResponseFormat uses provided category and subject limits', () => {
  const responseFormat = buildPromptleResponseFormat({
    minCategories: 4,
    maxCategories: 7,
    minSubjects: 10,
    maxSubjects: 80,
    allowNonViable: true,
  });
  const schema = responseFormat.json_schema.schema;

  assert.equal(schema.properties.columns.minItems, 0);
  assert.equal(schema.properties.columns.maxItems, 7);
  assert.equal(schema.properties.answers.minItems, 0);
  assert.equal(schema.properties.answers.maxItems, 80);
  assert.equal(schema.properties.answers.items.properties.cells.minItems, 0);
  assert.equal(schema.properties.answers.items.properties.cells.maxItems, 7);
  assert.equal(schema.properties.viable.type, 'boolean');
  assert.equal(schema.properties.reason.maxLength, OUTPUT_LIMITS.promptleReason);
  assert.equal(schema.properties.topic.maxLength, OUTPUT_LIMITS.topic);
  assert.equal(schema.properties.columns.items.properties.header.maxLength, OUTPUT_LIMITS.promptleHeader);
  assert.equal(schema.properties.answers.items.properties.name.maxLength, OUTPUT_LIMITS.promptleSubjectName);
});

test('Connections response schema uses shared gameplay and output limits', () => {
  const schema = CONNECTIONS_RESPONSE_FORMAT.json_schema.schema;

  assert.equal(schema.properties.groups.minItems, CONNECTIONS_GENERATION_CONFIG.groupCount);
  assert.equal(schema.properties.groups.maxItems, CONNECTIONS_GENERATION_CONFIG.groupCount);
  assert.equal(schema.properties.groups.items.properties.words.minItems, CONNECTIONS_GENERATION_CONFIG.wordsPerGroup);
  assert.equal(schema.properties.groups.items.properties.words.maxItems, CONNECTIONS_GENERATION_CONFIG.wordsPerGroup);
  assert.equal(schema.properties.groups.items.properties.words.items.maxLength, OUTPUT_LIMITS.connectionsWord);
});

test('buildCrosswordResponseFormat uses provided candidate limits', () => {
  const responseFormat = buildCrosswordResponseFormat({
    minCandidates: 24,
    maxCandidates: 36,
  });
  const schema = responseFormat.json_schema.schema;

  assert.equal(schema.properties.candidates.minItems, 24);
  assert.equal(schema.properties.candidates.maxItems, 36);
  assert.equal(schema.properties.candidates.items.properties.answer.maxLength, OUTPUT_LIMITS.crosswordAnswer);
  assert.equal(schema.properties.candidates.items.properties.clue.maxLength, OUTPUT_LIMITS.crosswordClue);
});
