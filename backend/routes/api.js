// routes/api.js
import express from 'express';
import { generateSubjects } from '../controllers/subjectController.js';
import { getHeaders, getPopularTopics } from '../controllers/topicController.js';
import { startGame } from '../controllers/gameController.js';
import { authUser } from '../controllers/authController.js';

const router = express.Router();

router.get('/', (_req, res) => res.send('Backend is running!'));
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.post('/api/subjects', generateSubjects);
router.get('/api/topics/:topicId/headers', getHeaders);
router.get('/api/popularTopics/list', getPopularTopics);
router.get('/api/game/start', startGame);
router.post('/api/auth-user', authUser);

export default router;