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

function normalizeCellKind(kind) {
  const normalized = stringifyValue(kind).toLowerCase();
  return SUPPORTED_CELL_KINDS.has(normalized) ? normalized : '';
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

// Attempts to parse a numeric value or measurement from the display string
function parseNumericParts(display, explicitParts = {}) {
  const explicitUnit = stringifyValue(explicitParts.unit);
  if (typeof explicitParts.value === 'number' && Number.isFinite(explicitParts.value)) {
    return {
      value: explicitParts.value,
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

function formatNumberDisplay(display, numericParts = {}) {
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

// Checks if the display string contains patterns that suggest it's a reference, such as "Label #Number" or "Label No. Number"
function hasReferenceMarker(display) {
  const trimmed = stringifyValue(display);
  if (!trimmed) return false;
  return /#\s*\d/i.test(trimmed)
    || /\b(?:no\.?|number|issue|vol\.?|volume|chapter|season|episode|part)\s+\d/i.test(trimmed);
}

function normalizeColumn(rawColumn, fallbackHeader = '', fallbackKind = '') {
  const rawObject = isPlainObject(rawColumn) ? rawColumn : null;
  const header = stringifyValue(rawObject?.header ?? rawObject?.label ?? rawColumn ?? fallbackHeader);
  if (!header) return null;

  const kind = normalizeCellKind(rawObject?.kind ?? fallbackKind);
  const unit = stringifyValue(rawObject?.unit);

  return {
    header,
    ...(kind ? { kind } : {}),
    ...(unit ? { unit } : {}),
  };
}

// Normalizes the columns definition, ensuring each column has a header and optional kind/unit, and fills in any missing columns based on headers
function normalizeColumns(rawColumns = [], rawHeaders = []) {
  const headers = Array.isArray(rawHeaders)
    ? rawHeaders.map(header => stringifyValue(header)).filter(Boolean)
    : [];

  if (Array.isArray(rawColumns) && rawColumns.length) {
    const columns = rawColumns
      .map((column, index) => normalizeColumn(column, headers[index] ?? '', index === 0 ? 'text' : ''))
      .filter(Boolean);

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
    .filter(Boolean);
}

// Extracts the cell context (header, kind, unit) from the provided raw context
function getCellContext(rawContext = '') {
  if (typeof rawContext === 'string') {
    return {
      header: stringifyValue(rawContext),
      kind: '',
      unit: '',
    };
  }

  const rawObject = isPlainObject(rawContext) ? rawContext : {};
  return {
    header: stringifyValue(rawObject.header),
    kind: normalizeCellKind(rawObject.kind),
    unit: stringifyValue(rawObject.unit),
  };
}

// Attempts to parse a reference from the display string or explicit parts, looking for patterns like "Label #Number"
function parseReferenceParts(display, explicitParts = {}) {
  const trimmed = stringifyValue(display);
  const explicitLabel = stringifyValue(explicitParts.label);
  const explicitNumber = stringifyValue(explicitParts.number);
  const explicitTokens = Array.isArray(explicitParts.tokens)
    ? explicitParts.tokens.map(token => stringifyValue(token)).filter(Boolean)
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

// Determines the kind of cell based on explicit kind, number of items, and parsing results
function inferCellKind({ preferredKind, sourceWasArray, items, display, explicitParts = {} }) {
  const numericParts = parseNumericParts(display, explicitParts);
  const referenceParts = parseReferenceParts(display, explicitParts);
  const normalizedPreferredKind = normalizeCellKind(preferredKind);

  if (sourceWasArray) return 'set';
  if (normalizedPreferredKind) return normalizedPreferredKind;
  if (items.length > 1) return 'set';
  if (numericParts) return 'number';
  if (referenceParts) return 'reference';
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
export function normalizeGameCell(rawCell, context = '', fallbackDisplay = '') {
  const cellContext = getCellContext(context);
  const rawObject = isPlainObject(rawCell) ? rawCell : null;
  const explicitParts = {
    ...(cellContext.unit ? { unit: cellContext.unit } : {}),
    ...(isPlainObject(rawObject?.parts) ? rawObject.parts : {}),
  };
  const sourceWasArray = Array.isArray(rawCell);
  const explicitItems = Array.isArray(rawObject?.items)
    ? rawObject.items.map(item => stringifyValue(item)).filter(Boolean)
    : sourceWasArray
      ? rawCell.map(item => stringifyValue(item)).filter(Boolean)
      : [];

  const display = toDisplayString(rawCell) || stringifyValue(fallbackDisplay);
  const inferredItems = explicitItems.length ? explicitItems : splitListItems(display);
  const kind = inferCellKind({
    preferredKind: cellContext.kind || rawObject?.kind,
    sourceWasArray,
    items: inferredItems,
    display,
    explicitParts,
  });

  if (kind === 'set') {
    const items = inferredItems.length ? inferredItems : (display ? [display] : []);
    return {
      display: display || items.join(', '),
      kind,
      items,
    };
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
export function normalizeGameAnswer(answer, columnDefs = []) {
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
    return normalizeGameCell(rawCell, columns[index] ?? { header: '', ...(index === 0 ? { kind: 'text' } : {}) }, index === 0 ? name : '');
  });

  if (cells[0] && !cells[0].display && name) {
    cells[0] = normalizeGameCell({ display: name, kind: 'text' }, columns[0] ?? { header: '', kind: 'text' }, name);
  }

  return {
    name,
    cells,
    values: cells.map(cell => cell.display),
  };
}

// Normalizes the game payload (topic, headers, answers, correct answer) into a consistent structure
export function normalizeGamePayload(payload = {}) {
  const columns = normalizeColumns(payload.columns, payload.headers);
  const headers = columns.map(column => column.header);

  const answers = Array.isArray(payload.answers)
    ? payload.answers.map(answer => normalizeGameAnswer(answer, columns))
    : [];

  const correctAnswer = normalizeGameAnswer(payload.correctAnswer || {}, columns);

  return {
    topic: stringifyValue(payload.topic),
    headers,
    columns,
    answers,
    correctAnswer,
    ...(payload.mode ? { mode: payload.mode } : {}),
  };
}

export function normalizeDisplayValue(value) {
  return normalizeDisplay(value);
}
