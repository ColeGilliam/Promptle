import {
  CONNECTIONS_GENERATION_CONFIG,
  CROSSWORD_GENERATION_CONFIG,
  OUTPUT_LIMITS,
} from './gameGenerationConfig.js';

// OpenAI strict JSON schema wrapper used by all game generators.
function strictJsonSchema(name, description, schema) {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      description,
      strict: true,
      schema,
    },
  };
}

const nullableShortString = (maxLength = 80) => ({
  type: ['string', 'null'],
  maxLength,
});

const shortString = (maxLength = 80) => ({
  type: 'string',
  maxLength,
});

const promptleCellPartsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tokens', 'label', 'number', 'value', 'unit'],
  properties: {
    tokens: {
      type: 'array',
      maxItems: OUTPUT_LIMITS.promptleTokens,
      items: shortString(OUTPUT_LIMITS.promptleToken),
    },
    label: nullableShortString(OUTPUT_LIMITS.promptleSetItem),
    number: nullableShortString(OUTPUT_LIMITS.promptleToken),
    value: {
      type: ['number', 'null'],
    },
    unit: nullableShortString(OUTPUT_LIMITS.promptleUnit),
  },
};

const promptleCellSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['display', 'items', 'parts'],
  properties: {
    display: shortString(OUTPUT_LIMITS.promptleCellDisplay),
    items: {
      type: 'array',
      maxItems: OUTPUT_LIMITS.promptleSetItems,
      items: shortString(OUTPUT_LIMITS.promptleSetItem),
    },
    parts: promptleCellPartsSchema,
  },
};

export function buildPromptleResponseFormat({
  minCategories,
  maxCategories,
  minSubjects,
  maxSubjects,
  allowNonViable = false,
} = {}) {
  const minColumnItems = allowNonViable ? 0 : minCategories;
  const minAnswerItems = allowNonViable ? 0 : minSubjects;

  return strictJsonSchema(
    'promptle_generation',
    'Structured Promptle game data.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['topic', 'viable', 'reason', 'columns', 'answers'],
      properties: {
        topic: shortString(OUTPUT_LIMITS.topic),
        viable: {
          type: 'boolean',
        },
        reason: shortString(OUTPUT_LIMITS.promptleReason),
        columns: {
          type: 'array',
          minItems: minColumnItems,
          maxItems: maxCategories,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['header', 'kind', 'unit'],
            properties: {
              header: shortString(OUTPUT_LIMITS.promptleHeader),
              kind: {
                type: 'string',
                enum: ['text', 'set', 'reference', 'number'],
              },
              unit: nullableShortString(OUTPUT_LIMITS.promptleUnit),
            },
          },
        },
        answers: {
          type: 'array',
          minItems: minAnswerItems,
          maxItems: maxSubjects,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'cells'],
            properties: {
              name: shortString(OUTPUT_LIMITS.promptleSubjectName),
              cells: {
                type: 'array',
                minItems: minColumnItems,
                maxItems: maxCategories,
                items: promptleCellSchema,
              },
            },
          },
        },
      },
    }
  );
}

export const CONNECTIONS_RESPONSE_FORMAT = strictJsonSchema(
  'connections_generation',
  'Structured Connections puzzle data.',
  {
    type: 'object',
    additionalProperties: false,
    required: ['topic', 'groups'],
    properties: {
      topic: shortString(OUTPUT_LIMITS.topic),
      groups: {
        type: 'array',
        minItems: CONNECTIONS_GENERATION_CONFIG.groupCount,
        maxItems: CONNECTIONS_GENERATION_CONFIG.groupCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['category', 'difficulty', 'words', 'explanation'],
          properties: {
            category: shortString(OUTPUT_LIMITS.connectionsCategory),
            difficulty: {
              type: 'string',
              enum: ['yellow', 'green', 'blue', 'purple'],
            },
            words: {
              type: 'array',
              minItems: CONNECTIONS_GENERATION_CONFIG.wordsPerGroup,
              maxItems: CONNECTIONS_GENERATION_CONFIG.wordsPerGroup,
              items: shortString(OUTPUT_LIMITS.connectionsWord),
            },
            explanation: shortString(OUTPUT_LIMITS.connectionsExplanation),
          },
        },
      },
    },
  }
);

export const CONNECTIONS_REVIEW_RESPONSE_FORMAT = strictJsonSchema(
  'connections_board_review',
  'Structured review of a Connections board for overlap and difficulty quality.',
  {
    type: 'object',
    additionalProperties: false,
    required: ['acceptable', 'primaryIssue', 'reason'],
    properties: {
      acceptable: {
        type: 'boolean',
      },
      primaryIssue: {
        type: 'string',
        enum: ['none', 'isolated_group', 'weak_overlap', 'yellow_too_obvious', 'difficulty_balance', 'multiple'],
      },
      reason: shortString(OUTPUT_LIMITS.connectionsReviewReason),
    },
  }
);

export function buildCrosswordResponseFormat({
  minCandidates = CROSSWORD_GENERATION_CONFIG.minGeneratedCandidates,
  maxCandidates = CROSSWORD_GENERATION_CONFIG.maxGeneratedCandidates,
} = {}) {
  return strictJsonSchema(
    'crossword_candidate_generation',
    'Structured crossword candidate pool data.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['topic', 'candidates'],
      properties: {
        topic: shortString(OUTPUT_LIMITS.topic),
        candidates: {
          type: 'array',
          minItems: minCandidates,
          maxItems: maxCandidates,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['answer', 'clue', 'kind'],
            properties: {
              answer: shortString(OUTPUT_LIMITS.crosswordAnswer),
              clue: shortString(OUTPUT_LIMITS.crosswordClue),
              kind: {
                type: 'string',
                enum: ['theme', 'support'],
              },
            },
          },
        },
      },
    }
  );
}
