// Shared config for AI game generation. Schemas, prompts, and output validators
// import these values so gameplay constraints and safety bounds do not drift apart.
export const OUTPUT_LIMITS = {
  topic: 60,
  promptleReason: 160,
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
  connectionsReviewReason: 200,
  crosswordAnswer: 15,
  crosswordClue: 120,
  crosswordEntries: 15,
};

export const PROMPTLE_GENERATION_CONFIG = {
  minCategories: 5,
  maxCategories: 6,
  generatedColumns: 6,
  minSubjects: 12,
  maxSubjects: 100,
  // The standard custom-topic flow keeps the roster target modest for faster turnaround.
  targetSubjects: 20,
  // Improved custom generation and daily Promptles both ask for a deeper roster so cleanup
  // has more material to work with and the final puzzle is less likely to feel thin.
  improvedTargetSubjects: 40,
  maxCompletionTokens: 20000,
  // These heuristics drive the deterministic cleanup step after the model returns one full draft.
  method: {
    analysisMinRows: 8,
    packedTextRatioThreshold: 0.5,
    highUniquenessThreshold: 0.85,
    lowSharedCoverageThreshold: 0.25,
    highDominanceThreshold: 0.8,
    lowVariationMaxDistinctValues: 3,
  },
};

export const CONNECTIONS_GENERATION_CONFIG = {
  groupCount: 4,
  wordsPerGroup: 4,
  attempts: 3,
  maxCompletionTokens: 1600,
  reviewMaxCompletionTokens: 500,
  overlapTarget: {
    minSharedWords: 8,
    description: 'At least half of the board should plausibly suggest one or more wrong categories before the real sets click.',
  },
  difficultyGuide: [
    {
      difficulty: 'yellow',
      summary: 'easiest, but still nontrivial',
      guidance: 'Make it the clearest group on the board, but not instantly obvious; the solver should still need a brief step of thought, and the words should still overlap with other tempting categories.',
    },
    {
      difficulty: 'green',
      summary: 'moderately accessible and deceptive',
      guidance: 'Keep it understandable, but make the category less direct than yellow and preserve meaningful overlap-driven ambiguity.',
    },
    {
      difficulty: 'blue',
      summary: 'medium and meaningfully tricky',
      guidance: 'Require a noticeable step of reasoning, such as a narrower pattern, secondary meaning, or less-obvious shared trait.',
    },
    {
      difficulty: 'purple',
      summary: 'hardest and interpretive',
      guidance: 'Make the connection hardest to articulate: even if a solver knows all four words, the topic should still take extra critical thinking to name clearly.',
    },
  ],
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
