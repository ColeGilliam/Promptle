import test from 'node:test';
import assert from 'node:assert/strict';

const {
  GENERATED_OUTPUT_SECURITY_ERROR,
  validateCrosswordCandidatePool,
  validateConnectionsRawOutput,
  validateCrosswordRawOutput,
  validatePromptleRawOutput,
} = await import('../services/generatedOutputSecurity.js');

test('validatePromptleRawOutput rejects oversized answer arrays', () => {
  assert.throws(
    () => validatePromptleRawOutput({
      topic: 'Comics',
      columns: [
        { header: 'Subject' },
        { header: 'Publisher' },
        { header: 'Alignment' },
        { header: 'Team' },
        { header: 'Powers' },
      ],
      answers: Array.from({ length: 101 }, (_, index) => ({
        name: `Subject ${index}`,
        cells: [`Subject ${index}`, 'A', 'B', 'C', 'D'],
      })),
    }, {
      maxAnswers: 100,
      maxColumns: 6,
    }),
    { message: GENERATED_OUTPUT_SECURITY_ERROR }
  );
});

test('validateCrosswordCandidatePool honors supplied candidate max', () => {
  assert.throws(
    () => validateCrosswordCandidatePool({
      topic: 'Signs',
      candidates: Array.from({ length: 5 }, (_, index) => ({
        answer: `WORD${index}`,
        clue: `Clue ${index}`,
      })),
    }, {
      minCandidates: 1,
      maxCandidates: 4,
    }),
    { message: GENERATED_OUTPUT_SECURITY_ERROR }
  );
});

test('validateConnectionsRawOutput rejects oversized word arrays before normalization', () => {
  assert.throws(
    () => validateConnectionsRawOutput({
      topic: 'Words',
      groups: [
        { category: 'One', words: ['A', 'B', 'C', 'D', 'E'], explanation: 'Too many words.' },
        { category: 'Two', words: ['F', 'G', 'H', 'I'], explanation: 'Four words.' },
        { category: 'Three', words: ['J', 'K', 'L', 'M'], explanation: 'Four words.' },
        { category: 'Four', words: ['N', 'O', 'P', 'Q'], explanation: 'Four words.' },
      ],
    }),
    { message: GENERATED_OUTPUT_SECURITY_ERROR }
  );
});

test('validateCrosswordRawOutput rejects oversized candidate arrays before construction', () => {
  assert.throws(
    () => validateCrosswordRawOutput({
      topic: 'Signs',
      candidates: Array.from({ length: 49 }, (_, index) => ({
        answer: `WORD${index}`,
        clue: `Clue ${index}`,
        kind: 'theme',
      })),
    }),
    { message: GENERATED_OUTPUT_SECURITY_ERROR }
  );
});
