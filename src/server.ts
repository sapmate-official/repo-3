import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import prisma from './db/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(`Alkaa TypeScript Backend running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received: closing HTTP server and database connections`);
  server.close(async () => {
    logger.info('HTTP server closed');
    await prisma.$disconnect();
    logger.info('Prisma disconnected');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

