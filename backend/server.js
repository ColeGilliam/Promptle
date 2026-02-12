// server.js
import app from './app.js';
import { PORT } from './config/config.js';
import { connectDB } from './config/db.js';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { setupSocket } from './sockets/index.js';



async function startServer() {
  await connectDB(); // Connect DB before listening; collections are now available for import in controllers

  const server = createServer(app);
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
  setupSocket(server);
  
}


startServer().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});