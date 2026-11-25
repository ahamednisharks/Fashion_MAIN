import { existsSync } from 'node:fs';
import path from 'node:path';

import express, { type Express, type RequestHandler } from 'express';

import { projectRoot } from './common/utils/project.js';
import { env } from './config/env.js';

/** Request paths owned by the API; they are never answered with the Angular app. */
const BACKEND_PREFIXES = ['/api'];

/** Angular fingerprints its JS/CSS bundles (main-ABCD1234.js), so those can be cached for good. */
const HASHED_BUNDLE = /-[A-Z0-9]{8}\.(?:js|css)$/;

/**
 * Folder of the Angular production build: FRONTEND_DIST, or Frontend/dist/fashion/browser beside
 * the Backend folder (found from the Backend package root, so it works from src/ and dist/).
 */
export function frontendDir(): string {
  return (
    env.frontendDist || path.resolve(projectRoot(), '..', 'Frontend', 'dist', 'fashion', 'browser')
  );
}

/** The Angular build folder, or undefined when it has not been built (no index.html). */
export function findFrontendBuild(): string | undefined {
  const dir = frontendDir();
  return existsSync(path.join(dir, 'index.html')) ? dir : undefined;
}

/**
 * Single-service mode: serves the compiled Angular app from this same server.
 *  - real files (JS, CSS, icons...) are served as static assets;
 *  - any other GET/HEAD outside /api gets index.html so Angular's router handles deep links and
 *    browser refreshes (e.g. /purchase/orders/12).
 * Everything under /api stays with the REST API (unknown API paths still get the JSON 404).
 */
export function serveFrontend(app: Express, dir: string): void {
  app.use(
    express.static(dir, {
      index: false, // "/" is answered by the fallback below
      setHeaders: (res, filePath) => {
        res.setHeader(
          'Cache-Control',
          HASHED_BUNDLE.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  app.use(spaFallback(path.join(dir, 'index.html')));
}

function spaFallback(indexHtml: string): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (
      BACKEND_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))
    ) {
      next();
      return;
    }
    // A path with a file extension that static serving did not find (e.g. a stale chunk after a
    // new deploy) is a real 404, not an app route.
    if (path.extname(req.path)) {
      next();
      return;
    }
    res.sendFile(indexHtml, { headers: { 'Cache-Control': 'no-cache' } }, (error) => {
      if (error && !res.headersSent) {
        next(error);
      }
    });
  };
}
