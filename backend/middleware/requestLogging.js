import { randomUUID } from 'node:crypto';
import { appLogger } from '../lib/logger.js';

function getClientIp(req) {
  return req?.ip || req?.socket?.remoteAddress || null;
}

function getRequestPath(req) {
  return req?.originalUrl || req?.url || null;
}

export function attachRequestContext(logger = appLogger) {
  const requestLogger = logger.child({ component: 'http' });

  return function requestContextMiddleware(req, res, next) {
    const requestIdHeader = req.headers['x-request-id'];
    const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim()
      ? requestIdHeader.trim()
      : randomUUID();
    const startedAt = Date.now();

    req.id = requestId;
    res.setHeader('x-request-id', requestId);

    // "aborted" catches clients disconnecting mid-request, which Express finish logging will miss.
    req.on('aborted', () => {
      requestLogger.warn('http_request_aborted', {
        requestId,
        method: req.method,
        path: getRequestPath(req),
        ip: getClientIp(req),
        durationMs: Date.now() - startedAt,
      });
    });

    res.on('finish', () => {
      if (!requestLogger.isLevelEnabled('debug')) {
        return;
      }

      // Request completion is intentionally debug-only because it is high-volume during normal traffic.
      requestLogger.debug('http_request_finished', {
        requestId,
        method: req.method,
        path: getRequestPath(req),
        ip: getClientIp(req),
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  };
}

export function requestErrorHandler(logger = appLogger) {
  const requestLogger = logger.child({ component: 'http' });

  return function expressRequestErrorHandler(err, req, res, next) {
    const statusCode = err?.statusCode || err?.status || 500;

    requestLogger.error('http_request_unhandled_error', {
      requestId: req?.id || null,
      method: req?.method || null,
      path: getRequestPath(req),
      ip: getClientIp(req),
      statusCode,
      error: err,
    });

    // Let Express handle already-started responses instead of attempting to write a second body.
    if (res.headersSent) {
      return next(err);
    }

    return res.status(statusCode).json({ error: 'Internal server error' });
  };
}
