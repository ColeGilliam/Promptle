const SECURITY_PREVIEW_MAX_LENGTH = 120;
const RAW_OUTPUT_PREVIEW_MAX_LENGTH = 500;
const SUMMARY_ITEM_LIMIT = 10;

function previewText(value) {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (text.length <= SECURITY_PREVIEW_MAX_LENGTH) {
    return text;
  }
  return `${text.slice(0, SECURITY_PREVIEW_MAX_LENGTH)}...`;
}

function writeSecurityLog(logger, eventName, payload) {
  if (typeof logger?.warn === 'function') {
    logger.warn(eventName, payload);
    return;
  }
  if (typeof logger?.info === 'function') {
    logger.info(eventName, payload);
    return;
  }
  if (typeof logger?.debug === 'function') {
    logger.debug(eventName, payload);
  }
}

// Keep beginning and end of log to avoid huge dump and capture relevant info
function previewLongText(value) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  if (text.length <= RAW_OUTPUT_PREVIEW_MAX_LENGTH) {
    return text;
  }
  return `${text.slice(0, RAW_OUTPUT_PREVIEW_MAX_LENGTH)}...`;
}

function summarizePromptlePayload(payload) {
  const columns = Array.isArray(payload?.columns) ? payload.columns : [];
  const headers = columns.length
    ? columns.map((column) => (typeof column?.header === 'string' ? column.header : '')).filter(Boolean)
    : (Array.isArray(payload?.headers) ? payload.headers.filter((header) => typeof header === 'string') : []);
  const answers = Array.isArray(payload?.answers) ? payload.answers : [];

  return {
    headers,
    headerCount: headers.length,
    answerCount: answers.length,
    answerNames: answers
      .slice(0, SUMMARY_ITEM_LIMIT)
      .map((answer) => answer?.name)
      .filter((name) => typeof name === 'string'),
  };
}

function summarizeConnectionsPayload(payload) {
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  return {
    groupCount: groups.length,
    groups: groups.slice(0, SUMMARY_ITEM_LIMIT).map((group) => ({
      category: group?.category,
      difficulty: group?.difficulty,
      words: Array.isArray(group?.words) ? group.words : [],
    })),
  };
}

// When validation context points at one crossword candidate/entry, log that item instead of the full pool.
function summarizeCrosswordPayload(payload, context = '') {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const candidateMatch = context.match(/candidates\[(\d+)\]/);
  const entryMatch = context.match(/entries\[(\d+)\]/);
  const candidateIndex = candidateMatch ? Number(candidateMatch[1]) : null;
  const entryIndex = entryMatch ? Number(entryMatch[1]) : null;

  return {
    candidateCount: candidates.length,
    entryCount: entries.length,
    candidate: Number.isInteger(candidateIndex) ? candidates[candidateIndex] : undefined,
    entry: Number.isInteger(entryIndex) ? entries[entryIndex] : undefined,
    candidates: Number.isInteger(candidateIndex) ? undefined : candidates.slice(0, SUMMARY_ITEM_LIMIT),
    entries: Number.isInteger(entryIndex) ? undefined : entries.slice(0, SUMMARY_ITEM_LIMIT),
  };
}

// Produces a compact diagnostic shape for JSON.parse failures.
export function summarizeRawAiOutput(raw) {
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  return {
    rawLength: text.length,
    rawPreviewStart: previewLongText(text),
    rawPreviewEnd: text.length > RAW_OUTPUT_PREVIEW_MAX_LENGTH
      ? text.slice(-RAW_OUTPUT_PREVIEW_MAX_LENGTH)
      : undefined,
  };
}

// Chooses the smallest useful generated-output summary for the relevant game type.
export function summarizeAiGeneratedPayload(payload, context = '') {
  if (context.startsWith('promptle') || payload?.columns || payload?.headers || payload?.answers) {
    return summarizePromptlePayload(payload);
  }
  if (context.startsWith('connections') || payload?.groups) {
    return summarizeConnectionsPayload(payload);
  }
  if (context.startsWith('crossword') || payload?.candidates || payload?.entries) {
    return summarizeCrosswordPayload(payload, context);
  }
  return {
    valueType: Array.isArray(payload) ? 'array' : typeof payload,
  };
}

export function isGeneratedOutputSecurityError(error) {
  return error?.name === 'GeneratedOutputSecurityError';
}

// Logs rejected player input with attribution fields needed to spot repeated abuse.
export function logAiInputSecurityRejected({
  logger,
  req,
  route,
  auth0Id = null,
  topic,
  source,
  reason,
  flaggedCategories,
  moderationModel,
} = {}) {
  writeSecurityLog(logger, 'ai_input_security_rejected', {
    requestId: req?.id || null,
    route,
    auth0Id: auth0Id || null,
    ip: req?.ip || null,
    source,
    reason,
    topicPreview: previewText(topic),
    topicLength: typeof topic === 'string' ? topic.trim().length : 0,
    flaggedCategories,
    moderationModel,
  });
}

// Logs generated output rejections without dumping the whole AI response.
export function logAiOutputSecurityRejected({
  logger,
  route,
  requestId = null,
  auth0Id = null,
  topic,
  error,
  stage,
  attempt,
  sourcePayload,
} = {}) {
  writeSecurityLog(logger, 'ai_output_security_rejected', {
    requestId,
    route,
    auth0Id: auth0Id || null,
    source: 'generated_output_validation',
    reason: error?.reason || 'generated_output_rejected',
    context: error?.context || null,
    stage,
    attempt,
    topicPreview: previewText(topic),
    outputSummary: sourcePayload
      ? summarizeAiGeneratedPayload(sourcePayload, error?.context || '')
      : undefined,
  });
}
