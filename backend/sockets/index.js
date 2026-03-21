import { Server } from "socket.io";
import { setIo } from "./socketState.js";
import { markRoomStarted, getRoomMode } from "../controllers/gameController.js";

export function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:8080',
        'https://promptle.unr.dev',
      ],
      methods: ['GET', 'POST'],
      credentials: true
    },
    allowEIO3: true,
  });

  setIo(io);

  const playerNames = new Map();   // socketId → playerName
  const roomHosts = new Map();     // roomId → host socketId
  const playerGuesses = new Map(); // socketId → guess count
  const gameModes = new Map();     // roomId → 'standard' | '1v1'
  const turnStates = new Map();    // roomId → { socketIds, currentIdx, timer }

  // ─── Turn helpers ──────────────────────────────────────────────────────
  function startTurnTimer(roomId, timeoutSecs = 30) {
    const state = turnStates.get(roomId);
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);

    state.timer = setTimeout(() => {
      const s = turnStates.get(roomId);
      if (!s) return;
      const skippedName = playerNames.get(s.socketIds[s.currentIdx]) || 'Guest';
      s.currentIdx = (s.currentIdx + 1) % s.socketIds.length;
      s.timer = null;
      const nextSocketId = s.socketIds[s.currentIdx];
      const nextPlayerName = playerNames.get(nextSocketId) || 'Guest';
      io.to(roomId).emit('1v1-turn-change', {
        currentTurnSocketId: nextSocketId,
        currentTurnPlayerName: nextPlayerName,
        skipped: true,
        skippedPlayerName: skippedName,
      });
      startTurnTimer(roomId, timeoutSecs);
    }, timeoutSecs * 1000);
  }

  function advanceTurn(roomId, timeoutSecs = 30) {
    const state = turnStates.get(roomId);
    if (!state) return;
    state.currentIdx = (state.currentIdx + 1) % state.socketIds.length;
    const nextSocketId = state.socketIds[state.currentIdx];
    const nextPlayerName = playerNames.get(nextSocketId) || 'Guest';
    io.to(roomId).emit('1v1-turn-change', {
      currentTurnSocketId: nextSocketId,
      currentTurnPlayerName: nextPlayerName,
    });
    startTurnTimer(roomId, timeoutSecs);
  }

  // ─── Connection handler ────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log('[BACKEND] Player connected:', socket.id);

    socket.on('join-room', async ({ roomId, playerName }) => {
      if (!roomId || typeof roomId !== 'string' || roomId.trim() === '') {
        socket.emit('error', 'Invalid room ID');
        return;
      }

      const cleanRoom = roomId.trim();

      // Enforce 2-player limit for 1v1 rooms
      const roomMode = await getRoomMode(cleanRoom);
      if (roomMode === '1v1') {
        const existingSockets = io.sockets.adapter.rooms.get(cleanRoom) || new Set();
        if (existingSockets.size >= 2) {
          socket.emit('join-error', { message: 'This 1v1 room is full (max 2 players)' });
          return;
        }
      }

      playerNames.set(socket.id, playerName || 'Guest');
      socket.join(cleanRoom);
      console.log(`[BACKEND] ${playerName || 'Guest'} joined room ${cleanRoom} (socket ${socket.id})`);

      if (!roomHosts.has(cleanRoom)) {
        roomHosts.set(cleanRoom, socket.id);
        console.log(`[BACKEND] Host of ${cleanRoom} is ${socket.id}`);
      }

      const isHost = roomHosts.get(cleanRoom) === socket.id;
      socket.emit('host-status', { isHost });

      const roomSockets = io.sockets.adapter.rooms.get(cleanRoom) || new Set();
      const players = Array.from(roomSockets).map((clientId) => ({
        id: clientId,
        name: playerNames.get(clientId) || 'Guest'
      }));

      console.log(`[BACKEND] Current players in ${cleanRoom}:`, players);
      io.to(cleanRoom).emit('players-updated', { roomId: cleanRoom, players });
      socket.emit('joined-room', { roomId: cleanRoom, message: `Joined ${cleanRoom}` });
    });

    socket.on('start-game', ({ roomId, mode }) => {
      if (roomHosts.get(roomId) !== socket.id) return;
      console.log(`[BACKEND] Game started in ${roomId} by host ${socket.id}, mode: ${mode}`);
      markRoomStarted(roomId);

      if (mode === '1v1') {
        gameModes.set(roomId, '1v1');
        const roomSockets = Array.from(io.sockets.adapter.rooms.get(roomId) || new Set());
        const firstIdx = Math.floor(Math.random() * roomSockets.length);
        turnStates.set(roomId, { socketIds: roomSockets, currentIdx: firstIdx, timer: null });
        const firstSocketId = roomSockets[firstIdx];
        const firstPlayerName = playerNames.get(firstSocketId) || 'Guest';
        io.to(roomId).emit('1v1-started', {
          currentTurnSocketId: firstSocketId,
          currentTurnPlayerName: firstPlayerName,
        });
        startTurnTimer(roomId, 30);
      } else {
        io.to(roomId).emit('game-started');
      }
    });

    socket.on('1v1-submit-guess', ({ roomId, guesserName, guessValues, guessColors, isCorrect, finishMs }) => {
      const state = turnStates.get(roomId);
      if (!state) return;

      const currentSocketId = state.socketIds[state.currentIdx];
      if (socket.id !== currentSocketId) return; // not their turn

      if (state.timer) { clearTimeout(state.timer); state.timer = null; }

      playerGuesses.set(socket.id, (playerGuesses.get(socket.id) || 0) + 1);
      const guesses = playerGuesses.get(socket.id);

      io.to(roomId).emit('1v1-guess-made', {
        guesserSocketId: socket.id,
        guesserName,
        guessValues,
        guessColors,
        isCorrect,
        finishMs,
        guesses,
      });

      if (isCorrect) {
        io.to(roomId).emit('1v1-game-over', {
          winnerId: socket.id,
          winnerName: guesserName,
          guessCount: guesses,
          finishMs,
        });
        turnStates.delete(roomId);
        gameModes.delete(roomId);
      } else {
        advanceTurn(roomId, 30);
      }
    });

    socket.on('1v1-use-skip', ({ roomId }) => {
      const state = turnStates.get(roomId);
      if (!state) return;

      const currentSocketId = state.socketIds[state.currentIdx];
      if (socket.id === currentSocketId) return; // can't skip your own turn

      // Clear the current turn timer
      if (state.timer) { clearTimeout(state.timer); state.timer = null; }

      const skippedName = playerNames.get(currentSocketId) || 'Guest';
      const skipperIdx  = state.socketIds.indexOf(socket.id);
      if (skipperIdx === -1) return;

      // Advance directly to the skipper's turn
      state.currentIdx = skipperIdx;
      io.to(roomId).emit('1v1-turn-change', {
        currentTurnSocketId: socket.id,
        currentTurnPlayerName: playerNames.get(socket.id) || 'Guest',
        skipped: true,
        skippedPlayerName: skippedName,
      });
      startTurnTimer(roomId, 30);
    });

    socket.on('use-powerup', ({ roomId, type, playerName }) => {
      console.log(`[BACKEND] ${playerName} used powerup "${type}" in ${roomId}`);
      socket.to(roomId).emit('powerup-effect', { type, fromPlayerName: playerName });
    });

    socket.on('player-guess', ({ roomId, playerName, playerId, colors, values, isCorrect, finishTime }) => {
      playerGuesses.set(playerId, (playerGuesses.get(playerId) || 0) + 1);
      const guesses = playerGuesses.get(playerId);

      socket.to(roomId).emit('opponent-guess', { playerName, playerId, colors, values, isCorrect, finishTime, guesses });

      if (isCorrect) {
        io.to(roomId).emit('player-won', { playerName, playerId, guesses, finishTime });
      }
    });

    socket.on('chat message', (data) => {
      let room = 'general';
      let message = '';
      if (typeof data === 'string') {
        message = data;
      } else if (data && data.room && data.text) {
        room = data.room.trim().toLowerCase();
        message = data.text.trim();
      }
      if (!message) return;
      console.log(`[BACKEND] Message in room "${room}": ${message} (from ${socket.id})`);
      io.to(room).emit('chat message', message);
    });

    socket.on('disconnect', () => {
      console.log('[BACKEND] Player disconnected:', socket.id);

      // Clean up 1v1 turn state if this player was in one
      turnStates.forEach((state, roomId) => {
        const idx = state.socketIds.indexOf(socket.id);
        if (idx === -1) return;

        state.socketIds.splice(idx, 1);
        if (state.socketIds.length === 0) {
          if (state.timer) clearTimeout(state.timer);
          turnStates.delete(roomId);
          gameModes.delete(roomId);
        } else {
          if (state.currentIdx >= state.socketIds.length) state.currentIdx = 0;
          if (state.timer) { clearTimeout(state.timer); state.timer = null; }
          const nextSocketId = state.socketIds[state.currentIdx];
          const nextPlayerName = playerNames.get(nextSocketId) || 'Guest';
          io.to(roomId).emit('1v1-player-disconnected', { playerName: playerNames.get(socket.id) || 'Guest' });
          io.to(roomId).emit('1v1-turn-change', {
            currentTurnSocketId: nextSocketId,
            currentTurnPlayerName: nextPlayerName,
          });
          startTurnTimer(roomId, 30);
        }
      });

      playerNames.delete(socket.id);
      playerGuesses.delete(socket.id);

      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          const roomSockets = io.sockets.adapter.rooms.get(room) || new Set();
          const players = Array.from(roomSockets).map((clientId) => ({
            id: clientId,
            name: playerNames.get(clientId) || 'Guest'
          }));
          io.to(room).emit('players-updated', { roomId: room, players });
        }
      });

      roomHosts.forEach((hostId, roomId) => {
        if (hostId === socket.id) roomHosts.delete(roomId);
      });
    });
  });

  io.engine.on("connection_error", (err) => {
    console.log("[BACKEND] Engine connection error:", err.req?.url, err.code, err.message);
  });

  return io;
}
