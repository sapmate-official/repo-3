import { createClient, type RedisClientType } from 'redis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let client: RedisClientType | undefined;

export const getRedisClient = (): RedisClientType | undefined => {
  if (!env.REDIS_URL) {
    return undefined;
  }

  if (!client) {
    client = createClient({ url: env.REDIS_URL });
    client.on('error', (error: unknown) => {
      logger.error({ err: error }, 'Redis client error');
    });
    void client.connect().catch((error: unknown) => {
      logger.error({ err: error }, 'Redis connection failed');
    });
  }

  return client;
};

export const closeRedis = async (): Promise<void> => {
  if (client?.isOpen) {
    await client.quit();
  }
};
