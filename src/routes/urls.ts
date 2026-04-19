import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { core, CoreError, type ListParams } from '../clients/core.js';

const aliasParam = z.string().regex(/^[0-9A-Za-z]{10}$/);

const listQuery = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum([
      'createdAt',
      '-createdAt',
      'alias',
      '-alias',
      'count',
      '-count',
      'url',
      '-url',
    ])
    .default('-createdAt'),
  minCount: z.coerce.number().int().min(0).optional(),
  maxCount: z.coerce.number().int().min(0).optional(),
});

const urlBody = z.object({ url: z.string().trim().url() });

function isHtmx(req: FastifyRequest): boolean {
  return req.headers['hx-request'] === 'true';
}

function stringifyQuery(q: ListParams, override: Partial<ListParams> = {}) {
  const merged = { ...q, ...override };
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  }
  return s.toString();
}

export const urlsRoute: FastifyPluginAsync = async (app) => {
  // Full list page
  app.get('/urls', async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).view(
        '_error',
        {
          title: 'Invalid request',
          message: 'Invalid query parameters.',
        },
        { layout: 'layout.ejs' }
      );
    }
    try {
      const data = await core.listUrls(parsed.data);
      const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
      return reply.view(
        'urls/index',
        {
          title: 'URLs',
          query: parsed.data,
          items: data.items,
          total: data.total,
          page: data.page,
          pageSize: data.pageSize,
          totalPages,
          prevHref:
            data.page > 1
              ? stringifyQuery(parsed.data, { page: data.page - 1 })
              : null,
          nextHref:
            data.page < totalPages
              ? stringifyQuery(parsed.data, { page: data.page + 1 })
              : null,
        },
        { layout: 'layout.ejs' }
      );
    } catch (err) {
      req.log.error({ err: String(err) }, 'core list failed');
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

  // HTMX fragment for search / pagination
  app.get('/urls/partials/table', async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send('Invalid query');
    try {
      const data = await core.listUrls(parsed.data);
      const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
      return reply.view('urls/partials/_table', {
        query: parsed.data,
        items: data.items,
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages,
        prevHref:
          data.page > 1
            ? stringifyQuery(parsed.data, { page: data.page - 1 })
            : null,
        nextHref:
          data.page < totalPages
            ? stringifyQuery(parsed.data, { page: data.page + 1 })
            : null,
      });
    } catch (err) {
      req.log.error({ err: String(err) }, 'core list fragment failed');
      return reply.code(502).send('Core unavailable');
    }
  });

  app.get('/urls/new', async (_req, reply) =>
    reply.view(
      'urls/new',
      { title: 'New URL', error: null, value: '' },
      { layout: 'layout.ejs' }
    )
  );

  app.post('/urls', async (req, reply) => {
    const parsed = urlBody.safeParse(req.body);
    const submitted = (req.body as { url?: string } | undefined)?.url ?? '';
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      return reply.code(400).view(
        'urls/new',
        {
          title: 'New URL',
          error: fieldErrors.url?.[0] ?? 'Invalid URL',
          value: submitted,
        },
        { layout: 'layout.ejs' }
      );
    }
    try {
      const shortUrl = await core.createUrl(parsed.data.url);
      const alias = shortUrl.split('/').pop() ?? '';
      if (isHtmx(req)) {
        reply.header('HX-Redirect', `/urls/${alias}`);
        return reply.send('');
      }
      return reply.redirect(`/urls/${alias}`);
    } catch (err) {
      req.log.error({ err: String(err) }, 'core create failed');
      return reply.code(502).view(
        'urls/new',
        {
          title: 'New URL',
          error: 'Core rejected the request.',
          value: submitted,
        },
        { layout: 'layout.ejs' }
      );
    }
  });

  app.get<{ Params: { alias: string } }>('/urls/:alias', async (req, reply) => {
    const parsed = aliasParam.safeParse(req.params.alias);
    if (!parsed.success) return reply.callNotFound();
    try {
      const item = await core.getUrl(parsed.data);
      if (!item) return reply.callNotFound();
      return reply.view(
        'urls/detail',
        { title: item.alias, item },
        { layout: 'layout.ejs' }
      );
    } catch (err) {
      req.log.error({ err: String(err) }, 'core get failed');
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

  app.patch<{ Params: { alias: string } }>(
    '/urls/:alias',
    async (req, reply) => {
      const aliasR = aliasParam.safeParse(req.params.alias);
      if (!aliasR.success) return reply.code(404).send('Not found');
      const bodyR = urlBody.safeParse(req.body);
      const submitted = (req.body as { url?: string } | undefined)?.url ?? '';
      if (!bodyR.success) {
        const fieldErrors = bodyR.error.flatten().fieldErrors;
        return reply.code(400).view('urls/partials/_edit', {
          alias: aliasR.data,
          value: submitted,
          error: fieldErrors.url?.[0] ?? 'Invalid URL',
          savedAt: null,
        });
      }
      try {
        const item = await core.updateUrl(aliasR.data, bodyR.data);
        return reply.view('urls/partials/_edit', {
          alias: item.alias,
          value: item.url,
          error: null,
          savedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (err instanceof CoreError && err.status === 404) {
          return reply.code(404).send('Not found');
        }
        req.log.error({ err: String(err) }, 'core update failed');
        return reply.code(502).view('urls/partials/_edit', {
          alias: aliasR.data,
          value: submitted,
          error: 'Core rejected the request.',
          savedAt: null,
        });
      }
    }
  );

  app.delete<{ Params: { alias: string } }>(
    '/urls/:alias',
    async (req, reply) => {
      const aliasR = aliasParam.safeParse(req.params.alias);
      if (!aliasR.success) return reply.code(404).send('Not found');
      try {
        await core.deleteUrl(aliasR.data);
        if (isHtmx(req)) return reply.send('');
        return reply.redirect('/urls');
      } catch (err) {
        if (err instanceof CoreError && err.status === 404) {
          return reply.code(404).send('Not found');
        }
        req.log.error({ err: String(err) }, 'core delete failed');
        return reply.code(502).send('Core unavailable');
      }
    }
  );

  app.post<{ Params: { alias: string } }>(
    '/urls/:alias/qr/regenerate',
    async (req, reply) => {
      const aliasR = aliasParam.safeParse(req.params.alias);
      if (!aliasR.success) return reply.code(404).send('Not found');
      try {
        const { qrCode } = await core.regenerateQr(aliasR.data);
        return reply.view('urls/partials/_qr', { qrCode });
      } catch (err) {
        if (err instanceof CoreError && err.status === 404) {
          return reply.code(404).send('Not found');
        }
        req.log.error({ err: String(err) }, 'core regen qr failed');
        return reply.code(502).send('Core unavailable');
      }
    }
  );
};
