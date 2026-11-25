import { z } from 'zod';

import { checkDatabaseConnection } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { type ApiModule, defineRoute } from '../../common/http/route.js';

const healthSchema = z
  .object({
    status: z.literal('ok'),
    database: z.literal('up'),
    uptimeSeconds: z.number(),
    timestamp: z.string(),
  })
  .meta({ id: 'Health' });

export const healthModule: ApiModule = {
  basePath: '/health',
  tag: 'Health',
  description: 'Service and database status.',
  access: 'public',
  routes: [
    defineRoute({
      method: 'get',
      path: '/',
      summary: 'Health check',
      description: 'Returns 503 SERVICE_UNAVAILABLE when the database cannot be reached.',
      schemas: {},
      success: { status: 200, description: 'API and database are up.', schema: healthSchema },
      handle: async () => {
        try {
          await checkDatabaseConnection();
        } catch (error) {
          throw new AppError(503, 'SERVICE_UNAVAILABLE', 'The database is not reachable.', {
            cause: error,
          });
        }
        return {
          status: 'ok',
          database: 'up',
          uptimeSeconds: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
        };
      },
    }),
  ],
};
