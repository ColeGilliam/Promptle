import { hydrateGameCell } from './setup-game';

describe('hydrateGameCell', () => {
  it('keeps single-item arrays as set cells', () => {
    const cell = hydrateGameCell(['Dealer']);

    expect(cell.kind).toBe('set');
    expect(cell.items).toEqual(['Dealer']);
    expect(cell.display).toBe('Dealer');
  });

  it('parses measurements as number cells', () => {
    const cell = hydrateGameCell('2.5 m');

    expect(cell.kind).toBe('number');
    expect(cell.display).toBe('2.5 m');
    expect(cell.parts).toEqual({
      value: 2.5,
      unit: 'm',
    });
  });

  it('appends the declared unit to numeric display values', () => {
    const cell = hydrateGameCell(72, { header: 'Height', kind: 'number', unit: 'in' });

    expect(cell.kind).toBe('number');
    expect(cell.display).toBe('72 in');
    expect(cell.parts).toEqual({
      value: 72,
      unit: 'in',
    });
  });

  it('uses column kind to normalize numeric identifiers', () => {
    const cell = hydrateGameCell(
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

    expect(cell.kind).toBe('number');
    expect(cell.parts).toEqual({
      value: 131,
      unit: '',
    });
  });

  it('uses column kind to keep title columns as text', () => {
    const cell = hydrateGameCell(
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

    expect(cell.kind).toBe('text');
    expect(cell.parts).toEqual({
      tokens: ['guardians', 'of', 'the', 'galaxy'],
    });
  });

  it('keeps explicit references when the column declares reference semantics', () => {
    const cell = hydrateGameCell(
      {
        display: 'The Incredible Hulk #271',
        parts: {
          label: 'The Incredible Hulk',
          number: '271',
        },
      },
      { header: 'First Appearance', kind: 'reference' }
    );

    expect(cell.kind).toBe('reference');
    expect(cell.parts).toEqual({
      label: 'The Incredible Hulk',
      number: '271',
      tokens: ['the', 'incredible', 'hulk'],
    });
  });
});
