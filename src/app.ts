import Fastify, {
  type FastifyInstance,
  type FastifyPluginCallback,
} from 'fastify';
import sensible from '@fastify/sensible';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import view from '@fastify/view';
import fastifyMetricsImport from 'fastify-metrics';
import ejs from 'ejs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { health } from './routes/health.js';
import { ready } from './routes/ready.js';
import { root } from './routes/root.js';
import { urlsRoute } from './routes/urls.js';
import { statsRoute } from './routes/stats.js';

// fastify-metrics ships CJS with `exports.default`; under NodeNext the default
// import surfaces as the module namespace. Unwrap + cast to the plugin type.
const fastifyMetrics = ((
  fastifyMetricsImport as unknown as { default?: unknown }
).default ?? fastifyMetricsImport) as FastifyPluginCallback<{
  endpoint?: string;
  clearRegisterOnInit?: boolean;
}>;

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

  // Prometheus metrics at GET /metrics (Node.js vitals + per-route HTTP
  // histogram/summary). `clearRegisterOnInit` lets repeated buildApp() calls
  // (the vitest suite) re-register against prom-client's global registry
  // without the "metric already registered" conflict.
  await app.register(fastifyMetrics, {
    endpoint: '/metrics',
    clearRegisterOnInit: true,
  });

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
