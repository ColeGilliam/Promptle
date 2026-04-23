import { appLogger } from '../lib/logger.js';
import {
  generatePromptleGameForTopic as generatePromptleGameForTopicBase,
} from '../controllers/subjectController.js';
import {
  generateConnectionsGameForTopic as generateConnectionsGameForTopicBase,
} from '../controllers/connectionsController.js';
import {
  generateCrosswordGameForTopic as generateCrosswordGameForTopicBase,
} from '../controllers/crosswordController.js';

const generationLogger = appLogger.child({ component: 'daily-game-generation' });

// Keep daily model selection here so daily generation can be made stronger later without moving
// or duplicating the actual prompt text from the controller files.
const DAILY_PROMPTLE_MODEL = 'gpt-5.4-mini';
const DAILY_CONNECTIONS_MODEL = 'gpt-5.4-mini';
const DAILY_CROSSWORD_MODEL = 'gpt-5.4-mini';

export async function generatePromptleGameForTopic(options = {}) {
  return generatePromptleGameForTopicBase({
    ...options,
    model: options.model ?? DAILY_PROMPTLE_MODEL,
    logger: options.logger ?? generationLogger,
  });
}

export async function generateConnectionsGameForTopic(options = {}) {
  return generateConnectionsGameForTopicBase({
    ...options,
    model: options.model ?? DAILY_CONNECTIONS_MODEL,
    logger: options.logger ?? generationLogger,
  });
}

export async function generateCrosswordGameForTopic(options = {}) {
  return generateCrosswordGameForTopicBase({
    ...options,
    model: options.model ?? DAILY_CROSSWORD_MODEL,
    logger: options.logger ?? generationLogger,
  });
}
