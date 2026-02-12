import { Server } from "socket.io";

export function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: 'http://localhost:4200',
      methods: ['GET', 'POST'],
  },
  allowEIO3: true, // Enable support for Socket.IO v3 clients
});
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('chat message', (message) => {
  console.log('Received message:', message);

  socket.emit('chat message', 'Server echo: ${message}');
});
});

io.engine.on("connection_error", (err) => {
  console.log("Engine connection error:", err.req?.url, err.code, err.message);
});


return io;
}