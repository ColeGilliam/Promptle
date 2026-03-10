import { Server } from "socket.io";

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

  const playerNames = new Map(); // socketId → playerName

  io.on('connection', (socket) => {
    console.log('[BACKEND] Player connected:', socket.id);

    socket.on('join-room', ({ roomId, playerName }) => {
      if (!roomId || typeof roomId !== 'string' || roomId.trim() === '') {
        socket.emit('error', 'Invalid room ID');
        return;
      }

      const cleanRoom = roomId.trim();

      // Store this player's name keyed by their socket ID
      playerNames.set(socket.id, playerName || `Guest`);

      socket.join(cleanRoom);
      console.log(`[BACKEND] ${playerName || 'Guest'} joined room ${cleanRoom} (socket ${socket.id})`);

      // Build player list using each socket's stored name
      const roomSockets = io.sockets.adapter.rooms.get(cleanRoom) || new Set();
      const players = Array.from(roomSockets).map((clientId) => ({
        id: clientId,
        name: playerNames.get(clientId) || 'Guest'  // ← each player's own name
      }));

      console.log(`[BACKEND] Current players in ${cleanRoom}:`, players);

      io.to(cleanRoom).emit('players-updated', { roomId: cleanRoom, players });
      socket.emit('joined-room', { roomId: cleanRoom, message: `Joined ${cleanRoom}` });
    });

    socket.on('player-guess', ({ roomId, playerName, playerId, colors, isCorrect, finishTime }) => {
      socket.to(roomId).emit('opponent-guess', { playerName, playerId, colors, isCorrect, finishTime });
      if (isCorrect) {
        io.to(roomId).emit('player-won', { playerName, playerId });  // ← add playerId
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
      playerNames.delete(socket.id); // ← clean up their name

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
    });
  });

  io.engine.on("connection_error", (err) => {
    console.log("[BACKEND] Engine connection error:", err.req?.url, err.code, err.message);
  });

  return io;
}