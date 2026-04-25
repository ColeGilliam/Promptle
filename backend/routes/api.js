// routes/api.js
import express from 'express';
import { generateConnectionsGame } from '../controllers/connectionsController.js';
import { generateCrosswordGame } from '../controllers/crosswordController.js';
import { generateSubjects } from '../controllers/subjectController.js';
import { getHeaders, getPopularTopics } from '../controllers/topicController.js';
import { startGame, createMultiplayerGame, listRooms, deleteRoom } from '../controllers/gameController.js';
import { authUser, deleteUserAccount, incrementWin } from '../controllers/authController.js';
import { getProfile, updateProfile } from '../controllers/userController.js';
import { saveGame, loadGame, deleteSavedGame } from '../controllers/saveController.js';
import { getDevSettings, updateDevSettings } from '../controllers/devSettingsController.js';
import { getDevAuthSession } from '../controllers/devAuthController.js';
import { saveGameFeedback } from '../controllers/gameFeedbackController.js';
import { getDailyGame } from '../controllers/dailyGameController.js';
import {
  finalizeCustomGameSession,
  markCustomGameSessionInteracted,
  startCustomGameSession,
} from '../controllers/customGameSessionController.js';
import { getRecommendations } from '../controllers/recommendationController.js';
import {
  aiGenerationBurstLimiter,
  topicAiGenerationBurstLimiter,
} from '../middleware/rateLimit.js';


const router = express.Router();

router.get('/', (_req, res) => res.send('Backend is running!'));
router.get('/health', (_req, res) => res.json({ status: 'ok' }));
router.get('/api/dev-auth/session', getDevAuthSession);

router.post('/api/subjects', aiGenerationBurstLimiter, generateSubjects);
router.post('/api/connections', aiGenerationBurstLimiter, generateConnectionsGame);
router.post('/api/crossword', aiGenerationBurstLimiter, generateCrosswordGame);
router.get('/api/daily-games/:mode', getDailyGame);
router.get('/api/topics/:topicId/headers', getHeaders);
router.get('/api/popularTopics/list', getPopularTopics);
router.get('/api/game/start', startGame);
router.post('/api/auth-user', authUser);
router.delete('/api/delete-account/:auth0Id', deleteUserAccount);
router.get('/api/profile/:auth0Id', getProfile);
router.put('/api/update-profile', updateProfile);
router.post('/api/increment-win', incrementWin);
router.post('/api/save-game', saveGame);
router.post('/api/game-feedback', saveGameFeedback);
router.post('/api/custom-game-session/start', startCustomGameSession);
router.post('/api/custom-game-session/interacted', markCustomGameSessionInteracted);
router.post('/api/custom-game-session/finalize', finalizeCustomGameSession);
router.get('/api/recommendations/:auth0Id', getRecommendations);
router.get('/api/load-game/:auth0Id', loadGame);
router.delete('/api/delete-saved-game/:auth0Id', deleteSavedGame);
router.post('/api/game/multiplayer', topicAiGenerationBurstLimiter, createMultiplayerGame);
router.get('/api/game/rooms', listRooms);
router.delete('/api/game/rooms/:roomId', deleteRoom);
router.get('/api/dev-settings', getDevSettings);
router.put('/api/dev-settings', updateDevSettings);

export default router;
