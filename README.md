# Promptle

Promptle is a browser puzzle game inspired by Wordle. Players pick or generate a topic, make guesses, and use structured feedback to narrow down the answer. The app also includes daily games, Connections-style puzzles, crosswords, multiplayer rooms, profiles, saved games, recommendations, and optional billing-backed AI access.

## Tech Stack

- Angular 20 frontend
- Node.js / Express backend
- MongoDB for persistence
- Socket.IO for multiplayer and chat
- Auth0 for sign-in, with an optional local dev auth bypass
- OpenAI for generated puzzle content and moderation
- Stripe for paid AI access

## Prerequisites

- Node.js 20+ and npm
- MongoDB connection string
- OpenAI API key if you want AI-generated games or moderation to work
- Stripe keys only if you are testing billing flows

## Setup

From the project root, install dependencies for each app:

```bash
npm install --prefix backend
npm install --prefix frontend
```

Create `backend/.env` from the example file:

```bash
cp backend/.env.example backend/.env
```

At minimum, set:

```bash
MONGODB_URI=your_mongodb_connection_string
DB_NAME=promptle
PORT=3001
```

For local development without using Auth0, enable the dev auth bypass:

```bash
DEV_AUTH_ENABLED=true
DEV_AUTH0_ID=dev-user
DEV_AUTH_EMAIL=dev@example.com
DEV_AUTH_NAME=Dev User
```

Optional service variables:

- `OPENAI_API_KEY` enables AI-generated Promptle, Connections, Crossword, topic validation, and moderation features.
- `API_NINJAS_API_KEY` enables external profanity filtering.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID`, and `STRIPE_TOKEN_PRICE_ID` enable billing flows.
- `CLIENT_URL=http://localhost:8080` keeps Stripe redirects pointed at the local Angular dev server.

## Run Locally

Start the backend in one terminal:

```bash
cd backend
npm run devStart
```

Start the frontend in another terminal:

```bash
cd frontend
npm start
```

Open `http://localhost:8080`.

The Angular dev server proxies `/api` and `/socket.io` to `http://localhost:3001`, so the frontend and backend should both be running for the full app experience.

## Useful Scripts

Backend:

```bash
cd backend
npm start        # start with Node
npm run devStart # start with nodemon
npm test         # run backend node:test tests
```

Frontend:

```bash
cd frontend
npm start # run Angular dev server on port 8080
npm test  # run Angular tests
npm run build
```

## Project Layout

```text
backend/
  app.js              Express app setup
  server.js           HTTP and Socket.IO server startup
  routes/             API route registration
  controllers/        Request handlers
  services/           Game generation, moderation, billing, and persistence helpers
  sockets/            Multiplayer socket behavior
  test/               Backend tests

frontend/
  src/app/pages/      Main Angular views
  src/app/services/   API, auth, game, billing, and socket clients
  src/app/shared/     Shared UI and layout code
```
