const MIN_GRID_SIZE = 4;
const MAX_GRID_SIZE = 15;
const MIN_ENTRY_COUNT_PER_DIRECTION = 3;
const MIN_ENTRY_LENGTH = 3;
const MAX_ENTRY_LENGTH = MAX_GRID_SIZE;
const MIN_CANDIDATE_COUNT = 18;
const BOARD_SIZES = [15, 13, 11, 9];
const TARGET_WORD_COUNTS = [12, 11, 10, 9, 8];
const MAX_SEED_CANDIDATES = 8;
const MAX_BRANCH_CANDIDATES = 8;
const MAX_BRANCH_PLACEMENTS = 12;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringifyValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function toInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function normalizeDirection(value) {
  const normalized = stringifyValue(value).toLowerCase();
  return normalized === 'across' || normalized === 'down' ? normalized : '';
}

function normalizeCandidateKind(value) {
  const normalized = stringifyValue(value).toLowerCase();
  return normalized === 'support' ? 'support' : 'theme';
}

function normalizeAnswer(value) {
  return stringifyValue(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function entryKey(entry) {
  return `${entry.row}:${entry.col}:${entry.direction}`;
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => (
    left.row - right.row ||
    left.col - right.col ||
    (left.direction === right.direction ? 0 : left.direction === 'across' ? -1 : 1)
  ));
}

function getStep(direction) {
  return direction === 'across'
    ? { rowDelta: 0, colDelta: 1 }
    : { rowDelta: 1, colDelta: 0 };
}

function getPerpendicularNeighbors(row, col, direction) {
  return direction === 'across'
    ? [{ row: row - 1, col }, { row: row + 1, col }]
    : [{ row, col: col - 1 }, { row, col: col + 1 }];
}

function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function isInsideBoard(size, row, col) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function getCell(board, row, col) {
  return isInsideBoard(board.length, row, col) ? board[row][col] : null;
}

function cellIsOccupied(board, row, col) {
  return !!getCell(board, row, col);
}

// Favor theme entries and medium-length answers that are easier to cross cleanly.
function candidateQualityScore(candidate) {
  const uniqueCharacterCount = new Set(candidate.answer.split('')).size;
  return [
    candidate.kind === 'theme' ? 0 : 1,
    Math.abs(candidate.answer.length - 6),
    -candidate.answer.length,
    -uniqueCharacterCount,
    candidate.answer,
  ];
}

function compareCandidateScores(left, right) {
  const leftScore = candidateQualityScore(left);
  const rightScore = candidateQualityScore(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] < rightScore[index]) return -1;
    if (leftScore[index] > rightScore[index]) return 1;
  }
  return 0;
}

function compareSeedCandidates(left, right) {
  const leftScore = [
    left.kind === 'theme' ? 0 : 1,
    -left.answer.length,
    ...candidateQualityScore(left),
  ];
  const rightScore = [
    right.kind === 'theme' ? 0 : 1,
    -right.answer.length,
    ...candidateQualityScore(right),
  ];

  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] < rightScore[index]) return -1;
    if (leftScore[index] > rightScore[index]) return 1;
  }
  return 0;
}

function comparePlacements(left, right, boardSize) {
  const boardCenter = (boardSize - 1) / 2;
  const leftDistance = Math.abs(left.anchor.row - boardCenter) + Math.abs(left.anchor.col - boardCenter);
  const rightDistance = Math.abs(right.anchor.row - boardCenter) + Math.abs(right.anchor.col - boardCenter);
  const leftScore = [-left.crossedEntryIds.length, leftDistance, left.direction === 'across' ? 0 : 1];
  const rightScore = [-right.crossedEntryIds.length, rightDistance, right.direction === 'across' ? 0 : 1];

  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] < rightScore[index]) return -1;
    if (leftScore[index] > rightScore[index]) return 1;
  }
  return 0;
}

// Start the first entry near the center so later crossings can grow outward in either direction.
function createSeedPlacements(candidate, boardSize) {
  const placements = [];
  const center = Math.floor(boardSize / 2);
  const centeredStart = Math.floor((boardSize - candidate.answer.length) / 2);
  const offsets = [0, -1, 1, -2, 2];

  for (const direction of ['across', 'down']) {
    for (const offset of offsets) {
      if (direction === 'across') {
        const row = center + offset;
        const col = centeredStart;
        if (row < 0 || row >= boardSize || col < 0 || col + candidate.answer.length > boardSize) continue;
        placements.push({
          candidate,
          row,
          col,
          direction,
          crossedEntryIds: [],
          anchor: { row, col: col + Math.floor(candidate.answer.length / 2) },
        });
      } else {
        const row = centeredStart;
        const col = center + offset;
        if (col < 0 || col >= boardSize || row < 0 || row + candidate.answer.length > boardSize) continue;
        placements.push({
          candidate,
          row,
          col,
          direction,
          crossedEntryIds: [],
          anchor: { row: row + Math.floor(candidate.answer.length / 2), col },
        });
      }
    }
  }

  return placements;
}

// A new answer must cross existing fill without running alongside it or reusing the same direction.
function canPlaceCandidate(candidate, row, col, direction, board) {
  const size = board.length;
  const { rowDelta, colDelta } = getStep(direction);
  const crossedEntryIds = new Map();

  const beforeRow = row - rowDelta;
  const beforeCol = col - colDelta;
  const afterRow = row + rowDelta * candidate.answer.length;
  const afterCol = col + colDelta * candidate.answer.length;

  if (cellIsOccupied(board, beforeRow, beforeCol) || cellIsOccupied(board, afterRow, afterCol)) {
    return null;
  }

  for (let index = 0; index < candidate.answer.length; index += 1) {
    const currentRow = row + rowDelta * index;
    const currentCol = col + colDelta * index;

    if (!isInsideBoard(size, currentRow, currentCol)) {
      return null;
    }

    const existingCell = board[currentRow][currentCol];
    if (!existingCell) {
      for (const neighbor of getPerpendicularNeighbors(currentRow, currentCol, direction)) {
        if (cellIsOccupied(board, neighbor.row, neighbor.col)) {
          return null;
        }
      }
      continue;
    }

    if (existingCell.letter !== candidate.answer[index]) {
      return null;
    }

    if (direction === 'across') {
      if (existingCell.acrossEntryId || !existingCell.downEntryId) {
        return null;
      }
      crossedEntryIds.set(existingCell.downEntryId, (crossedEntryIds.get(existingCell.downEntryId) || 0) + 1);
    } else {
      if (existingCell.downEntryId || !existingCell.acrossEntryId) {
        return null;
      }
      crossedEntryIds.set(existingCell.acrossEntryId, (crossedEntryIds.get(existingCell.acrossEntryId) || 0) + 1);
    }
  }

  if (!crossedEntryIds.size) {
    return null;
  }

  if ([...crossedEntryIds.values()].some((count) => count > 1)) {
    return null;
  }

  return {
    candidate,
    row,
    col,
    direction,
    crossedEntryIds: [...crossedEntryIds.keys()],
    anchor: {
      row: row + rowDelta * Math.floor(candidate.answer.length / 2),
      col: col + colDelta * Math.floor(candidate.answer.length / 2),
    },
  };
}

function findCandidatePlacements(candidate, board) {
  const placements = [];
  const seenPlacementKeys = new Set();

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board.length; col += 1) {
      const cell = board[row][col];
      if (!cell) continue;

      for (let index = 0; index < candidate.answer.length; index += 1) {
        if (candidate.answer[index] !== cell.letter) continue;

        if (cell.acrossEntryId && !cell.downEntryId) {
          const placement = canPlaceCandidate(candidate, row - index, col, 'down', board);
          if (!placement) continue;
          const placementKey = `${placement.row}:${placement.col}:${placement.direction}`;
          if (seenPlacementKeys.has(placementKey)) continue;
          seenPlacementKeys.add(placementKey);
          placements.push(placement);
        }

        if (cell.downEntryId && !cell.acrossEntryId) {
          const placement = canPlaceCandidate(candidate, row, col - index, 'across', board);
          if (!placement) continue;
          const placementKey = `${placement.row}:${placement.col}:${placement.direction}`;
          if (seenPlacementKeys.has(placementKey)) continue;
          seenPlacementKeys.add(placementKey);
          placements.push(placement);
        }
      }
    }
  }

  return placements.sort((left, right) => comparePlacements(left, right, board.length));
}

function applyPlacement(state, placement) {
  const nextBoard = cloneBoard(state.board);
  const { rowDelta, colDelta } = getStep(placement.direction);

  for (let index = 0; index < placement.candidate.answer.length; index += 1) {
    const currentRow = placement.row + rowDelta * index;
    const currentCol = placement.col + colDelta * index;
    const existingCell = nextBoard[currentRow][currentCol];

    if (!existingCell) {
      nextBoard[currentRow][currentCol] = {
        letter: placement.candidate.answer[index],
        acrossEntryId: placement.direction === 'across' ? placement.candidate.answer : null,
        downEntryId: placement.direction === 'down' ? placement.candidate.answer : null,
      };
      continue;
    }

    if (placement.direction === 'across') {
      existingCell.acrossEntryId = placement.candidate.answer;
    } else {
      existingCell.downEntryId = placement.candidate.answer;
    }
  }

  const nextEntries = state.placedEntries.map((entry) => (
    placement.crossedEntryIds.includes(entry.answer)
      ? { ...entry, hasCrossing: true }
      : entry
  ));

  nextEntries.push({
    answer: placement.candidate.answer,
    clue: placement.candidate.clue,
    kind: placement.candidate.kind,
    row: placement.row,
    col: placement.col,
    direction: placement.direction,
    hasCrossing: placement.crossedEntryIds.length > 0,
  });

  return {
    board: nextBoard,
    placedEntries: nextEntries,
    usedAnswers: new Set([...state.usedAnswers, placement.candidate.answer]),
  };
}

function countEntriesByDirection(entries) {
  return entries.reduce((counts, entry) => {
    counts[entry.direction] += 1;
    return counts;
  }, { across: 0, down: 0 });
}

function isAcceptablePlacedState(state) {
  if (state.placedEntries.length < MIN_ENTRY_COUNT_PER_DIRECTION * 2) {
    return false;
  }

  const counts = countEntriesByDirection(state.placedEntries);
  return (
    counts.across >= MIN_ENTRY_COUNT_PER_DIRECTION &&
    counts.down >= MIN_ENTRY_COUNT_PER_DIRECTION &&
    state.placedEntries.every((entry) => entry.hasCrossing)
  );
}

// This is a bounded backtracking search: try the most constrained candidates first,
// then give each one only a small set of strong placements before recursing.
function searchPlacedLayout(state, candidates, targetWordCount) {
  if (state.placedEntries.length >= targetWordCount && isAcceptablePlacedState(state)) {
    return state;
  }

  const options = [];
  for (const candidate of candidates) {
    if (state.usedAnswers.has(candidate.answer)) continue;
    const placements = findCandidatePlacements(candidate, state.board);
    if (!placements.length) continue;
    options.push({ candidate, placements });
  }

  if (!options.length) {
    return null;
  }

  options.sort((left, right) => (
    left.placements.length - right.placements.length ||
    compareCandidateScores(left.candidate, right.candidate)
  ));

  for (const option of options.slice(0, MAX_BRANCH_CANDIDATES)) {
    for (const placement of option.placements.slice(0, MAX_BRANCH_PLACEMENTS)) {
      const result = searchPlacedLayout(applyPlacement(state, placement), candidates, targetWordCount);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

// Re-center the finished layout into the smallest padded square we can return to the client.
function finalizePlacedEntries(placedEntries) {
  const bounds = placedEntries.reduce((accumulator, entry) => {
    const { rowDelta, colDelta } = getStep(entry.direction);
    const endRow = entry.row + rowDelta * (entry.answer.length - 1);
    const endCol = entry.col + colDelta * (entry.answer.length - 1);
    return {
      minRow: Math.min(accumulator.minRow, entry.row, endRow),
      maxRow: Math.max(accumulator.maxRow, entry.row, endRow),
      minCol: Math.min(accumulator.minCol, entry.col, endCol),
      maxCol: Math.max(accumulator.maxCol, entry.col, endCol),
    };
  }, {
    minRow: Number.POSITIVE_INFINITY,
    maxRow: Number.NEGATIVE_INFINITY,
    minCol: Number.POSITIVE_INFINITY,
    maxCol: Number.NEGATIVE_INFINITY,
  });

  const height = bounds.maxRow - bounds.minRow + 1;
  const width = bounds.maxCol - bounds.minCol + 1;
  const finalSize = Math.max(
    MIN_GRID_SIZE,
    Math.min(MAX_GRID_SIZE, Math.max(height, width) + 2)
  );

  const rowOffset = Math.floor((finalSize - height) / 2) - bounds.minRow;
  const colOffset = Math.floor((finalSize - width) / 2) - bounds.minCol;

  return {
    size: finalSize,
    entries: sortEntries(placedEntries.map((entry) => ({
      row: entry.row + rowOffset,
      col: entry.col + colOffset,
      direction: entry.direction,
      answer: entry.answer,
      clue: entry.clue,
    }))),
  };
}

// A placed entry can touch other words only at true crossings, never side-by-side or end-to-end.
function validateEntryIsolation(entry, grid) {
  const { rowDelta, colDelta } = getStep(entry.direction);
  const beforeRow = entry.row - rowDelta;
  const beforeCol = entry.col - colDelta;
  const afterRow = entry.row + rowDelta * entry.answer.length;
  const afterCol = entry.col + colDelta * entry.answer.length;

  if (cellIsOccupied(grid, beforeRow, beforeCol) || cellIsOccupied(grid, afterRow, afterCol)) {
    throw new Error(`Crossword entry "${entry.answer}" is touching another word end-to-end.`);
  }

  for (let index = 0; index < entry.answer.length; index += 1) {
    const currentRow = entry.row + rowDelta * index;
    const currentCol = entry.col + colDelta * index;
    const cell = grid[currentRow][currentCol];

    if (!cell) {
      throw new Error(`Crossword entry "${entry.answer}" is missing cell data at row ${currentRow}, col ${currentCol}.`);
    }

    const isCrossing = !!cell.acrossEntryId && !!cell.downEntryId;
    if (isCrossing) {
      continue;
    }

    for (const neighbor of getPerpendicularNeighbors(currentRow, currentCol, entry.direction)) {
      if (cellIsOccupied(grid, neighbor.row, neighbor.col)) {
        throw new Error(`Crossword entry "${entry.answer}" has an unchecked touch at row ${currentRow}, col ${currentCol}.`);
      }
    }
  }
}

// Track both connectivity and "every word crosses at least once" from the finished cell map.
function buildEntryGraph(entries, grid) {
  const adjacency = new Map(entries.map((entry) => [entry.answer, new Set()]));
  const crossingCount = new Map(entries.map((entry) => [entry.answer, 0]));

  for (const row of grid) {
    for (const cell of row) {
      if (!cell?.acrossEntryId || !cell?.downEntryId) continue;
      adjacency.get(cell.acrossEntryId)?.add(cell.downEntryId);
      adjacency.get(cell.downEntryId)?.add(cell.acrossEntryId);
      crossingCount.set(cell.acrossEntryId, (crossingCount.get(cell.acrossEntryId) || 0) + 1);
      crossingCount.set(cell.downEntryId, (crossingCount.get(cell.downEntryId) || 0) + 1);
    }
  }

  return { adjacency, crossingCount };
}

export function normalizeCrosswordCandidatePool(rawPayload, fallbackTopic = '') {
  const payload = isPlainObject(rawPayload) ? rawPayload : {};
  const topic = stringifyValue(payload.topic) || stringifyValue(fallbackTopic);
  const rawCandidates =
    Array.isArray(payload.candidates) ? payload.candidates :
    Array.isArray(payload.words) ? payload.words :
    [];

  if (!topic) {
    throw new Error('Crossword candidate pool is missing a topic.');
  }

  if (!rawCandidates.length) {
    throw new Error('Crossword candidate pool must contain candidates.');
  }

  const candidatesByAnswer = new Map();

  rawCandidates.forEach((rawCandidate, index) => {
    const candidate = isPlainObject(rawCandidate) ? rawCandidate : {};
    const answer = normalizeAnswer(candidate.answer || candidate.word);
    const clue = stringifyValue(candidate.clue || candidate.hint);
    const kind = normalizeCandidateKind(candidate.kind || candidate.type || candidate.tier);

    if (answer.length < MIN_ENTRY_LENGTH || answer.length > MAX_ENTRY_LENGTH) {
      return;
    }

    if (!clue) {
      return;
    }

    // If the model repeats an answer, keep the theme version over a support-fill version.
    const existing = candidatesByAnswer.get(answer);
    if (!existing || (existing.kind === 'support' && kind === 'theme')) {
      candidatesByAnswer.set(answer, { answer, clue, kind });
    }
  });

  const candidates = [...candidatesByAnswer.values()].sort(compareCandidateScores);

  if (candidates.length < MIN_CANDIDATE_COUNT) {
    throw new Error(`Crossword candidate pool must contain at least ${MIN_CANDIDATE_COUNT} unique candidates.`);
  }

  return {
    topic,
    candidates,
  };
}

export function buildCrosswordGameFromCandidatePool(candidatePool) {
  // Trim to the strongest pool first, then try a few central seeds across progressively smaller boards.
  const candidates = [...candidatePool.candidates]
    .sort(compareCandidateScores)
    .slice(0, Math.max(MIN_CANDIDATE_COUNT, MAX_SEED_CANDIDATES * 4));
  const seedCandidates = [...candidates].sort(compareSeedCandidates).slice(0, MAX_SEED_CANDIDATES);

  for (const boardSize of BOARD_SIZES) {
    for (const targetWordCount of TARGET_WORD_COUNTS) {
      for (const seedCandidate of seedCandidates) {
        for (const seedPlacement of createSeedPlacements(seedCandidate, boardSize)) {
          const seedState = applyPlacement({
            board: createEmptyBoard(boardSize),
            placedEntries: [],
            usedAnswers: new Set(),
          }, seedPlacement);

          const result = searchPlacedLayout(seedState, candidates, targetWordCount);
          if (!result) {
            continue;
          }

          const finalized = finalizePlacedEntries(result.placedEntries);
          const puzzle = normalizeCrosswordGamePayload({
            topic: candidatePool.topic,
            size: finalized.size,
            entries: finalized.entries,
          }, candidatePool.topic);

          return {
            puzzle,
            stats: {
              boardSize,
              targetWordCount,
              actualWordCount: finalized.entries.length,
            },
          };
        }
      }
    }
  }

  throw new Error('Could not construct a valid crossword from the candidate pool.');
}

export function normalizeCrosswordGamePayload(rawPayload, fallbackTopic = '') {
  const payload = isPlainObject(rawPayload) ? rawPayload : {};
  const topic = stringifyValue(payload.topic) || stringifyValue(fallbackTopic);
  const size = toInteger(payload.size);
  const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];

  if (!topic) {
    throw new Error('Crossword game is missing a topic.');
  }

  if (size === null || size < MIN_GRID_SIZE || size > MAX_GRID_SIZE) {
    throw new Error(`Crossword size must be an integer between ${MIN_GRID_SIZE} and ${MAX_GRID_SIZE}.`);
  }

  if (!rawEntries.length) {
    throw new Error('Crossword game must contain entries.');
  }

  const seenEntryKeys = new Set();
  const entries = rawEntries.map((rawEntry, index) => {
    const entry = isPlainObject(rawEntry) ? rawEntry : {};
    const row = toInteger(entry.row);
    const col = toInteger(entry.col);
    const direction = normalizeDirection(entry.direction);
    const answer = normalizeAnswer(entry.answer);
    const clue = stringifyValue(entry.clue);

    if (row === null || col === null) {
      throw new Error(`Crossword entry ${index + 1} must include integer row and col values.`);
    }

    if (!direction) {
      throw new Error(`Crossword entry ${index + 1} must have direction "across" or "down".`);
    }

    if (answer.length < MIN_ENTRY_LENGTH) {
      throw new Error(`Crossword entry ${index + 1} answer must be at least ${MIN_ENTRY_LENGTH} characters.`);
    }

    if (answer.length > MAX_ENTRY_LENGTH) {
      throw new Error(`Crossword entry ${index + 1} answer must be at most ${MAX_ENTRY_LENGTH} characters.`);
    }

    if (!clue) {
      throw new Error(`Crossword entry ${index + 1} is missing a clue.`);
    }

    const normalizedEntry = { row, col, direction, answer, clue };
    const normalizedKey = entryKey(normalizedEntry);
    if (seenEntryKeys.has(normalizedKey)) {
      throw new Error(`Duplicate crossword entry start detected at ${normalizedKey}.`);
    }

    seenEntryKeys.add(normalizedKey);
    return normalizedEntry;
  });

  const grid = createEmptyBoard(size);

  for (const entry of entries) {
    const { rowDelta, colDelta } = getStep(entry.direction);
    const endRow = entry.row + rowDelta * (entry.answer.length - 1);
    const endCol = entry.col + colDelta * (entry.answer.length - 1);

    if (!isInsideBoard(size, entry.row, entry.col) || !isInsideBoard(size, endRow, endCol)) {
      throw new Error(`Crossword entry "${entry.answer}" exceeds the ${size}x${size} grid.`);
    }

    for (let index = 0; index < entry.answer.length; index += 1) {
      const currentRow = entry.row + rowDelta * index;
      const currentCol = entry.col + colDelta * index;
      const letter = entry.answer[index];
      const existing = grid[currentRow][currentCol];

      if (existing && existing.letter !== letter) {
        throw new Error(
          `Conflicting crossword letters at row ${currentRow}, col ${currentCol}: "${existing.letter}" vs "${letter}".`
        );
      }

      if (existing && ((entry.direction === 'across' && existing.acrossEntryId) || (entry.direction === 'down' && existing.downEntryId))) {
        throw new Error(`Crossword entry "${entry.answer}" overlaps another ${entry.direction} word at row ${currentRow}, col ${currentCol}.`);
      }

      if (!existing) {
        grid[currentRow][currentCol] = {
          letter,
          acrossEntryId: entry.direction === 'across' ? entry.answer : null,
          downEntryId: entry.direction === 'down' ? entry.answer : null,
        };
      } else if (entry.direction === 'across') {
        existing.acrossEntryId = entry.answer;
      } else {
        existing.downEntryId = entry.answer;
      }
    }
  }

  const counts = countEntriesByDirection(entries);
  if (counts.across < MIN_ENTRY_COUNT_PER_DIRECTION || counts.down < MIN_ENTRY_COUNT_PER_DIRECTION) {
    throw new Error(
      `Crossword must contain at least ${MIN_ENTRY_COUNT_PER_DIRECTION} across and ${MIN_ENTRY_COUNT_PER_DIRECTION} down entries.`
    );
  }

  for (const entry of entries) {
    validateEntryIsolation(entry, grid);
  }

  const { adjacency, crossingCount } = buildEntryGraph(entries, grid);
  for (const entry of entries) {
    if ((crossingCount.get(entry.answer) || 0) < 1) {
      throw new Error(`Crossword entry "${entry.answer}" must overlap at least once with another word.`);
    }
  }

  const queue = [entries[0].answer];
  const visited = new Set(queue);
  while (queue.length) {
    const current = queue.shift();
    for (const neighbor of adjacency.get(current) || []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  if (visited.size !== entries.length) {
    throw new Error('Crossword entries must form a single connected layout.');
  }

  return {
    topic,
    size,
    entries: sortEntries(entries),
  };
}

export {
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  MIN_ENTRY_LENGTH,
  MAX_ENTRY_LENGTH,
  MIN_CANDIDATE_COUNT,
};
