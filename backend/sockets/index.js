import { Server } from "socket.io";
import { setIo } from "./socketState.js";
import { markRoomStarted } from "../controllers/gameController.js";

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

  io.on('connection', (socket) => {
    console.log('[BACKEND] Player connected:', socket.id);

    socket.on('join-room', ({ roomId, playerName }) => {
      if (!roomId || typeof roomId !== 'string' || roomId.trim() === '') {
        socket.emit('error', 'Invalid room ID');
        return;
      }

      const cleanRoom = roomId.trim();
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

    socket.on('start-game', ({ roomId }) => {
      if (roomHosts.get(roomId) !== socket.id) return;
      console.log(`[BACKEND] Game started in ${roomId} by host ${socket.id}`);
      markRoomStarted(roomId);
      io.to(roomId).emit('game-started');
    });

    socket.on('player-guess', ({ roomId, playerName, playerId, colors, isCorrect, finishTime }) => {
      // Increment guess count for this player
      playerGuesses.set(playerId, (playerGuesses.get(playerId) || 0) + 1);
      const guesses = playerGuesses.get(playerId);

      socket.to(roomId).emit('opponent-guess', { playerName, playerId, colors, isCorrect, finishTime, guesses });

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
      playerNames.delete(socket.id);
      playerGuesses.delete(socket.id); // ← clean up

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