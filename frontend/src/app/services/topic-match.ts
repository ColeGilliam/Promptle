import type { TopicInfo } from './topics-list';

const TOPIC_STOP_WORDS = new Set(['a', 'an', 'the']);

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

// Build a stable comparison string so small formatting differences do not block a match.
function normalizeTopicText(value: string): string {
  return collapseWhitespace(
    String(value ?? '')
      .normalize('NFKD') // Remove accents by decomposing Unicode characters and discarding non-ASCII parts.
      .replace(/[^\x00-\x7F]/g, '') // Remove any remaining non-ASCII characters that weren't removed by normalization.
      .toLowerCase()
      .replace(/&/g, ' and ') // Replace ampersands with "and" for better tokenization.
      .replace(/[^a-z0-9]+/g, ' ') // Replace non-alphanumeric characters with spaces to separate tokens.
  );
}

// Handle simple singular/plural differences like "characters" vs "character".
function singularizeToken(token: string): string {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith('s') && token.length > 3 && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }

  return token;
}

// Token-level normalization lets us ignore articles and compare semantically similar phrases.
function normalizeTopicTokens(value: string): string[] {
  return normalizeTopicText(value)
    .split(' ')
    .map((token) => singularizeToken(token))
    .filter((token) => token && !TOPIC_STOP_WORDS.has(token));
}

// Compact form helps catch matches when spacing or punctuation is the main difference.
function toCompactTopicText(value: string): string {
  return normalizeTopicTokens(value).join('');
}

// Levenshtein distance for typo tolerance.
function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonal = previousRow[0];
    previousRow[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const current = previousRow[rightIndex + 1];
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;

      previousRow[rightIndex + 1] = Math.min(
        previousRow[rightIndex + 1] + 1,
        previousRow[rightIndex] + 1,
        diagonal + cost
      );

      diagonal = current;
    }
  }

  return previousRow[right.length];
}

// Convert edit distance into a 0-1 similarity score where 1 means an exact match.
function similarityScore(left: string, right: string): number {
  if (!left && !right) return 1;
  if (!left || !right) return 0;

  return 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length);
}

// Compare each token in order, which helps short phrases like "marvel character".
function pairedTokenSimilarity(queryTokens: string[], candidateTokens: string[]): number {
  if (!queryTokens.length || queryTokens.length !== candidateTokens.length) return 0;

  const total = queryTokens.reduce((sum, token, index) => (
    sum + similarityScore(token, candidateTokens[index] ?? '')
  ), 0);

  return total / queryTokens.length;
}

interface TopicMatchCandidate {
  topic: TopicInfo;
  score: number;
}

export function findBestTopicMatch(query: string, topics: TopicInfo[]): TopicInfo | null {
  const normalizedQuery = normalizeTopicText(query);
  const queryTokens = normalizeTopicTokens(query);
  const compactQuery = queryTokens.join('');

  if (!normalizedQuery || !queryTokens.length) return null;

  let bestMatch: TopicMatchCandidate | null = null;

  for (const topic of topics) {
    const normalizedTopic = normalizeTopicText(topic.topicName);
    const topicTokens = normalizeTopicTokens(topic.topicName);
    const compactTopic = toCompactTopicText(topic.topicName);

    if (!normalizedTopic || !topicTokens.length) continue;

    let score = 0;

    // Fast-path exact matches after normalization.
    if (
      normalizedQuery === normalizedTopic ||
      compactQuery === compactTopic ||
      queryTokens.join(' ') === topicTokens.join(' ')
    ) {
      score = 1;
    } else {
      // Blend phrase, compact, and token-level similarity, but stay conservative.
      const phraseSimilarity = similarityScore(queryTokens.join(' '), topicTokens.join(' '));
      const compactSimilarity = similarityScore(compactQuery, compactTopic);
      const tokenSimilarity = pairedTokenSimilarity(queryTokens, topicTokens);
      const tokenCountGap = Math.abs(queryTokens.length - topicTokens.length);

      if (tokenCountGap === 0) {
        score = Math.max(phraseSimilarity, compactSimilarity, tokenSimilarity);
      } else if (tokenCountGap === 1 && compactSimilarity >= 0.92) {
        score = compactSimilarity;
      }
    }

    // Reject loose or ambiguous matches so broad custom topics still go to AI generation.
    if (score < 0.85) continue;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { topic, score };
    }
  }

  return bestMatch?.topic ?? null;
}
