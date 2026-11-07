import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import prisma from './db/prisma.js';
import { closeRedis } from './db/redis.js';
import { cleanupExpiredSessions } from './modules/auth/authSession.service.js';

const app = createApp();

const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(`Alkaa TypeScript Backend running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

const SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let cleaningSessions = false;

const sessionCleanupTimer = setInterval(() => {
  if (cleaningSessions) {
    return;
  }

  cleaningSessions = true;
  void cleanupExpiredSessions()
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Expired auth session cleanup failed');
    })
    .finally(() => {
      cleaningSessions = false;
    });
}, SESSION_CLEANUP_INTERVAL_MS);
sessionCleanupTimer.unref();

const gracefulShutdown = (signal: string): void => {
  logger.info(`${signal} received: closing HTTP server and database connections`);
  clearInterval(sessionCleanupTimer);
  server.close(() => {
    void (async () => {
      try {
        await closeRedis();
        await prisma.$disconnect();
        logger.info('Prisma disconnected');
      } finally {
        process.exit(0);
      }
    })();
  });
};

process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });
