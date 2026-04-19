import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import view from '@fastify/view';
import ejs from 'ejs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { health } from './routes/health.js';
import { ready } from './routes/ready.js';
import { root } from './routes/root.js';
import { urlsRoute } from './routes/urls.js';
import { statsRoute } from './routes/stats.js';

const here = dirname(fileURLToPath(import.meta.url));

export type BuildAppOptions = { logger?: boolean };

export async function buildApp(
  opts: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: env.LOG_LEVEL },
    trustProxy: true,
  });

  await app.register(sensible);
  await app.register(formbody);

  await app.register(view, {
    engine: { ejs },
    root: join(here, 'views'),
    defaultContext: { appName: 'url-utilities admin' },
    includeViewExtension: true,
    viewExt: 'ejs',
    propertyName: 'view',
  });

  await app.register(fastifyStatic, {
    root: join(here, 'public'),
    prefix: '/public/',
    decorateReply: false,
  });

  await app.register(health);
  await app.register(ready);
  await app.register(root);
  await app.register(urlsRoute);
  await app.register(statsRoute);

  return app;
}
