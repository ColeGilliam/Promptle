// app.js
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';
import { attachRequestContext, requestErrorHandler } from './middleware/requestLogging.js';
import { appLogger } from './lib/logger.js';

const app = express();
const httpLogger = appLogger.child({ component: 'http' });

app.use(attachRequestContext(httpLogger));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cors());

// Attach routes
app.use('/', apiRoutes); // Or '/api' if you want to prefix
app.use(requestErrorHandler(httpLogger));

export default app;
