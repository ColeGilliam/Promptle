// services/db-game.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

/*
Text: Plain text or simple string value
Set: A list of items
Reference: A structured reference with a label and number
Number: A numeric value
*/
export type GameCellKind = 'text' | 'set' | 'reference' | 'number';

export interface GameCellParts {
  tokens?: string[];
  label?: string;
  number?: string;
  value?: number;
}

export interface GameCell {
  display: string;
  kind: GameCellKind;
  items?: string[];
  parts?: GameCellParts;
}

export interface GameAnswer {
  name: string;
  cells?: GameCell[];
  values?: string[];
}

export interface HydratedGameAnswer {
  name: string;
  cells: GameCell[];
  values: string[];
}

// Define the normalized game data structure
export interface GameData {
  topic: string;
  headers: string[];
  answers: GameAnswer[];
  correctAnswer: GameAnswer;
  mode?: string;
}

// Define the hydrated game data structure with fully processed cells and answers
export interface HydratedGameData {
  topic: string;
  headers: string[];
  answers: HydratedGameAnswer[];
  correctAnswer: HydratedGameAnswer;
  mode?: string;
}

const GAME_CELL_KINDS = new Set<GameCellKind>(['text', 'set', 'reference', 'number']);

/*
Frontend hydration logic to convert game data from the backend into a consistent format
Supports legacy values from older games
*/
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function tokenizeDisplay(value: string): string[] {
  return stringifyValue(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// In case data is provided as a simple string or array, split it into items based on common delimiters
function splitListItems(display: string): string[] {
  const trimmed = stringifyValue(display);
  if (!trimmed) return [];

  const items = trimmed
    .split(/\s*(?:,|;|\|)\s*|\s+\/\s+|\n+/)
    .map(item => stringifyValue(item))
    .filter(Boolean);

  return items.length > 1 ? items : [];
}

// Attempts to parse a numeric value from the display string or an explicit value, returning null if parsing fails
function parseNumericValue(display: string, explicitValue: unknown): number | null {
  if (typeof explicitValue === 'number' && Number.isFinite(explicitValue)) return explicitValue;

  const trimmed = stringifyValue(display);
  if (!trimmed || !/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// Attempts to parse a reference from the display string or explicit parts, looking for patterns like "Label #Number" or "Label (Number)"
function parseReferenceParts(display: string, explicitParts: Record<string, unknown>): GameCellParts | null {
  const label = stringifyValue(explicitParts['label']);
  const number = stringifyValue(explicitParts['number']);
  if (label || number) {
    return {
      label,
      number,
      tokens: tokenizeDisplay(label || display),
    };
  }

  const trimmed = stringifyValue(display);
  if (!trimmed) return null;

  const patterns = [
    /^(.*?)(?:\s*#\s*|\s+(?:no\.?|number|issue|vol\.?|volume|chapter|season|episode|part)\s+)(\d+[a-z0-9-]*)$/i,
    /^(.*?)(?:\s+\()?#(\d+[a-z0-9-]*)\)?$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    const parsedLabel = stringifyValue(match[1]);
    const parsedNumber = stringifyValue(match[2]);
    if (!parsedLabel && !parsedNumber) continue;

    return {
      label: parsedLabel,
      number: parsedNumber,
      tokens: tokenizeDisplay(parsedLabel || trimmed),
    };
  }

  return null;
}

// Builds the parts object for a text cell, using explicit tokens if provided, otherwise tokenizing the display string
function inferCellKind(
  explicitKind: unknown,
  inferredItems: string[],
  display: string,
  explicitParts: Record<string, unknown>
): GameCellKind {
  if (typeof explicitKind === 'string' && GAME_CELL_KINDS.has(explicitKind as GameCellKind)) {
    return explicitKind as GameCellKind;
  }

  if (inferredItems.length > 1) return 'set';
  if (parseNumericValue(display, explicitParts['value']) !== null) return 'number';
  if (parseReferenceParts(display, explicitParts)) return 'reference';
  return 'text';
}

// Converts various raw cell formats into a display string
function toDisplayString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(item => stringifyValue(item)).filter(Boolean).join(', ');
  }

  if (isPlainObject(value)) {
    if (typeof value['display'] === 'string') return stringifyValue(value['display']);
    if (Array.isArray(value['items'])) {
      return value['items'].map(item => stringifyValue(item)).filter(Boolean).join(', ');
    }
  }

  return stringifyValue(value);
}

export function getCellDisplay(cell: GameCell | undefined): string {
  return stringifyValue(cell?.display);
}

// Accepts various raw cell formats and normalizes them into a consistent structure with inferred kind and display
export function hydrateGameCell(rawCell: unknown, fallbackDisplay = ''): GameCell {
  const rawObject = isPlainObject(rawCell) ? rawCell : null;
  const explicitParts = isPlainObject(rawObject?.['parts']) ? rawObject['parts'] : {};
  const explicitItems = Array.isArray(rawObject?.['items'])
    ? rawObject['items'].map(item => stringifyValue(item)).filter(Boolean)
    : Array.isArray(rawCell)
      ? rawCell.map(item => stringifyValue(item)).filter(Boolean)
      : [];

  const display = toDisplayString(rawCell) || stringifyValue(fallbackDisplay);
  const inferredItems = explicitItems.length ? explicitItems : splitListItems(display);
  const kind = inferCellKind(rawObject?.['kind'], inferredItems, display, explicitParts);

  if (kind === 'set') {
    const items = inferredItems.length ? inferredItems : (display ? [display] : []);
    return { display, kind, items };
  }

  if (kind === 'number') {
    const value = parseNumericValue(display, explicitParts['value']);
    return {
      display,
      kind,
      parts: value === null ? {} : { value },
    };
  }

  if (kind === 'reference') {
    const parts = parseReferenceParts(display, explicitParts) ?? {
      label: stringifyValue(explicitParts['label']),
      number: stringifyValue(explicitParts['number']),
      tokens: tokenizeDisplay(display),
    };

    return {
      display,
      kind,
      parts: {
        label: stringifyValue(parts.label),
        number: stringifyValue(parts.number),
        tokens: Array.isArray(parts.tokens) ? parts.tokens : tokenizeDisplay(display),
      },
    };
  }

  const explicitTokens = Array.isArray(explicitParts['tokens'])
    ? explicitParts['tokens'].map(token => stringifyValue(token)).filter(Boolean)
    : [];

  return {
    display,
    kind: 'text',
    parts: {
      tokens: explicitTokens.length ? explicitTokens : tokenizeDisplay(display),
    },
  };
}

// Normalizes an entire game answer, ensuring each cell is properly structured and the overall answer has a consistent format
export function hydrateGameAnswer(answer: Partial<GameAnswer> | undefined, headerCount = 0): HydratedGameAnswer {
  const rawCells = Array.isArray(answer?.cells) ? answer.cells : [];
  const rawValues = Array.isArray(answer?.values) ? answer.values : [];
  const fallbackName = stringifyValue(answer?.name);
  const cellCount = Math.max(headerCount, rawCells.length, rawValues.length, fallbackName ? 1 : 0);
  const name = fallbackName || toDisplayString(rawCells[0] ?? rawValues[0] ?? '');

  const cells = Array.from({ length: cellCount }, (_, index) => {
    const rawCell = rawCells[index] ?? rawValues[index] ?? (index === 0 ? name : '');
    return hydrateGameCell(rawCell, index === 0 ? name : '');
  });

  if (cells[0] && !cells[0].display && name) {
    cells[0] = hydrateGameCell({ display: name, kind: 'text' }, name);
  }

  return {
    name,
    cells,
    values: cells.map(cell => getCellDisplay(cell)),
  };
}

export function hydrateGameData(data: Partial<GameData> | undefined): HydratedGameData {
  const headers = Array.isArray(data?.headers)
    ? data.headers.map(header => stringifyValue(header)).filter(Boolean)
    : [];

  return {
    topic: stringifyValue(data?.topic),
    headers,
    answers: Array.isArray(data?.answers)
      ? data.answers.map(answer => hydrateGameAnswer(answer, headers.length))
      : [],
    correctAnswer: hydrateGameAnswer(data?.correctAnswer, headers.length),
    mode: stringifyValue(data?.mode) || undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class DbGameService {
  private readonly apiBaseUrl = '/api';

  constructor(private http: HttpClient) {}

  // Database-backed game fetch (numeric topicId, optional answer seed)
  fetchGameByTopic(topicId: number, answer?: string): Observable<GameData> {
    const answerParam = answer ? `&answer=${encodeURIComponent(answer)}` : '';
    return this.http.get<GameData>(
      `${this.apiBaseUrl}/game/start?topicId=${topicId}${answerParam}`
    );
  }

  // AI game generation (string topic) — dev account only
  generateAiGame(topic: string, auth0Id: string, options?: { minCategories?: number; maxCategories?: number }): Observable<GameData> {
    const body: any = { topic: topic.trim(), auth0Id };
    if (options?.minCategories !== undefined) body.minCategories = options.minCategories;
    if (options?.maxCategories !== undefined) body.maxCategories = options.maxCategories;

    return this.http.post<GameData>(`${this.apiBaseUrl}/subjects`, body);
  }

  // Multiplayer game fetch (string room code)
  fetchGameByRoom(room: string): Observable<GameData> {
    return this.http.get<GameData>(
      `${this.apiBaseUrl}/game/start?room=${encodeURIComponent(room)}`
    );
  }

  /**
   * Unified entry point for fetching a game.
   * - topic (string) → AI generation (/subjects)
   * - topicId (number) → DB topic (/game/start?topicId=...)
   * - room (string) → multiplayer saved game (/game/start?room=...)
   */
  fetchGame(params: {
    topic?: string;
    topicId?: number;
    room?: string;
    answer?: string;
    auth0Id?: string;
  }): Observable<GameData> {
    if (params.topic && params.topic.trim()) {
      return this.generateAiGame(params.topic.trim(), params.auth0Id || '');
    }

    if (params.room && params.room.trim()) {
      return this.fetchGameByRoom(params.room.trim());
    }

    if (params.topicId !== undefined && Number.isFinite(params.topicId)) {
      return this.fetchGameByTopic(params.topicId, params.answer);
    }

    return throwError(() => new Error('Missing valid topic, topicId, or room'));
  }
}
