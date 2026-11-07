import { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

interface HttpError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
  type?: string;
}

export const errorHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'];

  if (err instanceof ZodError) {
    logger.warn({ reqId: requestId, errors: err.issues }, 'Validation error');
    res.status(400).json({
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    });
    return;
  }

  if (err.type === 'entity.too.large') {
    logger.warn({ reqId: requestId }, 'Request body too large');
    res.status(413).json({
      error: 'Request body is too large.',
      code: 'PAYLOAD_TOO_LARGE',
      requestId
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn({ reqId: requestId }, 'Malformed JSON body');
    res.status(400).json({
      error: 'Malformed JSON request body.',
      code: 'INVALID_JSON',
      requestId
    });
    return;
  }

  const statusCode = err.statusCode ?? err.status ?? 500;

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
    error:
      statusCode === 500 && env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message,
    ...(err.code ? { code: err.code } : {}),
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
    requestId
  });
};
