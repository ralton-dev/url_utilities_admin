import type { FastifyInstance } from 'fastify';

export async function makeApp(): Promise<FastifyInstance> {
  const { buildApp } = await import('../src/app.js');
  return buildApp({ logger: false });
}
