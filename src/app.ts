import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env, getAllowedOrigins } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requireTrustedOrigin } from './middleware/trustedOrigin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { v1Router } from './routes/v1.js';
import { v2Router } from './routes/v2.js';
import { AppError } from './util/errors.js';

const trustProxyValue = (): boolean | number | string => {
  if (env.TRUST_PROXY === 'true') {
    return 1;
  }
  if (/^\d+$/.test(env.TRUST_PROXY)) {
    return Number(env.TRUST_PROXY);
  }
  return env.TRUST_PROXY;
};

export const createApp = (): Express => {
  const app = express();

  if (env.TRUST_PROXY !== 'false') {
    app.set('trust proxy', trustProxyValue());
  }

  // 1. Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false
    })
  );

  // 2. CORS configuration with explicit origins from env
  const allowedOrigins = getAllowedOrigins();
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new AppError(`Origin not allowed: ${origin}`, 403, 'CORS_ORIGIN_DENIED'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-Request-Id',
        'X-Org-Id'
      ]
    })
  );

  // 3. Body Parsing & Cookies
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.URLENCODED_BODY_LIMIT }));
  app.use(cookieParser());

  // 4. Request ID & Tracing
  app.use(requestIdMiddleware);

  // 5. Health Check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'alkaa-backend-ts',
      environment: env.NODE_ENV
    });
  });

  // 6. API Routes (state-changing requests must come from a trusted origin)
  app.use('/api/v1', requireTrustedOrigin, v1Router);
  app.use('/api/v2', requireTrustedOrigin, v2Router);

  // 7. Central Error Handler (registered last)
  app.use(errorHandler);

  return app;
};

export default createApp;
