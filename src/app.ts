import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env, getAllowedOrigins, isOriginAllowed } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requireTrustedOrigin } from './middleware/trustedOrigin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { v1Router } from './routes/v1.js';
import { v2Router } from './routes/v2.js';
import { v3Router } from './routes/v3.js';
import { publicRouter } from './modules/public/public.router.js';
import { BillingController } from './modules/billing/billing.controller.js';
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
  const helmetMiddleware = (
    typeof helmet === 'function'
      ? helmet
      : (helmet as unknown as { default: typeof helmet }).default
  ) as unknown as (options?: Record<string, unknown>) => express.RequestHandler;

  app.use(
    helmetMiddleware({
      contentSecurityPolicy: env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false
    })
  );

  // 2. CORS configuration with explicit origins from env
  const allowedOrigins = getAllowedOrigins();
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isOriginAllowed(origin, allowedOrigins)) {
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

  // 3. Request ID & Tracing
  app.use(requestIdMiddleware);

  // 4. Body Parsing & Cookies
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.URLENCODED_BODY_LIMIT }));
  app.use(cookieParser());

  // 5. Health Check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'alkaa-backend-ts',
      environment: env.NODE_ENV
    });
  });

  // 6. Public endpoints (no auth required)
  app.get('/api/public/billing/:id', BillingController.getPublicBill);
  app.post('/api/public/billing/:id/payment', BillingController.payPublicBill);
  app.use('/api/public', publicRouter);

  // 7. API Routes (state-changing requests must come from a trusted origin)
  app.use('/api/v1', requireTrustedOrigin, v1Router);
  app.use('/api/v2', requireTrustedOrigin, v2Router);
  app.use('/api/v3', requireTrustedOrigin, v3Router);

  // 8. Central Error Handler (registered last)
  app.use(errorHandler);

  return app;
};

export default createApp;
