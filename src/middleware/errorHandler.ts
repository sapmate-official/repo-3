import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const requestId = req.headers['x-request-id'];

  if (err instanceof ZodError) {
    logger.warn({ reqId: requestId, errors: err.errors }, 'Validation error');
    res.status(400).json({
      error: 'Validation Error',
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    });
    return;
  }

  logger.error(
    {
      reqId: requestId,
      method: req.method,
      url: req.url,
      statusCode,
      err: err.message,
      stack: env.NODE_ENV !== 'production' ? err.stack : undefined
    },
    'Request error'
  );

  res.status(statusCode).json({
    error: statusCode === 500 && env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message,
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
    requestId
  });
};

