# Promptle
This is a wordle-like puzle game which allows for infinite topics to be played in a wordle style.

## AI-powered subject generator
The backend now exposes `POST /api/subjects` to turn a user-entered topic into a short list of study subjects using the OpenAI API.

1. Add your OpenAI key to `backend/.env`:
   ```
   OPENAI_API_KEY=sk-...
   PORT=3000
   ```
2. Install and start the backend:
   ```
   cd backend
   npm install
   npm run devStart
   ```
3. Start the Angular app (from `frontend/`):
   ```
   npm install
   npm start
   ```
4. In the UI, enter a topic in the “Generate subjects with AI” box and click “Generate subjects” to see the list.
