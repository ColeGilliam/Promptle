const CONNECTIONS_GROUP_COUNT = 4;
const WORDS_PER_GROUP = 4;
const CONNECTION_DIFFICULTIES = ['yellow', 'green', 'blue', 'purple'];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringifyValue(value) {
  // Normalize nullable/mixed model output into trimmed strings before validation.
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeWordKey(value) {
  // Collapse case and spacing so cosmetic variants count as duplicates during validation.
  return stringifyValue(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeDifficulty(value, fallbackIndex) {
  // If the model omits or mangles difficulty, preserve the expected easiest-to-hardest slot order.
  const normalized = stringifyValue(value).toLowerCase();
  if (CONNECTION_DIFFICULTIES.includes(normalized)) return normalized;
  return CONNECTION_DIFFICULTIES[fallbackIndex] || CONNECTION_DIFFICULTIES[0];
}

function normalizeWords(words) {
  // Strip empty entries so the later length check catches malformed groups consistently.
  if (!Array.isArray(words)) return [];
  return words
    .map((word) => stringifyValue(word))
    .filter(Boolean);
}

export function normalizeConnectionsGamePayload(rawPayload, fallbackTopic = '') {
  // The AI is prompted for strict JSON, but this is the final guardrail before the payload reaches clients.
  const payload = isPlainObject(rawPayload) ? rawPayload : {};
  const topic = stringifyValue(payload.topic) || stringifyValue(fallbackTopic);
  const rawGroups = Array.isArray(payload.groups) ? payload.groups : [];

  if (!topic) {
    throw new Error('Connections game is missing a topic.');
  }

  if (rawGroups.length !== CONNECTIONS_GROUP_COUNT) {
    throw new Error(`Connections game must contain exactly ${CONNECTIONS_GROUP_COUNT} groups.`);
  }

  const seenWords = new Set();
  const groups = rawGroups.map((rawGroup, index) => {
    // Accept a little naming drift from the model while still normalizing to one stable response shape.
    const group = isPlainObject(rawGroup) ? rawGroup : {};
    const category = stringifyValue(group.category || group.connection || group.title);
    const explanation = stringifyValue(group.explanation || group.reason);
    const words = normalizeWords(group.words);

    if (!category) {
      throw new Error(`Connections group ${index + 1} is missing a category.`);
    }

    if (words.length !== WORDS_PER_GROUP) {
      throw new Error(`Connections group "${category}" must contain exactly ${WORDS_PER_GROUP} words.`);
    }

    const localSeen = new Set();
    for (const word of words) {
      // Enforce uniqueness inside each group and across the full 16-word board.
      const normalizedWord = normalizeWordKey(word);
      if (!normalizedWord) {
        throw new Error(`Connections group "${category}" contains an empty word.`);
      }
      if (localSeen.has(normalizedWord)) {
        throw new Error(`Connections group "${category}" contains duplicate words.`);
      }
      if (seenWords.has(normalizedWord)) {
        throw new Error(`Connections game contains duplicate word "${word}" across groups.`);
      }
      localSeen.add(normalizedWord);
      seenWords.add(normalizedWord);
    }

    return {
      category,
      difficulty: normalizeDifficulty(group.difficulty, index),
      words,
      ...(explanation ? { explanation } : {}),
    };
  });

  if (seenWords.size !== CONNECTIONS_GROUP_COUNT * WORDS_PER_GROUP) {
    // Final sanity check in case earlier normalization still collapsed the payload below 16 unique words.
    throw new Error('Connections game must contain exactly 16 unique words.');
  }

  return {
    topic,
    groups,
  };
}

// Exported so tests and any future consumers can share the canonical puzzle constraints.
export { CONNECTIONS_GROUP_COUNT, WORDS_PER_GROUP, CONNECTION_DIFFICULTIES };
