export const TOPIC_MAX_LENGTH = 60;
export const TOPIC_REQUIRED_ERROR = 'Please provide a topic in the request body.';
export const TOPIC_TOO_LONG_ERROR = `Topic must be ${TOPIC_MAX_LENGTH} characters or fewer.`;
export const TOPIC_INSTRUCTION_ERROR = 'Please enter a topic, not instructions.';

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
// Patterns to detect potential prompt injection or system instruction attempts
const INSTRUCTION_PATTERNS = [
  new RegExp(`\\b(ignore|disregard|forget|override)\\b.{0,${TOPIC_MAX_LENGTH}}\\b(instructions?|prompts?|rules?|system|developer)\\b`, 'i'),
  /\b(system|developer)\s+(prompt|message|instructions?)\b/i,
  /\b(prompt injection|jailbreak)\b/i,
  new RegExp(`\\b(reveal|show|print|repeat|output|return)\\b.{0,${TOPIC_MAX_LENGTH}}\\b(prompt|instructions?|system message|developer message|api key|secret)\\b`, 'i'),
  /^\s*act\s+as\b/i,
];

export function validateTopicInput(topic) {
  const normalizedTopic = typeof topic === 'string' ? topic.trim() : ''; // Trim whitespace and ensure it's a string

  // Check if topic is provided
  if (!normalizedTopic) {
    return {
      valid: false,
      topic: '',
      error: TOPIC_REQUIRED_ERROR,
      code: 'topic_required',
    };
  }

  // Check if topic exceeds maximum length
  if (normalizedTopic.length > TOPIC_MAX_LENGTH) {
    return {
      valid: false,
      topic: normalizedTopic,
      error: TOPIC_TOO_LONG_ERROR,
      code: 'topic_too_long',
    };
  }

  // Check for control characters and potential instruction patterns
  if (
    CONTROL_CHARACTER_PATTERN.test(normalizedTopic)
    || INSTRUCTION_PATTERNS.some((pattern) => pattern.test(normalizedTopic))
  ) {
    return {
      valid: false,
      topic: normalizedTopic,
      error: TOPIC_INSTRUCTION_ERROR,
      code: 'topic_not_valid',
    };
  }

  return {
    valid: true,
    topic: normalizedTopic,
  };
}
