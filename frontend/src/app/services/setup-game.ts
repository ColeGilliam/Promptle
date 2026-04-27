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
  unit?: string;
}

export interface GameCell {
  display: string;
  kind: GameCellKind;
  items?: string[];
  parts?: GameCellParts;
}

export interface GameColumn {
  header: string;
  kind?: GameCellKind;
  unit?: string;
}

export interface GameAnswer {
  name: string;
  cells?: GameCell[];
  values?: string[];
}

export interface DailyGameMeta {
  mode: string;
  topic: string;
  date: string;
  generatedAt?: string | null;
}

export interface HydratedGameColumn {
  header: string;
  kind?: GameCellKind;
  unit?: string;
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
  columns?: GameColumn[];
  answers: GameAnswer[];
  correctAnswer: GameAnswer;
  mode?: string;
  dailyGame?: DailyGameMeta;
}

// Define the hydrated game data structure with fully processed cells and answers
export interface HydratedGameData {
  topic: string;
  headers: string[];
  columns: HydratedGameColumn[];
  answers: HydratedGameAnswer[];
  correctAnswer: HydratedGameAnswer;
  mode?: string;
  dailyGame?: DailyGameMeta;
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

export function tokenizeDisplay(value: string): string[] {
  return stringifyValue(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function formatHeader(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeCellKind(kind: unknown): GameCellKind | '' {
  const normalized = stringifyValue(kind).toLowerCase();
  return GAME_CELL_KINDS.has(normalized as GameCellKind) ? normalized as GameCellKind : '';
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

// Attempts to parse a numeric value or measurement from the display string
function parseNumericParts(display: string, explicitParts: Record<string, unknown>): GameCellParts | null {
  const explicitUnit = stringifyValue(explicitParts['unit']);
  if (typeof explicitParts['value'] === 'number' && Number.isFinite(explicitParts['value'])) {
    return {
      value: explicitParts['value'],
      unit: explicitUnit,
    };
  }

  const trimmed = stringifyValue(display);
  if (!trimmed) return null;

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? { value: parsed, unit: explicitUnit } : null;
  }

  const measurementMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*([a-z%°]+(?:\/[a-z%°]+)?)$/i);
  if (!measurementMatch) return null;

  const unit = stringifyValue(measurementMatch[2]).toLowerCase();
  if (['st', 'nd', 'rd', 'th'].includes(unit)) return null;

  const parsed = Number(measurementMatch[1]);
  if (!Number.isFinite(parsed)) return null;

  return {
    value: parsed,
    unit: explicitUnit || unit,
  };
}

// Formats the display string for a number cell, combining the numeric value and unit if appropriate, while respecting any existing display formatting
function formatNumberDisplay(display: string, numericParts: GameCellParts = {}): string {
  const trimmedDisplay = stringifyValue(display);
  const unit = stringifyValue(numericParts.unit);
  if (!unit) return trimmedDisplay;

  const numericValue = typeof numericParts.value === 'number' && Number.isFinite(numericParts.value)
    ? String(numericParts.value)
    : '';

  if (!trimmedDisplay && numericValue) return `${numericValue} ${unit}`;
  if (!trimmedDisplay) return trimmedDisplay;
  if (/[a-z%°]/i.test(trimmedDisplay)) return trimmedDisplay;
  return `${trimmedDisplay} ${unit}`;
}


// Normalizes a single column definition, ensuring it has a header and optional kind/unit, with fallbacks to handle legacy formats
function normalizeColumn(rawColumn: unknown, fallbackHeader = '', fallbackKind: GameCellKind | '' = ''): HydratedGameColumn | null {
  const rawObject = isPlainObject(rawColumn) ? rawColumn : null;
  const header = formatHeader(stringifyValue(rawObject?.['header'] ?? rawObject?.['label'] ?? rawColumn ?? fallbackHeader));
  if (!header) return null;

  const kind = normalizeCellKind(rawObject?.['kind'] ?? fallbackKind);
  const unit = stringifyValue(rawObject?.['unit']);

  return {
    header,
    ...(kind ? { kind } : {}),
    ...(unit ? { unit } : {}),
  };
}

// Normalizes all columns
function normalizeColumns(rawColumns: unknown[] = [], rawHeaders: unknown[] = []): HydratedGameColumn[] {
  const headers = Array.isArray(rawHeaders)
    ? rawHeaders.map(header => stringifyValue(header)).filter(Boolean)
    : [];

  if (Array.isArray(rawColumns) && rawColumns.length) {
    const columns = rawColumns
      .map((column, index) => normalizeColumn(column, headers[index] ?? '', index === 0 ? 'text' : ''))
      .filter((column): column is HydratedGameColumn => !!column);

    if (headers.length > columns.length) {
      for (let index = columns.length; index < headers.length; index += 1) {
        const fallbackColumn = normalizeColumn(headers[index], headers[index], index === 0 ? 'text' : '');
        if (fallbackColumn) columns.push(fallbackColumn);
      }
    }

    if (columns.length) return columns;
  }

  return headers
    .map((header, index) => normalizeColumn(header, header, index === 0 ? 'text' : ''))
    .filter((column): column is HydratedGameColumn => !!column);
}

// Extracts the cell context (header, kind, unit) from the provided raw context
function getCellContext(rawContext: string | Partial<GameColumn> = ''): HydratedGameColumn {
  if (typeof rawContext === 'string') {
    return {
      header: stringifyValue(rawContext),
    };
  }

  const rawObject = isPlainObject(rawContext) ? rawContext : {};
  const kind = normalizeCellKind(rawObject['kind']);
  const unit = stringifyValue(rawObject['unit']);
  return {
    header: stringifyValue(rawObject['header']),
    ...(kind ? { kind } : {}),
    ...(unit ? { unit } : {}),
  };
}

// Checks if the display string contains patterns that suggest it's a reference, such as "Label #Number" or "Label No. Number"
function hasReferenceMarker(display: string): boolean {
  const trimmed = stringifyValue(display);
  if (!trimmed) return false;
  return /#\s*\d/i.test(trimmed)
    || /\b(?:no\.?|number|issue|vol\.?|volume|chapter|season|episode|part)\s+\d/i.test(trimmed);
}

// Attempts to parse a reference from the display string or explicit parts, looking for patterns like "Label #Number"
function parseReferenceParts(display: string, explicitParts: Record<string, unknown>): GameCellParts | null {
  const trimmed = stringifyValue(display);
  const explicitLabel = stringifyValue(explicitParts['label']);
  const explicitNumber = stringifyValue(explicitParts['number']);
  const explicitTokens = Array.isArray(explicitParts['tokens'])
    ? explicitParts['tokens'].map(token => stringifyValue(token)).filter(Boolean)
    : [];

  if (explicitLabel && explicitNumber) {
    return {
      label: explicitLabel,
      number: explicitNumber,
      tokens: explicitTokens.length ? explicitTokens : tokenizeDisplay(explicitLabel || trimmed),
    };
  }

  if (!trimmed || !hasReferenceMarker(trimmed)) return null;

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
  preferredKind: unknown,
  sourceWasArray: boolean,
  inferredItems: string[],
  display: string,
  explicitParts: Record<string, unknown>
): GameCellKind {
  const numericParts = parseNumericParts(display, explicitParts);
  const referenceParts = parseReferenceParts(display, explicitParts);
  const normalizedPreferredKind = normalizeCellKind(preferredKind);

  if (sourceWasArray) return 'set';
  if (normalizedPreferredKind) return normalizedPreferredKind;
  if (inferredItems.length > 1) return 'set';
  if (numericParts) return 'number';
  if (referenceParts) return 'reference';
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
export function hydrateGameCell(rawCell: unknown, context: string | Partial<GameColumn> = '', fallbackDisplay = ''): GameCell {
  const cellContext = getCellContext(context);
  const rawObject = isPlainObject(rawCell) ? rawCell : null;
  const explicitParts: Record<string, unknown> = {
    ...(cellContext.unit ? { unit: cellContext.unit } : {}),
    ...(isPlainObject(rawObject?.['parts']) ? rawObject['parts'] : {}),
  };
  const sourceWasArray = Array.isArray(rawCell);
  const explicitItems = Array.isArray(rawObject?.['items'])
    ? rawObject['items'].map(item => stringifyValue(item)).filter(Boolean)
    : sourceWasArray
      ? rawCell.map(item => stringifyValue(item)).filter(Boolean)
      : [];

  const display = toDisplayString(rawCell) || stringifyValue(fallbackDisplay);
  const inferredItems = explicitItems.length ? explicitItems : splitListItems(display);
  const kind = inferCellKind(cellContext.kind || rawObject?.['kind'], sourceWasArray, inferredItems, display, explicitParts);

  if (kind === 'set') {
    const items = inferredItems.length ? inferredItems : (display ? [display] : []);
    return { display: display || items.join(', '), kind, items };
  }

  if (kind === 'number') {
    const numericParts = parseNumericParts(display, explicitParts);
    return {
      display: formatNumberDisplay(display, numericParts ?? {}),
      kind,
      parts: numericParts ?? {},
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
export function hydrateGameAnswer(answer: Partial<GameAnswer> | undefined, columnDefs: Array<string | Partial<GameColumn>> = []): HydratedGameAnswer {
  const columns = Array.isArray(columnDefs) && columnDefs.some(column => isPlainObject(column))
    ? normalizeColumns(columnDefs)
    : normalizeColumns([], columnDefs);
  const rawCells = Array.isArray(answer?.cells) ? answer.cells : [];
  const rawValues = Array.isArray(answer?.values) ? answer.values : [];
  const headerCount = columns.length;
  const fallbackName = stringifyValue(answer?.name);
  const cellCount = Math.max(headerCount, rawCells.length, rawValues.length, fallbackName ? 1 : 0);
  const name = fallbackName || toDisplayString(rawCells[0] ?? rawValues[0] ?? '');

  const cells = Array.from({ length: cellCount }, (_, index) => {
    const rawCell = rawCells[index] ?? rawValues[index] ?? (index === 0 ? name : '');
    return hydrateGameCell(rawCell, columns[index] ?? { header: '', ...(index === 0 ? { kind: 'text' } : {}) }, index === 0 ? name : '');
  });

  if (cells[0] && !cells[0].display && name) {
    cells[0] = hydrateGameCell({ display: name, kind: 'text' }, columns[0] ?? { header: '', kind: 'text' }, name);
  }

  return {
    name,
    cells,
    values: cells.map(cell => getCellDisplay(cell)),
  };
}

export function hydrateGameData(data: Partial<GameData> | undefined): HydratedGameData {
  const allColumns = normalizeColumns(data?.columns, data?.headers);
  const restIndices = allColumns.map((_, i) => i).slice(1).sort(() => Math.random() - 0.5);
  const selectedIndices = allColumns.length ? [0, ...restIndices.slice(0, 5)] : restIndices.slice(0, 6);
  const columns = selectedIndices.map(i => allColumns[i]);
  const headers = columns.map(column => column.header);

  function reorderAnswer(answer: Partial<GameAnswer> | undefined): Partial<GameAnswer> {
    if (!answer) return {};
    const rawCells = Array.isArray(answer.cells) ? answer.cells : [];
    const rawValues = Array.isArray(answer.values) ? answer.values : [];
    return {
      ...answer,
      cells: selectedIndices.map(i => rawCells[i]),
      values: selectedIndices.map(i => rawValues[i]),
    };
  }

  return {
    topic: stringifyValue(data?.topic),
    headers,
    columns,
    answers: Array.isArray(data?.answers)
      ? data.answers.map(answer => hydrateGameAnswer(reorderAnswer(answer), columns))
      : [],
    correctAnswer: hydrateGameAnswer(reorderAnswer(data?.correctAnswer), columns),
    mode: stringifyValue(data?.mode) || undefined,
    dailyGame: data?.dailyGame && typeof data.dailyGame === 'object'
      ? {
          mode: stringifyValue(data.dailyGame.mode),
          topic: stringifyValue(data.dailyGame.topic),
          date: stringifyValue(data.dailyGame.date),
          generatedAt: stringifyValue(data.dailyGame.generatedAt) || undefined,
        }
      : undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class DbGameService {
  private readonly apiBaseUrl = '/api';

  constructor(private http: HttpClient) {}

  // Database-backed game fetch (numeric topicId)
  fetchGameByTopic(topicId: number): Observable<GameData> {
    return this.http.get<GameData>(
      `${this.apiBaseUrl}/game/start?topicId=${topicId}`
    );
  }

  // AI game generation (string topic) — dev account only
  generateAiGame(
    topic: string,
    auth0Id: string,
    options?: { minCategories?: number; maxCategories?: number; improvedGeneration?: boolean }
  ): Observable<GameData> {
    const body: any = { topic: topic.trim(), auth0Id };
    if (options?.minCategories !== undefined) body.minCategories = options.minCategories;
    if (options?.maxCategories !== undefined) body.maxCategories = options.maxCategories;
    if (options?.improvedGeneration) body.improvedGeneration = true;

    return this.http.post<GameData>(`${this.apiBaseUrl}/subjects`, body);
  }

  // Multiplayer game fetch (string room code)
  fetchGameByRoom(room: string): Observable<GameData> {
    return this.http.get<GameData>(
      `${this.apiBaseUrl}/game/start?room=${encodeURIComponent(room)}`
    );
  }

  fetchDailyGame(mode: 'promptle' | 'connections' | 'crossword'): Observable<GameData> {
    return this.http.get<GameData>(`${this.apiBaseUrl}/daily-games/${encodeURIComponent(mode)}`);
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
    auth0Id?: string;
    improvedGeneration?: boolean;
    dailyMode?: 'promptle' | 'connections' | 'crossword';
  }): Observable<GameData> {
    if (params.dailyMode) {
      return this.fetchDailyGame(params.dailyMode);
    }

    if (params.topic && params.topic.trim()) {
      return this.generateAiGame(params.topic.trim(), params.auth0Id || '', {
        improvedGeneration: !!params.improvedGeneration,
      });
    }

    if (params.room && params.room.trim()) {
      return this.fetchGameByRoom(params.room.trim());
    }

    if (params.topicId !== undefined && Number.isFinite(params.topicId)) {
      return this.fetchGameByTopic(params.topicId);
    }

    return throwError(() => new Error('Missing valid topic, topicId, room, or daily mode'));
  }
}
