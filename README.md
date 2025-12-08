# Promptle
This is a wordle-like puzle game which allows for infinite topics to be played in a wordle style.

## Prerequisites
- Node.js 18+ and npm installed
- MongoDB connection string
- (Optional, for AI generation) OpenAI API key

## Backend (Node/Express)
1. `cd backend`
2. `npm install`
3. Create a `.env` in `backend/`:
   ```
   MONGODB_URI=your_mongodb_connection_string
   PORT=3001
   OPENAI_API_KEY=your_openai_key   # required for /api/subjects
   ```
4. Start the server: `npm run devStart` (or `node server.js`). It listens on `http://localhost:3001`.

Key endpoints:
- `GET /health` – health check
- `GET /api/popularTopics/list` – list topics
- `GET /api/game/start?topicId=1` – game data from MongoDB
- `POST /api/subjects` – generate subjects via OpenAI (needs `OPENAI_API_KEY`)

## Frontend (Angular)
1. `cd frontend`
2. `npm install`
3. `npm start` (or `ng serve`) then open `http://localhost:4200/`.

The frontend expects the backend at `http://localhost:3001` (see services). Adjust service URLs if you change ports or deploy.
