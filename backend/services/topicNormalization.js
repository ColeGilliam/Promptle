const TOPIC_STOP_WORDS = new Set(['a', 'an', 'the']);

function collapseWhitespace(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeTopicText(value) {
  return collapseWhitespace(
    String(value ?? '')
      .normalize('NFKD') // Remove accents by decomposing Unicode characters and discarding non-ASCII parts.
      .replace(/[^\x00-\x7F]/g, '') // Remove any remaining non-ASCII characters that weren't removed by normalization.
      .toLowerCase()
      .replace(/&/g, ' and ') // Replace ampersands with "and" for better tokenization.
      .replace(/[^a-z0-9]+/g, ' ') // Replace non-alphanumeric characters with spaces to separate tokens.
  );
}

// Basic singularization rules to collapse simple pluralization differences.
export function singularizeTopicToken(token) {
  if (token.endsWith('ies') && token.length > 4) {
    const stem = token.slice(0, -3);
    return stem.endsWith('ov') ? `${stem}ie` : `${stem}y`;
  }

  if (token.endsWith('s') && token.length > 3 && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }

  return token;
}

export function normalizeTopicTokens(value) {
  return normalizeTopicText(value)
    .split(' ')
    .map((token) => singularizeTopicToken(token))
    .filter((token) => token && !TOPIC_STOP_WORDS.has(token));
}

// The canonical topic key is token-based so small phrasing differences like "Pokemon Characters" vs 
// "pokemon character" collapse together.
export function normalizeTopicKey(value) {
  const tokens = normalizeTopicTokens(value);
  if (tokens.length) {
    return tokens.join(' ');
  }

  return normalizeTopicText(value);
}
