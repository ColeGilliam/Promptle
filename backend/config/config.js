// config/config.js
import dotenv from 'dotenv';

dotenv.config();

function parseBoolean(value) {
  return typeof value === 'string' && ['1', 'true'].includes(value.toLowerCase());
}

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const PORT = process.env.PORT || 3001;
export const MONGODB_URI = process.env.MONGODB_URI;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const DEV_AUTH_ENABLED = NODE_ENV !== 'production' && parseBoolean(process.env.DEV_AUTH_ENABLED);
export const DEV_AUTH0_ID = process.env.DEV_AUTH0_ID || '';
export const DEV_AUTH_EMAIL = process.env.DEV_AUTH_EMAIL || '';
export const DEV_AUTH_NAME = process.env.DEV_AUTH_NAME || '';

if (!MONGODB_URI || typeof MONGODB_URI !== 'string' || !MONGODB_URI.trim()) {
  console.error('MONGODB_URI is missing or empty. Set it in your .env (e.g., mongodb+srv://... or mongodb://...).');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set; /api/subjects will be unavailable.');
}
