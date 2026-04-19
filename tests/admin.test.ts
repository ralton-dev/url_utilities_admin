import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp } from './helpers.js';

async function seedUrl(destination: string): Promise<string> {
  const res = await fetch(`${process.env.CORE_URL}/api/url`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.CORE_API_KEY!,
    },
    body: JSON.stringify({ url: destination }),
  });
  const body = (await res.json()) as { success: boolean; url: string };
  if (!body.success) throw new Error('seed failed');
  const alias = body.url.split('/').pop();
  if (!alias) throw new Error('no alias returned from seed');
  return alias;
}

describe('Admin routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('renders the list page with a seeded URL', async () => {
    await seedUrl('https://example.com/admin-list-test');
    const res = await app.inject({ method: 'GET', url: '/urls' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('admin-list-test');
  });

  it('renders the HTMX table fragment without layout chrome', async () => {
    await seedUrl('https://example.com/admin-frag-test');
    const res = await app.inject({
      method: 'GET',
      url: '/urls/partials/table',
      headers: { 'hx-request': 'true' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('admin-frag-test');
    expect(res.body).not.toContain('<html');
  });

  it('renders the detail page for a seeded alias', async () => {
    const alias = await seedUrl('https://example.com/admin-detail-test');
    const res = await app.inject({ method: 'GET', url: `/urls/${alias}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('admin-detail-test');
  });

  it('404s on an unknown alias', async () => {
    const res = await app.inject({ method: 'GET', url: '/urls/ZZZZZZZZZZ' });
    expect(res.statusCode).toBe(404);
  });

  it('404s on a malformed alias without hitting the core', async () => {
    const res = await app.inject({ method: 'GET', url: '/urls/short' });
    expect(res.statusCode).toBe(404);
  });

  it('deletes via HTMX and returns an empty 200', async () => {
    const alias = await seedUrl('https://example.com/admin-delete-test');
    const res = await app.inject({
      method: 'DELETE',
      url: `/urls/${alias}`,
      headers: { 'hx-request': 'true' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('');

    const after = await app.inject({ method: 'GET', url: `/urls/${alias}` });
    expect(after.statusCode).toBe(404);
  });

  it('patches the destination URL', async () => {
    const alias = await seedUrl('https://example.com/admin-patch-before');
    const res = await app.inject({
      method: 'PATCH',
      url: `/urls/${alias}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'url=https%3A%2F%2Fexample.com%2Fadmin-patch-after',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('admin-patch-after');
  });

  it('regenerates the QR code and returns an <img> fragment', async () => {
    const alias = await seedUrl('https://example.com/admin-qr-test');
    const res = await app.inject({
      method: 'POST',
      url: `/urls/${alias}/qr/regenerate`,
      headers: { 'hx-request': 'true' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('data:image/');
  });
});
