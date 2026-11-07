import { type NextFunction, type Request, type Response } from 'express';
import { getAllowedOrigins } from '../config/env.js';
import { AppError } from '../util/errors.js';

export const requireTrustedOrigin = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }

  if (getAllowedOrigins().includes(origin)) {
    next();
    return;
  }

  next(new AppError('Request origin is not allowed.', 403, 'ORIGIN_NOT_ALLOWED'));
};
