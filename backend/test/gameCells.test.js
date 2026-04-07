import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGameAnswer, normalizeGameCell, normalizeGamePayload } from '../services/gameCells.js';

test('normalizeGameCell preserves list-like values as set cells', () => {
  const cell = normalizeGameCell(['Flight', 'Strength']);

  assert.equal(cell.kind, 'set');
  assert.deepEqual(cell.items, ['Flight', 'Strength']);
  assert.equal(cell.display, 'Flight, Strength');
});

test('normalizeGameCell parses label and number from reference values', () => {
  const cell = normalizeGameCell('Amazing Spiderman #1');

  assert.equal(cell.kind, 'reference');
  assert.deepEqual(cell.parts, {
    label: 'Amazing Spiderman',
    number: '1',
    tokens: ['amazing', 'spiderman'],
  });
});

test('normalizeGameAnswer converts legacy values arrays into structured cells', () => {
  const answer = normalizeGameAnswer(
    { name: 'Spider-Man', values: ['Spider-Man', '1962', 'Super strength, Spider-Sense'] },
    ['Subject', 'Year', 'Abilities']
  );

  assert.equal(answer.name, 'Spider-Man');
  assert.equal(answer.cells[0].kind, 'text');
  assert.equal(answer.cells[1].kind, 'number');
  assert.equal(answer.cells[2].kind, 'set');
  assert.deepEqual(answer.values, ['Spider-Man', '1962', 'Super strength, Spider-Sense']);
});

test('normalizeGamePayload keeps headers and hydrates answers/correctAnswer', () => {
  const payload = normalizeGamePayload({
    topic: 'Comics',
    headers: ['Subject', 'First Appearance'],
    answers: [{ name: 'Spider-Man', values: ['Spider-Man', 'Amazing Spiderman #1'] }],
    correctAnswer: { name: 'Spider-Man', values: ['Spider-Man', 'Amazing Spiderman #1'] },
    mode: 'standard',
  });

  assert.equal(payload.topic, 'Comics');
  assert.equal(payload.answers[0].cells[1].kind, 'reference');
  assert.equal(payload.correctAnswer.cells[1].parts.number, '1');
  assert.equal(payload.mode, 'standard');
});
