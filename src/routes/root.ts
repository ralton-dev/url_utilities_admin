import type { FastifyPluginAsync } from 'fastify';

export const root: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => reply.redirect('/urls'));
};
