// app.js
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';
import { attachRequestContext, requestErrorHandler } from './middleware/requestLogging.js';
import { appLogger } from './lib/logger.js';

const app = express();
const httpLogger = appLogger.child({ component: 'http' });
const aiGenerationRoutes = ['/api/subjects', '/api/connections', '/api/crossword', '/api/game/multiplayer'];

app.use(attachRequestContext(httpLogger));
app.use(aiGenerationRoutes, express.json({ limit: '8kb' }));
app.use(aiGenerationRoutes, express.urlencoded({ limit: '8kb', extended: true }));
app.use('/api/update-profile', express.json({ limit: '4mb' }));
app.use('/api/update-profile', express.urlencoded({ limit: '4mb', extended: true }));
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ limit: '64kb', extended: true }));

app.use(cors());

// Attach routes
app.use('/', apiRoutes); // Or '/api' if you want to prefix
app.use(requestErrorHandler(httpLogger));

export default app;
