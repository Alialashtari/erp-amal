import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

/** Attaches a correlation id to every request and echoes it on the response. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
