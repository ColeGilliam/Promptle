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

test('normalizeGameCell keeps single-item arrays as set cells', () => {
  const cell = normalizeGameCell(['Dealer']);

  assert.equal(cell.kind, 'set');
  assert.deepEqual(cell.items, ['Dealer']);
  assert.equal(cell.display, 'Dealer');
});

test('normalizeGameCell parses measurements as number cells', () => {
  const cell = normalizeGameCell('2.5 m');

  assert.equal(cell.kind, 'number');
  assert.equal(cell.display, '2.5 m');
  assert.deepEqual(cell.parts, {
    value: 2.5,
    unit: 'm',
  });
});

test('normalizeGameCell appends the declared unit to numeric display values', () => {
  const cell = normalizeGameCell(72, { header: 'Height', kind: 'number', unit: 'in' });

  assert.equal(cell.kind, 'number');
  assert.equal(cell.display, '72 in');
  assert.deepEqual(cell.parts, {
    value: 72,
    unit: 'in',
  });
});

test('normalizeGameCell uses column kind to normalize numeric identifiers', () => {
  const cell = normalizeGameCell(
    {
      display: '131',
      kind: 'reference',
      parts: {
        label: 'Pokedex Number',
        number: '131',
      },
    },
    { header: 'Pokedex Number', kind: 'number' }
  );

  assert.equal(cell.kind, 'number');
  assert.deepEqual(cell.parts, {
    value: 131,
    unit: '',
  });
});

test('normalizeGameCell uses column kind to keep title columns as text', () => {
  const cell = normalizeGameCell(
    {
      display: 'Guardians of the Galaxy',
      kind: 'reference',
      parts: {
        label: 'Movies',
        number: '1',
      },
    },
    { header: 'Movies', kind: 'text' }
  );

  assert.equal(cell.kind, 'text');
  assert.deepEqual(cell.parts, {
    tokens: ['guardians', 'of', 'the', 'galaxy'],
  });
});

test('normalizeGameCell keeps explicit references when the column declares reference semantics', () => {
  const cell = normalizeGameCell(
    {
      display: 'The Incredible Hulk #271',
      parts: {
        label: 'The Incredible Hulk',
        number: '271',
      },
    },
    { header: 'First Appearance', kind: 'reference' }
  );

  assert.equal(cell.kind, 'reference');
  assert.deepEqual(cell.parts, {
    label: 'The Incredible Hulk',
    number: '271',
    tokens: ['the', 'incredible', 'hulk'],
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
    columns: [
      { header: 'Subject', kind: 'text' },
      { header: 'First Appearance', kind: 'reference' },
    ],
    answers: [{ name: 'Spider-Man', values: ['Spider-Man', 'Amazing Spiderman #1'] }],
    correctAnswer: { name: 'Spider-Man', values: ['Spider-Man', 'Amazing Spiderman #1'] },
    mode: 'standard',
  });

  assert.equal(payload.topic, 'Comics');
  assert.deepEqual(payload.headers, ['Subject', 'First Appearance']);
  assert.deepEqual(payload.columns, [
    { header: 'Subject', kind: 'text' },
    { header: 'First Appearance', kind: 'reference' },
  ]);
  assert.equal(payload.answers[0].cells[1].kind, 'reference');
  assert.equal(payload.correctAnswer.cells[1].parts.number, '1');
  assert.equal(payload.mode, 'standard');
});
