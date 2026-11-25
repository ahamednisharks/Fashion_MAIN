import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { createApiRouter } from './common/http/route.js';
import { csrfProtection } from './common/middlewares/csrf.js';
import { errorHandler, notFoundHandler } from './common/middlewares/error-handler.js';
import { requestLogger } from './common/middlewares/request-logger.js';
import { packageVersion } from './common/utils/project.js';
import { env } from './config/env.js';
import { API_PREFIX, buildOpenApiDocument } from './config/swagger.js';
import { requireAccess } from './modules/auth/auth.middleware.js';
import { API_MODULES } from './routes.js';

const version = packageVersion();

/**
 * Runs in the browser inside Swagger UI (serialised by swagger-ui-express), so it must be
 * self-contained — no imports or outer variables. Copies the `XSRF-TOKEN` cookie into the
 * `X-XSRF-TOKEN` header (names must match common/middlewares/csrf.ts).
 */
function swaggerXsrfInterceptor(request: { headers: Record<string, string> }) {
  const browser = globalThis as unknown as { document?: { cookie: string } };
  const match = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(browser.document?.cookie ?? '');
  if (match?.[1]) {
    request.headers['X-XSRF-TOKEN'] = decodeURIComponent(match[1]);
  }
  return request;
}

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Requests forwarded by a local reverse proxy (e.g. the Angular dev server) keep the client IP.
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-XSRF-TOKEN'],
      credentials: true,
      maxAge: 600,
    }),
  );
  // Registered before the body parser so requests with malformed JSON are logged too.
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));

  // API documentation (generated from the route definitions).
  const openApiDocument = buildOpenApiDocument(API_MODULES, version);
  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Fashion API docs',
      swaggerOptions: {
        docExpansion: 'none',
        tagsSorter: 'alpha',
        operationsSorter: 'method',
        withCredentials: true,
        // "Try it out" requests carry the session cookie; add the CSRF header like Angular does.
        requestInterceptor: swaggerXsrfInterceptor,
      },
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      name: 'Fashion API',
      version,
      docs: '/api/docs',
      health: `${API_PREFIX}/health`,
    });
  });

  app.use(API_PREFIX, csrfProtection({ secure: env.auth.cookieSecure }));
  app.use(API_PREFIX, createApiRouter(API_MODULES, { accessGuard: requireAccess }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
