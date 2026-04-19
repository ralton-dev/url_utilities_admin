import type { FastifyPluginAsync } from 'fastify';
import { env } from '../env.js';

export const ready: FastifyPluginAsync = async (app) => {
  app.get('/api/ready', async (_req, reply) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${env.CORE_URL.replace(/\/$/, '')}/api/health`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`core health ${res.status}`);
      return { status: 'ok' };
    } catch (err) {
      app.log.warn({ err: String(err) }, 'readiness failed: core unreachable');
      return reply.code(503).send({ status: 'unavailable' });
    } finally {
      clearTimeout(timeout);
    }
  });
};
