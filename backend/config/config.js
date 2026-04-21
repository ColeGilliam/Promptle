// config/config.js
import dotenv from 'dotenv';
import { appLogger } from '../lib/logger.js';

dotenv.config();

const configLogger = appLogger.child({ component: 'config' });

function parseBoolean(value) {
  return typeof value === 'string' && ['1', 'true'].includes(value.toLowerCase());
}

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = process.env.PORT || 3001;
export const MONGODB_URI = process.env.MONGODB_URI;
export const DB_NAME = process.env.DB_NAME || 'promptle';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const LOG_LEVEL = process.env.LOG_LEVEL || '';
const dbPingInterval = Number(process.env.DB_PING_INTERVAL_MS || 30000);
export const DB_PING_INTERVAL_MS =
  Number.isFinite(dbPingInterval) && dbPingInterval > 0 ? dbPingInterval : 30000;
export const DEV_AUTH_ENABLED = NODE_ENV !== 'production' && parseBoolean(process.env.DEV_AUTH_ENABLED);
export const DEV_AUTH0_ID = process.env.DEV_AUTH0_ID || '';
export const DEV_AUTH_EMAIL = process.env.DEV_AUTH_EMAIL || '';
export const DEV_AUTH_NAME = process.env.DEV_AUTH_NAME || '';

if (!MONGODB_URI || typeof MONGODB_URI !== 'string' || !MONGODB_URI.trim()) {
  configLogger.fatal('missing_mongodb_uri', {
    detail: 'MONGODB_URI is missing or empty. Set it in your .env before starting the backend.',
  });
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  configLogger.error('missing_openai_api_key', {
    detail: 'OPENAI_API_KEY is not set. AI generation and moderation routes will be unavailable.',
  });
}
