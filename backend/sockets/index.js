import { Server } from "socket.io";

export function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: 'http://localhost:4200',  // change to "*" temporarily if you still have connection issues
      methods: ['GET', 'POST'],
    },
    allowEIO3: true,  // keep only while testing with older clients / tools
  });

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // ───────────────────────────────────────────────
    // Simple echo example (you can remove later)
    socket.on('chat message', (message) => {
      console.log('Received message:', message);
      //socket.emit('chat message', `Server echo: ${message}`);
    });
    // ───────────────────────────────────────────────

    // Join room handler
    socket.on('join room', (roomName) => {
      if (typeof roomName !== 'string' || roomName.trim() === '') {
        return socket.emit('error', 'Invalid room name');
      }

      const cleanRoom = roomName.trim().toLowerCase();

      socket.join(cleanRoom);
      console.log(`User ${socket.id} joined room: ${cleanRoom}`);

      socket.emit('joined room', cleanRoom);

      // Announce to others in the room (optional)
      socket.to(cleanRoom).emit('notification', `User ${socket.id} has joined the room`);
    });

    // Room-aware chat message handler
    socket.on('chat message', (data) => {
      let room, message;

      if (typeof data === 'string') {
        // backward compatibility: plain string → use default room
        message = data;
        room = 'general';
      } else if (data && data.room && data.text) {
        room = data.room.trim().toLowerCase();
        message = data.text.trim();
      } else {
        return socket.emit('error', 'Invalid message format');
      }

      if (!message) return;

      console.log(`Message in room "${room}": ${message} (from ${socket.id})`);

      // Send to everyone in the room EXCEPT the sender
      socket.to(room).emit('chat message', message);

      // Also send back to sender (so they see their own message immediately)
      socket.emit('chat message', message);
    });
  });

  // Global engine-level error logging (this is fine outside connection handler)
  io.engine.on("connection_error", (err) => {
    console.log("Engine connection error:", err.req?.url, err.code, err.message);
  });

  return io;
}