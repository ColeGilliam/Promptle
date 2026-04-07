/*
Text: Plain text or simple string value
Set: A list of items
Reference: A structured reference with a label and number
Number: A numeric value
*/
const SUPPORTED_CELL_KINDS = new Set(['text', 'set', 'reference', 'number']);

// Utility functions for normalizing and parsing game cell data
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringifyValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function tokenizeDisplay(value) {
  return stringifyValue(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function normalizeDisplay(value) {
  return tokenizeDisplay(value).join(' ');
}

// In case data is provided as a simple string or array, split it into items based on common delimiters
function splitListItems(display) {
  const trimmed = stringifyValue(display);
  if (!trimmed) return [];

  const items = trimmed
    .split(/\s*(?:,|;|\|)\s*|\s+\/\s+|\n+/)
    .map(item => stringifyValue(item))
    .filter(Boolean);

  return items.length > 1 ? items : [];
}

// Attempts to parse a numeric value from the display string or an explicit value, returning null if parsing fails
function parseNumericValue(display, explicitValue = undefined) {
  if (typeof explicitValue === 'number' && Number.isFinite(explicitValue)) return explicitValue;

  const trimmed = stringifyValue(display);
  if (!trimmed) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// Attempts to parse a reference from the display string or explicit parts, looking for patterns like "Label #Number" or "Label (Number)"
function parseReferenceParts(display, explicitParts = {}) {
  const label = stringifyValue(explicitParts.label);
  const number = stringifyValue(explicitParts.number);
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

// Determines the kind of cell based on explicit kind, number of items, and parsing results
function inferCellKind({ explicitKind, items, display, explicitParts = {} }) {
  if (explicitKind && SUPPORTED_CELL_KINDS.has(explicitKind)) return explicitKind;
  if (items.length > 1) return 'set';
  if (parseNumericValue(display, explicitParts.value) !== null) return 'number';
  if (parseReferenceParts(display, explicitParts)) return 'reference';
  return 'text';
}

// Builds the parts object for a text cell, using explicit tokens if provided, otherwise tokenizing the display string
function buildTextParts(display, explicitParts = {}) {
  const explicitTokens = Array.isArray(explicitParts.tokens)
    ? explicitParts.tokens.map(token => stringifyValue(token)).filter(Boolean)
    : [];

  return {
    tokens: explicitTokens.length ? explicitTokens : tokenizeDisplay(display),
  };
}

// Converts various raw cell formats into a display string
function toDisplayString(value) {
  if (Array.isArray(value)) {
    return value.map(item => stringifyValue(item)).filter(Boolean).join(', ');
  }

  if (isPlainObject(value)) {
    if (typeof value.display === 'string') return stringifyValue(value.display);
    if (Array.isArray(value.items)) {
      return value.items.map(item => stringifyValue(item)).filter(Boolean).join(', ');
    }
  }

  return stringifyValue(value);
}

// Accepts various raw cell formats and normalizes them into a consistent structure with inferred kind and display
export function normalizeGameCell(rawCell, fallbackDisplay = '') {
  const rawObject = isPlainObject(rawCell) ? rawCell : null;
  const explicitParts = isPlainObject(rawObject?.parts) ? rawObject.parts : {};
  const explicitItems = Array.isArray(rawObject?.items)
    ? rawObject.items.map(item => stringifyValue(item)).filter(Boolean)
    : Array.isArray(rawCell)
      ? rawCell.map(item => stringifyValue(item)).filter(Boolean)
      : [];

  const display = toDisplayString(rawCell) || stringifyValue(fallbackDisplay);
  const inferredItems = explicitItems.length ? explicitItems : splitListItems(display);
  const explicitKind = typeof rawObject?.kind === 'string' ? rawObject.kind : '';
  const kind = inferCellKind({ explicitKind, items: inferredItems, display, explicitParts });

  if (kind === 'set') {
    const items = inferredItems.length ? inferredItems : (display ? [display] : []);
    return {
      display,
      kind,
      items,
    };
  }

  if (kind === 'number') {
    const value = parseNumericValue(display, explicitParts.value);
    return {
      display,
      kind,
      parts: value === null ? {} : { value },
    };
  }

  if (kind === 'reference') {
    const parsed = parseReferenceParts(display, explicitParts) || {
      label: stringifyValue(explicitParts.label),
      number: stringifyValue(explicitParts.number),
      tokens: tokenizeDisplay(display),
    };

    return {
      display,
      kind,
      parts: {
        label: parsed.label,
        number: parsed.number,
        tokens: parsed.tokens?.length ? parsed.tokens : tokenizeDisplay(display),
      },
    };
  }

  return {
    display,
    kind: 'text',
    parts: buildTextParts(display, explicitParts),
  };
}

// Normalizes an entire game answer, ensuring each cell is properly structured and the overall answer has a consistent format
export function normalizeGameAnswer(answer, headers = []) {
  const rawCells = Array.isArray(answer?.cells) ? answer.cells : [];
  const rawValues = Array.isArray(answer?.values) ? answer.values : [];
  const headerCount = Array.isArray(headers) ? headers.length : 0;
  const fallbackName = stringifyValue(answer?.name);
  const cellCount = Math.max(headerCount, rawCells.length, rawValues.length, fallbackName ? 1 : 0);
  const name = fallbackName || toDisplayString(rawCells[0] ?? rawValues[0] ?? '');

  const cells = Array.from({ length: cellCount }, (_, index) => {
    const rawCell = rawCells[index] ?? rawValues[index] ?? (index === 0 ? name : '');
    return normalizeGameCell(rawCell, index === 0 ? name : '');
  });

  if (cells[0] && !cells[0].display && name) {
    cells[0] = normalizeGameCell({ display: name, kind: 'text' }, name);
  }

  return {
    name,
    cells,
    values: cells.map(cell => cell.display),
  };
}

// Normalizes the game payload (topic, headers, answers, correct answer) into a consistent structure
export function normalizeGamePayload(payload = {}) {
  const headers = Array.isArray(payload.headers)
    ? payload.headers.map(header => stringifyValue(header)).filter(Boolean)
    : [];

  const answers = Array.isArray(payload.answers)
    ? payload.answers.map(answer => normalizeGameAnswer(answer, headers))
    : [];

  const correctAnswer = normalizeGameAnswer(payload.correctAnswer || {}, headers);

  return {
    topic: stringifyValue(payload.topic),
    headers,
    answers,
    correctAnswer,
    ...(payload.mode ? { mode: payload.mode } : {}),
  };
}

export function normalizeDisplayValue(value) {
  return normalizeDisplay(value);
}
