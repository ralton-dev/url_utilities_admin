import type { FastifyPluginAsync } from 'fastify';
import { core } from '../clients/core.js';

export const statsRoute: FastifyPluginAsync = async (app) => {
  app.get('/stats', async (req, reply) => {
    try {
      const data = await core.stats();
      return reply.view(
        'stats/index',
        { title: 'Stats', ...data },
        { layout: 'layout.ejs' }
      );
    } catch (err) {
      req.log.error({ err: String(err) }, 'core stats failed');
      return reply.code(502).view(
        '_error',
        {
          title: 'Core unavailable',
          message: 'Could not reach the core service.',
        },
        { layout: 'layout.ejs' }
      );
    }
  });
};
