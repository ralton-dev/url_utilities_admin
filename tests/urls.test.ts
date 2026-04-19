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

const sampleItem = {
  id: 1,
  alias: 'aZ9xK2pQ0b',
  url: 'https://example.com/very/long/path',
  count: 42,
  createdAt: '2026-04-19T10:00:00.000Z',
};

describe('URLs routes', () => {
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

  it('renders the list page', async () => {
    mock
      .get('http://fake-core.test')
      .intercept({
        path: /^\/api\/admin\/urls(\?.*)?$/,
        method: 'GET',
      })
      .reply(200, {
        success: true,
        data: { items: [sampleItem], total: 1, page: 1, pageSize: 20 },
      });

    const res = await app.inject({ method: 'GET', url: '/urls' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('aZ9xK2pQ0b');
    expect(res.body).toContain('example.com');
  });

  it('renders the table fragment for HTMX', async () => {
    mock
      .get('http://fake-core.test')
      .intercept({
        path: /^\/api\/admin\/urls(\?.*)?$/,
        method: 'GET',
      })
      .reply(200, {
        success: true,
        data: { items: [sampleItem], total: 1, page: 1, pageSize: 20 },
      });

    const res = await app.inject({
      method: 'GET',
      url: '/urls/partials/table',
      headers: { 'hx-request': 'true' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('aZ9xK2pQ0b');
    // Fragment should not contain the layout chrome
    expect(res.body).not.toContain('<html');
  });

  it('renders the detail page', async () => {
    mock
      .get('http://fake-core.test')
      .intercept({ path: '/api/admin/urls/aZ9xK2pQ0b', method: 'GET' })
      .reply(200, {
        success: true,
        data: { ...sampleItem, qrCode: null },
      });

    const res = await app.inject({
      method: 'GET',
      url: '/urls/aZ9xK2pQ0b',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(sampleItem.url);
  });

  it('404s when the core returns not-found', async () => {
    mock
      .get('http://fake-core.test')
      .intercept({ path: '/api/admin/urls/ZZZZZZZZZZ', method: 'GET' })
      .reply(404, { success: false, errors: ['Not found'] });

    const res = await app.inject({
      method: 'GET',
      url: '/urls/ZZZZZZZZZZ',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns an empty 200 on HTMX delete', async () => {
    mock
      .get('http://fake-core.test')
      .intercept({ path: '/api/admin/urls/aZ9xK2pQ0b', method: 'DELETE' })
      .reply(204, '');

    const res = await app.inject({
      method: 'DELETE',
      url: '/urls/aZ9xK2pQ0b',
      headers: { 'hx-request': 'true' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('');
  });

  it('rejects malformed alias params', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/urls/short',
      headers: { 'hx-request': 'true' },
    });
    expect(res.statusCode).toBe(404);
  });
});
