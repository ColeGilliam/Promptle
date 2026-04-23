import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DailyGameMeta } from './setup-game';

export type CrosswordDirection = 'across' | 'down';

export interface CrosswordPosition {
  row: number;
  col: number;
}

export interface CrosswordEntryDefinition {
  row: number;
  col: number;
  direction: CrosswordDirection;
  answer: string;
  clue: string;
}

export interface CrosswordGameData {
  topic: string;
  size: number;
  entries: CrosswordEntryDefinition[];
  dailyGame?: DailyGameMeta;
}

export interface CrosswordPuzzleDefinition extends CrosswordGameData {
  id: string;
  accent: string;
}

export interface CrosswordCell {
  row: number;
  col: number;
  solution: string;
  number: number | null;
  acrossClueId: string | null;
  downClueId: string | null;
}

export interface CrosswordClue extends CrosswordEntryDefinition {
  id: string;
  number: number;
  answer: string;
  cells: CrosswordPosition[];
}

export interface CrosswordPuzzle extends CrosswordPuzzleDefinition {
  cells: (CrosswordCell | null)[][];
  clues: {
    across: CrosswordClue[];
    down: CrosswordClue[];
    all: CrosswordClue[];
  };
  totalFillableCells: number;
}

interface CrosswordOccupancy {
  acrossOwnerId: string | null;
  downOwnerId: string | null;
}

interface NormalizedCrosswordEntry extends CrosswordEntryDefinition {
  answer: string;
  clue: string;
  localId: string;
}

const MIN_GRID_SIZE = 4;
const MAX_GRID_SIZE = 15;
const MIN_ENTRY_LENGTH = 3;
const MIN_ENTRY_COUNT_PER_DIRECTION = 3;
const ACCENT_PALETTE = ['#14b8a6', '#3b82f6', '#f97316', '#ec4899', '#8b5cf6', '#22c55e'];
const ANSWER_PATTERN = /^[A-Z0-9]+$/;

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toUpperCase();
}

function sortEntries(entries: CrosswordEntryDefinition[]): CrosswordEntryDefinition[] {
  return [...entries].sort((left, right) =>
    left.row - right.row ||
    left.col - right.col ||
    (left.direction === right.direction ? 0 : left.direction === 'across' ? -1 : 1)
  );
}

function getStep(direction: CrosswordDirection): { rowDelta: number; colDelta: number } {
  return direction === 'across'
    ? { rowDelta: 0, colDelta: 1 }
    : { rowDelta: 1, colDelta: 0 };
}

function getPerpendicularNeighbors(row: number, col: number, direction: CrosswordDirection): CrosswordPosition[] {
  return direction === 'across'
    ? [{ row: row - 1, col }, { row: row + 1, col }]
    : [{ row, col: col - 1 }, { row, col: col + 1 }];
}

function hasPlayableCell(cells: (CrosswordCell | null)[][], row: number, col: number): boolean {
  return row >= 0 && row < cells.length && col >= 0 && col < cells.length && !!cells[row][col];
}

function requireThemeColor(topic: string): string {
  let hash = 0;
  for (const char of topic) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

// Sparse layouts are allowed, but words may only meet at real crossings.
function validateEntryIsolation(
  definition: CrosswordPuzzleDefinition,
  entry: NormalizedCrosswordEntry,
  cells: (CrosswordCell | null)[][],
  ownership: CrosswordOccupancy[][]
): void {
  const { rowDelta, colDelta } = getStep(entry.direction);
  const beforeRow = entry.row - rowDelta;
  const beforeCol = entry.col - colDelta;
  const afterRow = entry.row + rowDelta * entry.answer.length;
  const afterCol = entry.col + colDelta * entry.answer.length;

  if (hasPlayableCell(cells, beforeRow, beforeCol) || hasPlayableCell(cells, afterRow, afterCol)) {
    throw new Error(`Entry ${entry.answer} is touching another word end-to-end in ${definition.id}.`);
  }

  for (let index = 0; index < entry.answer.length; index += 1) {
    const row = entry.row + rowDelta * index;
    const col = entry.col + colDelta * index;
    const currentCell = cells[row][col];
    const currentOwnership = ownership[row][col];

    if (!currentCell) {
      throw new Error(`Missing cell metadata while validating ${definition.id}/${entry.answer}`);
    }

    const isCrossing = !!currentOwnership.acrossOwnerId && !!currentOwnership.downOwnerId;
    if (isCrossing) continue;

    for (const neighbor of getPerpendicularNeighbors(row, col, entry.direction)) {
      if (hasPlayableCell(cells, neighbor.row, neighbor.col)) {
        throw new Error(`Entry ${entry.answer} has an unchecked touch at ${row},${col} in ${definition.id}.`);
      }
    }
  }
}

export function buildCrosswordPuzzle(definition: CrosswordPuzzleDefinition): CrosswordPuzzle {
  if (!Number.isInteger(definition.size) || definition.size < MIN_GRID_SIZE || definition.size > MAX_GRID_SIZE) {
    throw new Error(`Crossword size must be between ${MIN_GRID_SIZE} and ${MAX_GRID_SIZE}.`);
  }

  const cells: (CrosswordCell | null)[][] = Array.from({ length: definition.size }, () =>
    Array.from({ length: definition.size }, () => null)
  );
  const ownership: CrosswordOccupancy[][] = Array.from({ length: definition.size }, () =>
    Array.from({ length: definition.size }, () => ({ acrossOwnerId: null, downOwnerId: null }))
  );
  const startDirections = new Map<string, Set<CrosswordDirection>>();
  const seenEntryKeys = new Set<string>();
  const crossingGraph = new Map<string, Set<string>>();

  const entries: NormalizedCrosswordEntry[] = sortEntries(definition.entries).map((entry, index) => ({
    ...entry,
    answer: normalizeAnswer(entry.answer),
    clue: entry.clue.trim(),
    localId: `${entry.row}:${entry.col}:${entry.direction}:${index}`,
  }));

  for (const entry of entries) {
    if (!ANSWER_PATTERN.test(entry.answer)) {
      throw new Error(`Crossword answers must be alphanumeric: ${definition.id}/${entry.answer}`);
    }

    if (entry.answer.length < MIN_ENTRY_LENGTH) {
      throw new Error(`Crossword answers must be at least ${MIN_ENTRY_LENGTH} characters long.`);
    }

    if (!entry.clue) {
      throw new Error(`Crossword clues must be non-empty: ${definition.id}/${entry.answer}`);
    }

    const normalizedEntryKey = `${entry.row}:${entry.col}:${entry.direction}`;
    if (seenEntryKeys.has(normalizedEntryKey)) {
      throw new Error(`Duplicate crossword entry start: ${normalizedEntryKey}`);
    }
    seenEntryKeys.add(normalizedEntryKey);
    crossingGraph.set(entry.localId, new Set<string>());

    startDirections.set(
      cellKey(entry.row, entry.col),
      (startDirections.get(cellKey(entry.row, entry.col)) ?? new Set<CrosswordDirection>()).add(entry.direction)
    );

    const { rowDelta, colDelta } = getStep(entry.direction);

    entry.answer.split('').forEach((letter, index) => {
      const row = entry.row + rowDelta * index;
      const col = entry.col + colDelta * index;

      if (row < 0 || row >= definition.size || col < 0 || col >= definition.size) {
        throw new Error(`Entry ${entry.answer} exceeds grid bounds in ${definition.id}`);
      }

      const existingCell = cells[row][col];
      if (existingCell && existingCell.solution !== letter) {
        throw new Error(
          `Conflicting letters in ${definition.id} at ${row},${col}: ${existingCell.solution} vs ${letter}`
        );
      }

      const currentOwnership = ownership[row][col];
      if (entry.direction === 'across' && currentOwnership.acrossOwnerId) {
        throw new Error(`Across entry overlap detected in ${definition.id} at ${row},${col}.`);
      }
      if (entry.direction === 'down' && currentOwnership.downOwnerId) {
        throw new Error(`Down entry overlap detected in ${definition.id} at ${row},${col}.`);
      }

      if (!existingCell) {
        cells[row][col] = {
          row,
          col,
          solution: letter,
          number: null,
          acrossClueId: null,
          downClueId: null,
        };
      }

      if (entry.direction === 'across') {
        if (currentOwnership.downOwnerId) {
          crossingGraph.get(entry.localId)?.add(currentOwnership.downOwnerId);
          crossingGraph.get(currentOwnership.downOwnerId)?.add(entry.localId);
        }
        currentOwnership.acrossOwnerId = entry.localId;
      } else {
        if (currentOwnership.acrossOwnerId) {
          crossingGraph.get(entry.localId)?.add(currentOwnership.acrossOwnerId);
          crossingGraph.get(currentOwnership.acrossOwnerId)?.add(entry.localId);
        }
        currentOwnership.downOwnerId = entry.localId;
      }
    });
  }

  const directionCounts = entries.reduce((counts, entry) => {
    counts[entry.direction] += 1;
    return counts;
  }, { across: 0, down: 0 });

  if (
    directionCounts.across < MIN_ENTRY_COUNT_PER_DIRECTION ||
    directionCounts.down < MIN_ENTRY_COUNT_PER_DIRECTION
  ) {
    throw new Error(
      `Crossword must contain at least ${MIN_ENTRY_COUNT_PER_DIRECTION} across and ${MIN_ENTRY_COUNT_PER_DIRECTION} down clues.`
    );
  }

  for (const entry of entries) {
    validateEntryIsolation(definition, entry, cells, ownership);
    const crossings = crossingGraph.get(entry.localId);
    if (!crossings || crossings.size < 1) {
      throw new Error(`Every crossword entry must overlap at least once: ${definition.id}/${entry.answer}`);
    }
  }

  const visited = new Set<string>();
  const stack = entries.length ? [entries[0].localId] : [];
  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of crossingGraph.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  if (visited.size !== entries.length) {
    throw new Error(`Crossword entries must form a single connected layout: ${definition.id}`);
  }

  // Number only the actual clue starts the backend returned, not every open run in the square grid.
  const clueNumbers = new Map<string, number>();
  let nextNumber = 1;
  for (let row = 0; row < definition.size; row += 1) {
    for (let col = 0; col < definition.size; col += 1) {
      const currentCell = cells[row][col];
      if (!currentCell) continue;

      const startKey = cellKey(row, col);
      if (!startDirections.has(startKey)) continue;

      clueNumbers.set(startKey, nextNumber);
      currentCell.number = nextNumber;
      nextNumber += 1;
    }
  }

  const across: CrosswordClue[] = [];
  const down: CrosswordClue[] = [];

  for (const entry of entries) {
    const startKey = cellKey(entry.row, entry.col);
    const clueNumber = clueNumbers.get(startKey);
    if (!clueNumber) {
      throw new Error(`Missing clue number for ${definition.id}/${entry.answer}`);
    }

    const clue: CrosswordClue = {
      row: entry.row,
      col: entry.col,
      direction: entry.direction,
      answer: entry.answer,
      clue: entry.clue,
      number: clueNumber,
      id: `${definition.id}:${clueNumber}-${entry.direction}`,
      cells: entry.answer.split('').map((_letter, index) => ({
        row: entry.row + (entry.direction === 'down' ? index : 0),
        col: entry.col + (entry.direction === 'across' ? index : 0),
      })),
    };

    for (const position of clue.cells) {
      const currentCell = cells[position.row][position.col];
      if (!currentCell) {
        throw new Error(`Missing cell metadata while assigning clues for ${definition.id}`);
      }
      if (entry.direction === 'across') {
        currentCell.acrossClueId = clue.id;
      } else {
        currentCell.downClueId = clue.id;
      }
    }

    if (entry.direction === 'across') {
      across.push(clue);
    } else {
      down.push(clue);
    }
  }

  return {
    ...definition,
    entries: entries.map(({ localId: _localId, ...entry }) => entry),
    cells,
    clues: {
      across,
      down,
      all: [...across, ...down],
    },
    totalFillableCells: cells.flat().filter((cell): cell is CrosswordCell => cell !== null).length,
  };
}

export function createCrosswordPuzzleFromGame(game: CrosswordGameData): CrosswordPuzzle {
  const topic = game.topic.trim();
  if (!topic) {
    throw new Error('Crossword game is missing a topic.');
  }

  // The server payload is intentionally minimal, so the client derives the local puzzle id and accent here.
  return buildCrosswordPuzzle({
    ...game,
    id: `${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'crossword'}-${game.size}-${game.entries.length}`,
    accent: requireThemeColor(topic),
    entries: game.entries,
  });
}

export function createEmptyCrosswordGuesses(puzzle: CrosswordPuzzle): string[][] {
  return puzzle.cells.map((row) => row.map(() => ''));
}

@Injectable({
  providedIn: 'root',
})
export class CrosswordGameService {
  constructor(private http: HttpClient) {}

  generateGame(topic: string, auth0Id = ''): Observable<CrosswordGameData> {
    return this.http.post<CrosswordGameData>('/api/crossword', {
      topic,
      auth0Id,
    });
  }

  fetchDailyGame(): Observable<CrosswordGameData> {
    return this.http.get<CrosswordGameData>('/api/daily-games/crossword');
  }
}
