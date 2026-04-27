import {
  CONNECTIONS_GENERATION_CONFIG,
  CROSSWORD_GENERATION_CONFIG,
  OUTPUT_LIMITS,
} from './gameGenerationConfig.js';

export const GENERATED_OUTPUT_SECURITY_ERROR = 'AI response failed output safety checks.';
export { OUTPUT_LIMITS };

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
// Output filtering only looks for AI refusal boilerplate; input validation handles prompt-injection text.
const SUSPICIOUS_GENERATED_TEXT_PATTERNS = [
  /\bas an ai language model\b/i,
  /\bas a language model\b/i,
  /\b(?:i\s+)?(?:can(?:not|'t)|won't)\s+(?:comply|assist|help)\b/i,
  /\bunable to comply\b/i,
];

export class GeneratedOutputSecurityError extends Error {
  constructor(reason, context = '') {
    super(GENERATED_OUTPUT_SECURITY_ERROR);
    this.name = 'GeneratedOutputSecurityError';
    this.reason = reason;
    this.context = context;
  }
}

// Helper to throw a consistent error type with reason codes for metrics and context for debugging without logging full output.
function fail(reason, context) {
  throw new GeneratedOutputSecurityError(reason, context);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringifyValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function assertArrayLength(value, { context, min = 0, max }) {
  if (!Array.isArray(value)) {
    fail('expected_array', context);
  }
  if (value.length < min || value.length > max) {
    fail('array_length_out_of_range', context);
  }
}

function assertSafeText(value, { context, maxLength, required = false }) {
  const text = stringifyValue(value);
  if (required && !text) {
    fail('empty_text', context);
  }
  if (text.length > maxLength) {
    fail('text_too_long', context);
  }
  if (CONTROL_CHARACTER_PATTERN.test(text)) {
    fail('control_character', context);
  }
  if (SUSPICIOUS_GENERATED_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    fail('suspicious_text', context);
  }
}

// Recursively scans flexible generated values, such as Promptle cell objects,
// where nested arrays/objects are allowed but still need size and text safety checks.
function scanGeneratedValue(value, {
  context,
  maxStringLength = OUTPUT_LIMITS.promptleCellDisplay,
  maxArrayLength = OUTPUT_LIMITS.promptleTokens,
  maxDepth = 4,
  depth = 0,
} = {}) {
  if (depth > maxDepth) {
    fail('object_too_deep', context);
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    if (typeof value === 'string') {
      assertSafeText(value, { context, maxLength: maxStringLength });
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > maxArrayLength) {
      fail('array_too_long', context);
    }
    value.forEach((item, index) => {
      scanGeneratedValue(item, {
        context: `${context}[${index}]`,
        maxStringLength,
        maxArrayLength,
        maxDepth,
        depth: depth + 1,
      });
    });
    return;
  }

  if (!isPlainObject(value)) {
    fail('unsupported_value', context);
  }

  Object.entries(value).forEach(([key, item]) => {
    scanGeneratedValue(item, {
      context: `${context}.${key}`,
      maxStringLength,
      maxArrayLength,
      maxDepth,
      depth: depth + 1,
    });
  });
}

// Checks the model's raw Promptle object before normalization can hide oversized or unsafe fields.
export function validatePromptleRawOutput(rawPayload, {
  minAnswers = 0,
  maxAnswers,
  maxColumns,
} = {}) {
  if (!isPlainObject(rawPayload)) {
    fail('expected_object', 'promptle');
  }

  const columns = Array.isArray(rawPayload.columns) ? rawPayload.columns : [];
  const headers = Array.isArray(rawPayload.headers) ? rawPayload.headers : [];
  const answers = Array.isArray(rawPayload.answers) ? rawPayload.answers : [];
  const viable = typeof rawPayload.viable === 'boolean' ? rawPayload.viable : null;

  assertSafeText(rawPayload.topic, {
    context: 'promptle.topic',
    maxLength: OUTPUT_LIMITS.topic,
  });
  if (viable === null) {
    fail('invalid_viable_flag', 'promptle.viable');
  }
  assertSafeText(rawPayload.reason, {
    context: 'promptle.reason',
    maxLength: OUTPUT_LIMITS.promptleReason,
  });

  if (viable && !columns.length && !headers.length) {
    fail('missing_columns', 'promptle');
  }
  if (columns.length > maxColumns || headers.length > maxColumns) {
    fail('too_many_columns', 'promptle.columns');
  }
  if (answers.length < minAnswers || answers.length > maxAnswers) {
    fail('answer_count_out_of_range', 'promptle.answers');
  }

  columns.forEach((column, index) => {
    if (!isPlainObject(column)) {
      fail('invalid_column', `promptle.columns[${index}]`);
    }
    assertSafeText(column.header, {
      context: `promptle.columns[${index}].header`,
      maxLength: OUTPUT_LIMITS.promptleHeader,
      required: true,
    });
    assertSafeText(column.unit, {
      context: `promptle.columns[${index}].unit`,
      maxLength: OUTPUT_LIMITS.promptleUnit,
    });
  });

  headers.forEach((header, index) => {
    assertSafeText(header, {
      context: `promptle.headers[${index}]`,
      maxLength: OUTPUT_LIMITS.promptleHeader,
      required: true,
    });
  });

  answers.forEach((answer, answerIndex) => {
    if (!isPlainObject(answer)) {
      fail('invalid_answer', `promptle.answers[${answerIndex}]`);
    }

    assertSafeText(answer.name, {
      context: `promptle.answers[${answerIndex}].name`,
      maxLength: OUTPUT_LIMITS.promptleSubjectName,
      required: true,
    });

    const cells = Array.isArray(answer.cells) ? answer.cells : [];
    const values = Array.isArray(answer.values) ? answer.values : [];
    if (cells.length > maxColumns || values.length > maxColumns) {
      fail('too_many_cells', `promptle.answers[${answerIndex}]`);
    }

    cells.forEach((cell, cellIndex) => {
      scanGeneratedValue(cell, {
        context: `promptle.answers[${answerIndex}].cells[${cellIndex}]`,
        maxStringLength: OUTPUT_LIMITS.promptleCellDisplay,
        maxArrayLength: OUTPUT_LIMITS.promptleTokens,
      });
    });
    values.forEach((value, valueIndex) => {
      scanGeneratedValue(value, {
        context: `promptle.answers[${answerIndex}].values[${valueIndex}]`,
        maxStringLength: OUTPUT_LIMITS.promptleCellDisplay,
        maxArrayLength: OUTPUT_LIMITS.promptleTokens,
      });
    });
  });
}

export function validatePromptlePayload(payload, {
  minAnswers,
  maxAnswers,
  minColumns = 1,
  maxColumns,
} = {}) {
  assertSafeText(payload.topic, {
    context: 'promptle.payload.topic',
    maxLength: OUTPUT_LIMITS.topic,
    required: true,
  });
  assertArrayLength(payload.headers, {
    context: 'promptle.payload.headers',
    min: minColumns,
    max: maxColumns,
  });
  assertArrayLength(payload.answers, {
    context: 'promptle.payload.answers',
    min: minAnswers,
    max: maxAnswers,
  });

  payload.headers.forEach((header, index) => {
    assertSafeText(header, {
      context: `promptle.payload.headers[${index}]`,
      maxLength: OUTPUT_LIMITS.promptleHeader,
      required: true,
    });
  });

  payload.answers.forEach((answer, answerIndex) => {
    assertSafeText(answer.name, {
      context: `promptle.payload.answers[${answerIndex}].name`,
      maxLength: OUTPUT_LIMITS.promptleSubjectName,
      required: true,
    });
    assertArrayLength(answer.cells, {
      context: `promptle.payload.answers[${answerIndex}].cells`,
      min: payload.headers.length,
      max: payload.headers.length,
    });
    answer.cells.forEach((cell, cellIndex) => {
      assertSafeText(cell.display, {
        context: `promptle.payload.answers[${answerIndex}].cells[${cellIndex}].display`,
        maxLength: OUTPUT_LIMITS.promptleCellDisplay,
        required: cellIndex === 0,
      });
      if (Array.isArray(cell.items)) {
        assertArrayLength(cell.items, {
          context: `promptle.payload.answers[${answerIndex}].cells[${cellIndex}].items`,
          max: OUTPUT_LIMITS.promptleSetItems,
        });
        cell.items.forEach((item, itemIndex) => {
          assertSafeText(item, {
            context: `promptle.payload.answers[${answerIndex}].cells[${cellIndex}].items[${itemIndex}]`,
            maxLength: OUTPUT_LIMITS.promptleSetItem,
            required: true,
          });
        });
      }
      if (cell.parts?.tokens) {
        assertArrayLength(cell.parts.tokens, {
          context: `promptle.payload.answers[${answerIndex}].cells[${cellIndex}].parts.tokens`,
          max: OUTPUT_LIMITS.promptleTokens,
        });
        cell.parts.tokens.forEach((token, tokenIndex) => {
          assertSafeText(token, {
            context: `promptle.payload.answers[${answerIndex}].cells[${cellIndex}].parts.tokens[${tokenIndex}]`,
            maxLength: OUTPUT_LIMITS.promptleToken,
          });
        });
      }
    });
  });
}

// Connections is fixed-size, so both group count and word count are enforced here.
export function validateConnectionsPayload(payload) {
  assertSafeText(payload.topic, {
    context: 'connections.topic',
    maxLength: OUTPUT_LIMITS.topic,
    required: true,
  });
  assertArrayLength(payload.groups, {
    context: 'connections.groups',
    min: CONNECTIONS_GENERATION_CONFIG.groupCount,
    max: CONNECTIONS_GENERATION_CONFIG.groupCount,
  });

  payload.groups.forEach((group, groupIndex) => {
    assertSafeText(group.category, {
      context: `connections.groups[${groupIndex}].category`,
      maxLength: OUTPUT_LIMITS.connectionsCategory,
      required: true,
    });
    assertArrayLength(group.words, {
      context: `connections.groups[${groupIndex}].words`,
      min: CONNECTIONS_GENERATION_CONFIG.wordsPerGroup,
      max: CONNECTIONS_GENERATION_CONFIG.wordsPerGroup,
    });
    group.words.forEach((word, wordIndex) => {
      assertSafeText(word, {
        context: `connections.groups[${groupIndex}].words[${wordIndex}]`,
        maxLength: OUTPUT_LIMITS.connectionsWord,
        required: true,
      });
    });
    if (group.explanation) {
      assertSafeText(group.explanation, {
        context: `connections.groups[${groupIndex}].explanation`,
        maxLength: OUTPUT_LIMITS.connectionsExplanation,
      });
    }
  });
}

// Checks the raw Connections output before normalization can hide oversized or unsafe fields.
export function validateConnectionsRawOutput(rawPayload) {
  if (!isPlainObject(rawPayload)) {
    fail('expected_object', 'connections');
  }

  assertSafeText(rawPayload.topic, {
    context: 'connections.raw.topic',
    maxLength: OUTPUT_LIMITS.topic,
  });

  const groups = Array.isArray(rawPayload.groups) ? rawPayload.groups : [];
  assertArrayLength(groups, {
    context: 'connections.raw.groups',
    min: CONNECTIONS_GENERATION_CONFIG.groupCount,
    max: CONNECTIONS_GENERATION_CONFIG.groupCount,
  });

  groups.forEach((group, groupIndex) => {
    if (!isPlainObject(group)) {
      fail('invalid_group', `connections.raw.groups[${groupIndex}]`);
    }
    assertSafeText(group.category || group.connection || group.title, {
      context: `connections.raw.groups[${groupIndex}].category`,
      maxLength: OUTPUT_LIMITS.connectionsCategory,
      required: true,
    });
    assertSafeText(group.explanation || group.reason, {
      context: `connections.raw.groups[${groupIndex}].explanation`,
      maxLength: OUTPUT_LIMITS.connectionsExplanation,
    });
    assertArrayLength(group.words, {
      context: `connections.raw.groups[${groupIndex}].words`,
      min: CONNECTIONS_GENERATION_CONFIG.wordsPerGroup,
      max: CONNECTIONS_GENERATION_CONFIG.wordsPerGroup,
    });
    group.words.forEach((word, wordIndex) => {
      assertSafeText(word, {
        context: `connections.raw.groups[${groupIndex}].words[${wordIndex}]`,
        maxLength: OUTPUT_LIMITS.connectionsWord,
        required: true,
      });
    });
  });
}

export function validateCrosswordRawOutput(rawPayload, {
  maxCandidates = CROSSWORD_GENERATION_CONFIG.maxGeneratedCandidates,
} = {}) {
  if (!isPlainObject(rawPayload)) {
    fail('expected_object', 'crossword');
  }

  const candidates =
    Array.isArray(rawPayload.candidates) ? rawPayload.candidates :
    Array.isArray(rawPayload.words) ? rawPayload.words :
    [];

  assertSafeText(rawPayload.topic, {
    context: 'crossword.topic',
    maxLength: OUTPUT_LIMITS.topic,
  });
  if (candidates.length > maxCandidates) {
    fail('too_many_candidates', 'crossword.candidates');
  }

  candidates.forEach((candidate, index) => {
    scanGeneratedValue(candidate, {
      context: `crossword.candidates[${index}]`,
      maxStringLength: OUTPUT_LIMITS.crosswordClue,
      maxArrayLength: CONNECTIONS_GENERATION_CONFIG.wordsPerGroup,
    });
  });
}

// Checks the normalized candidate pool before the crossword builder spends time placing entries.
export function validateCrosswordCandidatePool(candidatePool, {
  minCandidates = CROSSWORD_GENERATION_CONFIG.minCandidatePoolCandidates,
  maxCandidates = CROSSWORD_GENERATION_CONFIG.maxGeneratedCandidates,
} = {}) {
  assertSafeText(candidatePool.topic, {
    context: 'crossword.candidatePool.topic',
    maxLength: OUTPUT_LIMITS.topic,
    required: true,
  });
  assertArrayLength(candidatePool.candidates, {
    context: 'crossword.candidatePool.candidates',
    min: minCandidates,
    max: maxCandidates,
  });

  candidatePool.candidates.forEach((candidate, index) => {
    assertSafeText(candidate.answer, {
      context: `crossword.candidatePool.candidates[${index}].answer`,
      maxLength: OUTPUT_LIMITS.crosswordAnswer,
      required: true,
    });
    assertSafeText(candidate.clue, {
      context: `crossword.candidatePool.candidates[${index}].clue`,
      maxLength: OUTPUT_LIMITS.crosswordClue,
      required: true,
    });
  });
}

export function validateCrosswordPuzzle(puzzle) {
  assertSafeText(puzzle.topic, {
    context: 'crossword.puzzle.topic',
    maxLength: OUTPUT_LIMITS.topic,
    required: true,
  });
  assertArrayLength(puzzle.entries, {
    context: 'crossword.puzzle.entries',
    min: 1,
    max: CROSSWORD_GENERATION_CONFIG.maxEntries,
  });

  puzzle.entries.forEach((entry, index) => {
    assertSafeText(entry.answer, {
      context: `crossword.puzzle.entries[${index}].answer`,
      maxLength: OUTPUT_LIMITS.crosswordAnswer,
      required: true,
    });
    assertSafeText(entry.clue, {
      context: `crossword.puzzle.entries[${index}].clue`,
      maxLength: OUTPUT_LIMITS.crosswordClue,
      required: true,
    });
  });
}
