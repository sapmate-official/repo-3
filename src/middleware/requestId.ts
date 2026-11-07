import { randomUUID } from 'crypto';
import { type NextFunction, type Request, type Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const inbound = req.headers['x-request-id'];
  const candidate = typeof inbound === 'string' ? inbound : undefined;
  const reqId = candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();

  req.headers['x-request-id'] = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
};
