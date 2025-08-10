import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface RequestWithCid extends Request {
  cid: string;
}

export const withCorrelationId = (req: RequestWithCid, res: Response, next: NextFunction) => {
  req.cid = (req.headers['x-correlation-id'] as string) || randomUUID();
  res.setHeader('x-correlation-id', req.cid);
  next();
};