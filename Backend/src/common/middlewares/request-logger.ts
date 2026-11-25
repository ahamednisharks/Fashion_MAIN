import type { RequestHandler } from 'express';

import { env } from '../../config/env.js';
import { logger } from '../utils/logger.js';

/** One line per request: method, path, status and duration. */
export const requestLogger: RequestHandler = (req, res, next) => {
  if (!env.logRequests) {
    next();
    return;
  }
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
};
