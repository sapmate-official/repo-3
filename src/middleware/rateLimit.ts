import rateLimit, { type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from '../db/redis.js';

type RedisReply = boolean | number | string | (boolean | number | string)[];

const redisStore = (prefix: string): Store | undefined => {
  const client = getRedisClient();
  if (!client) {
    return undefined;
  }

  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) =>
      client.sendCommand(args) as unknown as Promise<RedisReply>
  });
};

const rateLimitOptions = {
  standardHeaders: true,
  legacyHeaders: false
} as const;

export const authLimiter = rateLimit({
  ...rateLimitOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 login requests per windowMs
  store: redisStore('rl:auth:'),
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

export const otpLimiter = rateLimit({
  ...rateLimitOptions,
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 OTP attempts
  store: redisStore('rl:otp:'),
  message: {
    error: 'Too many OTP verification attempts. Please wait 10 minutes.',
    code: 'OTP_RATE_LIMIT_EXCEEDED'
  }
});

export const refreshLimiter = rateLimit({
  ...rateLimitOptions,
  windowMs: 15 * 60 * 1000,
  max: 60,
  store: redisStore('rl:refresh:'),
  message: {
    error: 'Too many token refresh attempts. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

export const logoutLimiter = rateLimit({
  ...rateLimitOptions,
  windowMs: 15 * 60 * 1000,
  max: 30,
  store: redisStore('rl:logout:'),
  message: {
    error: 'Too many logout requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

export const publicLimiter = rateLimit({
  ...rateLimitOptions,
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  store: redisStore('rl:public:'),
  message: {
    error: 'Too many requests. Please slow down.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});
