import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp } from './helpers.js';

describe('POST /urls (legacy core /api/url)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a short URL and redirects to its detail page', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/urls',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'url=https%3A%2F%2Fexample.com%2Fcreate-test',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/urls\/[0-9A-Za-z]{10}$/);
  });

  it('returns HX-Redirect for HTMX clients', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/urls',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'hx-request': 'true',
      },
      payload: 'url=https%3A%2F%2Fexample.com%2Fhtmx-create',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['hx-redirect']).toMatch(/^\/urls\/[0-9A-Za-z]{10}$/);
  });

  it('400s on invalid URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/urls',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'url=not-a-url',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Invalid');
  });

  it('returns the same alias for the same URL (idempotent upsert)', async () => {
    const payload = 'url=https%3A%2F%2Fexample.com%2Fsame-url-test';
    const first = await app.inject({
      method: 'POST',
      url: '/urls',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/urls',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });
    expect(first.headers.location).toBe(second.headers.location);
  });
});
