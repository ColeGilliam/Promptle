import {
  buildCrosswordPuzzle,
  createCrosswordPuzzleFromGame,
  createEmptyCrosswordGuesses,
} from './crossword-game';

describe('crossword-game helpers', () => {
  it('builds a valid crossword where every word overlaps at least once', () => {
    const puzzle = createCrosswordPuzzleFromGame({
      topic: 'Fairy Tales',
      size: 11,
      entries: [
        { row: 1, col: 1, direction: 'across', answer: 'CASTLE', clue: 'Storybook fortress' },
        { row: 0, col: 2, direction: 'down', answer: 'MAGIC', clue: 'Wizardly force' },
        { row: 0, col: 5, direction: 'down', answer: 'CLOUD', clue: 'Sky puff' },
        { row: 2, col: 4, direction: 'across', answer: 'BONE', clue: 'Skeleton part' },
        { row: 2, col: 7, direction: 'down', answer: 'EMBER', clue: 'Glowing coal' },
        { row: 4, col: 2, direction: 'across', answer: 'CORD', clue: 'Rope or cable' },
        { row: 4, col: 7, direction: 'across', answer: 'BOLT', clue: 'Door fastener' },
      ],
    });

    expect(puzzle.totalFillableCells).toBeGreaterThan(20);
    expect(puzzle.clues.across.length).toBe(4);
    expect(puzzle.clues.down.length).toBe(3);
    expect(puzzle.cells[1][2]?.number).toBe(1);
    expect(puzzle.cells[4][2]?.acrossClueId).toBeTruthy();
    expect(puzzle.cells[2][7]?.downClueId).toBeTruthy();
  });


  it('throws when overlapping entries disagree on a letter', () => {
    expect(() =>
      buildCrosswordPuzzle({
        id: 'broken-grid',
        topic: 'Broken Grid',
        accent: '#000000',
        size: 4,
        entries: [
          { row: 0, col: 0, direction: 'across', answer: 'ABCD', clue: 'First' },
          { row: 0, col: 0, direction: 'down', answer: 'ZXCV', clue: 'Second' },
        ],
      })
    ).toThrowError(/Conflicting letters/);
  });

  it('throws when an entry does not overlap any other word', () => {
    expect(() =>
      buildCrosswordPuzzle({
        id: 'isolated-word',
        topic: 'Isolated Word',
        accent: '#000000',
        size: 11,
        entries: [
          { row: 1, col: 1, direction: 'across', answer: 'CASTLE', clue: 'Storybook fortress' },
          { row: 0, col: 2, direction: 'down', answer: 'MAGIC', clue: 'Wizardly force' },
          { row: 0, col: 5, direction: 'down', answer: 'CLOUD', clue: 'Sky puff' },
          { row: 2, col: 4, direction: 'across', answer: 'BONE', clue: 'Skeleton part' },
          { row: 2, col: 7, direction: 'down', answer: 'EMBER', clue: 'Glowing coal' },
          { row: 4, col: 2, direction: 'across', answer: 'CORD', clue: 'Rope or cable' },
          { row: 4, col: 7, direction: 'across', answer: 'BOLT', clue: 'Door fastener' },
          { row: 9, col: 7, direction: 'across', answer: 'GUAVA', clue: 'Tropical fruit' },
        ],
      })
    ).toThrowError(/overlap at least once|connected layout/);
  });
  
});
