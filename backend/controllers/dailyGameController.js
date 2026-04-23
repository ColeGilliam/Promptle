import { getReadyDailyGame } from '../services/dailyGames.js';
import { appLogger } from '../lib/logger.js';

const dailyGameLogger = appLogger.child({ component: 'daily-game-controller' });

export async function getDailyGame(req, res) {
  try {
    const result = await getReadyDailyGame({
      mode: req.params.mode,
    });

    res.json({
      ...result.payload,
      dailyGame: {
        mode: result.mode,
        topic: result.topic,
        date: result.date,
        generatedAt: result.generatedAt,
      },
    });
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;

    if (statusCode >= 500) {
      dailyGameLogger.error('daily_game_request_failed', {
        requestId: req.id || null,
        mode: req.params.mode,
        error,
      });
    }

    res.status(statusCode).json({
      error: error.message || 'Failed to load the daily game.',
    });
  }
}
