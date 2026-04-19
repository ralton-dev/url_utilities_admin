import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { MockAgent } from 'undici';
import { makeApp, useMockCore, restoreDispatcher } from './helpers.js';

describe('GET /api/ready', () => {
  let app: FastifyInstance;
  let mock: MockAgent;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mock = useMockCore();
  });

  afterEach(async () => {
    await restoreDispatcher();
  });

  it('returns ok when core is reachable', async () => {
    mock
      .get('http://fake-core.test')
      .intercept({ path: '/api/health', method: 'GET' })
      .reply(200, { status: 'ok' });

    const res = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 when core is unavailable', async () => {
    mock
      .get('http://fake-core.test')
      .intercept({ path: '/api/health', method: 'GET' })
      .reply(503, { status: 'unavailable' });

    const res = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(503);
  });
});
