// routes/api.js
import express from 'express';
import { generateSubjects } from '../controllers/subjectController.js';
import { getHeaders, getPopularTopics } from '../controllers/topicController.js';
import { startGame } from '../controllers/gameController.js';
import { authUser, deleteUserAccount, incrementWin } from '../controllers/authController.js';
import { getProfile, updateProfile } from '../controllers/userController.js';
import { saveGame, loadGame, deleteSavedGame } from '../controllers/saveController.js';


const router = express.Router();

router.get('/', (_req, res) => res.send('Backend is running!'));
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.post('/api/subjects', generateSubjects);
router.get('/api/topics/:topicId/headers', getHeaders);
router.get('/api/popularTopics/list', getPopularTopics);
router.get('/api/game/start', startGame);
router.post('/api/auth-user', authUser);
router.delete('/api/delete-account/:auth0Id', deleteUserAccount);
router.get('/api/profile/:auth0Id', getProfile);
router.put('/api/update-profile', updateProfile);
router.post('/api/increment-win', incrementWin);
router.post('/api/save-game', saveGame);
router.get('/api/load-game/:auth0Id', loadGame);
router.delete('/api/delete-saved-game/:auth0Id', deleteSavedGame);

export default router;