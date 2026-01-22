// server.js
import app from './app.js';
import { PORT } from './config/config.js';
import { connectDB } from './config/db.js';

async function startServer() {
  await connectDB(); // Connect DB before listening; collections are now available for import in controllers

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});