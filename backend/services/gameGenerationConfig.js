// Shared config for AI game generation. Schemas, prompts, and output validators
// import these values so gameplay constraints and safety bounds do not drift apart.
export const OUTPUT_LIMITS = {
  topic: 60,
  promptleHeader: 60,
  promptleSubjectName: 80,
  promptleCellDisplay: 160,
  promptleSetItems: 10,
  promptleSetItem: 80,
  promptleTokens: 20,
  promptleToken: 40,
  promptleUnit: 30,
  connectionsCategory: 80,
  connectionsWord: 40,
  connectionsExplanation: 160,
  crosswordAnswer: 15,
  crosswordClue: 120,
  crosswordEntries: 15,
};

export const PROMPTLE_GENERATION_CONFIG = {
  minCategories: 5,
  maxCategories: 6,
  minSubjects: 12,
  maxSubjects: 100,
  targetSubjects: 20,
  promptTargetSubjects: 15,
  maxCompletionTokens: 20000,
};

export const CONNECTIONS_GENERATION_CONFIG = {
  groupCount: 4,
  wordsPerGroup: 4,
  maxCompletionTokens: 1600,
};

export const CROSSWORD_GENERATION_CONFIG = {
  attempts: 3,
  maxCompletionTokens: 5000,
  minGeneratedCandidates: 30,
  maxGeneratedCandidates: 48,
  minCandidatePoolCandidates: 18,
  minAnswerLength: 3,
  maxAnswerLength: OUTPUT_LIMITS.crosswordAnswer,
  maxEntries: OUTPUT_LIMITS.crosswordEntries,
};
