import { createServer } from 'node:http';
import app from './app.js';
import { PORT } from './config/config.js';
import { closeDB, connectDB } from './config/db.js';
import { appLogger } from './lib/logger.js';
import { setupSocket } from './sockets/index.js';

const serverLogger = appLogger.child({ component: 'server' });
let server = null;

async function startServer() {
  await connectDB();

  server = createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    serverLogger.warn('server_started', {
      port: Number(PORT),
      host: '0.0.0.0',
    });
  });

  setupSocket(server);
}

async function shutdown(signal) {
  serverLogger.warn('server_shutdown_requested', { signal });

  if (server) {
    // Stop accepting new connections before closing the DB so in-flight work can drain cleanly.
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  await closeDB();
}

function registerShutdownHandler(signal) {
  // Keep signal handling centralized so SIGINT/SIGTERM follow the same shutdown path.
  process.on(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        serverLogger.error('server_shutdown_failed', { signal, error });
        process.exit(1);
      });
  });
}

registerShutdownHandler('SIGINT');
registerShutdownHandler('SIGTERM');

process.on('unhandledRejection', (reason) => {
  serverLogger.fatal('unhandled_promise_rejection', { reason });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  serverLogger.fatal('uncaught_exception', { error });
  process.exit(1);
});

startServer().catch((error) => {
  serverLogger.fatal('server_startup_failed', { error });
  process.exit(1);
});
