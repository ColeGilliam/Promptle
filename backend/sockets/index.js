// sockets/index.js
import { Server } from "socket.io";

export function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: 'http://localhost:4200',  // your Angular frontend
      methods: ['GET', 'POST'],
      credentials: true
    },
    allowEIO3: true,  // keep for compatibility during testing
  });

  io.on('connection', (socket) => {
    console.log('[BACKEND] Player connected:', socket.id);

    // ────────────────────────────────────────────────
    // JOIN ROOM - this is what your frontend emits
    // ────────────────────────────────────────────────
    socket.on('join-room', ({ roomId, playerName }) => {
      if (!roomId || typeof roomId !== 'string' || roomId.trim() === '') {
        socket.emit('error', 'Invalid room ID');
        return;
      }

      const cleanRoom = roomId.trim();  // keep case-sensitive for now

      socket.join(cleanRoom);

      console.log(`[BACKEND] ${playerName || 'Guest'} joined room ${cleanRoom} (socket ${socket.id})`);

      // Get all sockets in this room
      const roomSockets = io.sockets.adapter.rooms.get(cleanRoom) || new Set();

      // Build player list (simple: id + name)
      const players = Array.from(roomSockets).map((clientId) => {
        return {
          id: clientId,
          name: playerName || `Player ${clientId.slice(0, 4)}`
        };
      });

      console.log(`[BACKEND] Current players in ${cleanRoom}:`, players);

      // Broadcast updated player list to EVERYONE in the room
      io.to(cleanRoom).emit('players-updated', { roomId: cleanRoom, players });

      // Confirm to the joining user
      socket.emit('joined-room', { roomId: cleanRoom, message: `Joined ${cleanRoom}` });
    });

    // ────────────────────────────────────────────────
    // Your existing chat handlers (kept & cleaned)
    // ────────────────────────────────────────────────
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

      io.to(room).emit('chat message', message);  // send to all in room (including sender)
    });

    // ────────────────────────────────────────────────
    // Disconnect handling
    // ────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log('[BACKEND] Player disconnected:', socket.id);

      // Optional: broadcast to rooms they were in
      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          io.to(room).emit('notification', `User ${socket.id} left the room`);
        }
      });
    });
  });

  // Global connection error logging
  io.engine.on("connection_error", (err) => {
    console.log("[BACKEND] Engine connection error:", err.req?.url, err.code, err.message);
  });

  return io;
}