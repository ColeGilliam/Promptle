// config/config.js
import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 3001;
export const MONGODB_URI = process.env.MONGODB_URI;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!MONGODB_URI || typeof MONGODB_URI !== 'string' || !MONGODB_URI.trim()) {
  console.error('MONGODB_URI is missing or empty. Set it in your .env (e.g., mongodb+srv://... or mongodb://...).');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set; /api/subjects will be unavailable.');
}