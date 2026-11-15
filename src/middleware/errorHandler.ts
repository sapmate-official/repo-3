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

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    logger.warn({ reqId: requestId, errors: err.issues }, 'Validation error');
    const fieldMessages = err.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ');
    res.status(400).json({
      success: false,
      message: fieldMessages || 'Validation Error',
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      })),
      requestId
    });
    return;
  }

  // 2. Request Entity Too Large
  if (err.type === 'entity.too.large') {
    logger.warn({ reqId: requestId }, 'Request body too large');
    res.status(413).json({
      success: false,
      message: 'Request body is too large.',
      error: 'Request body is too large.',
      code: 'PAYLOAD_TOO_LARGE',
      requestId
    });
    return;
  }

  // 3. Malformed JSON Body
  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn({ reqId: requestId }, 'Malformed JSON body');
    res.status(400).json({
      success: false,
      message: 'Malformed JSON request body.',
      error: 'Malformed JSON request body.',
      code: 'INVALID_JSON',
      requestId
    });
    return;
  }

  // 4. Prisma Known Request Errors
  if (err.name === 'PrismaClientKnownRequestError' && typeof err.code === 'string') {
    logger.warn({ reqId: requestId, prismaCode: err.code, err: err.message }, 'Database constraint error');
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'A record with matching unique values already exists.',
        error: 'Conflict',
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        requestId
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'The requested database record was not found.',
        error: 'Not Found',
        code: 'RECORD_NOT_FOUND',
        requestId
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'Referenced relational entity does not exist or cannot be modified.',
        error: 'Bad Request',
        code: 'FOREIGN_KEY_CONSTRAINT_FAILED',
        requestId
      });
      return;
    }
  }

  // 5. General HTTP / Application Errors
  const statusCode = err.statusCode ?? err.status ?? 500;
  const isProd = env.NODE_ENV === 'production';
  const errorMessage = statusCode === 500 && isProd ? 'Internal Server Error' : err.message || 'An error occurred';

  logger.error(
    {
      reqId: requestId,
      method: req.method,
      url: req.url,
      statusCode,
      err: err.message,
      stack: !isProd ? err.stack : undefined
    },
    'Request error'
  );

  res.status(statusCode).json({
    success: false,
    message: errorMessage,
    error: errorMessage,
    ...(err.code ? { code: err.code } : {}),
    ...(!isProd && err.stack ? { stack: err.stack } : {}),
    requestId
  });
};
