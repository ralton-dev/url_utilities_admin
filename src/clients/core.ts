import { env } from '../env.js';

export type UrlItem = {
  id: number;
  alias: string;
  url: string;
  count: number;
  createdAt: string;
};

export type UrlDetail = UrlItem & { qrCode: string | null };

export type Stats = {
  totalUrls: number;
  totalClicks: number;
  topUrls: UrlItem[];
};

export type ListResult = {
  items: UrlItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListParams = {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?:
    | 'createdAt'
    | '-createdAt'
    | 'alias'
    | '-alias'
    | 'count'
    | '-count'
    | 'url'
    | '-url';
  minCount?: number;
  maxCount?: number;
};

export class CoreError extends Error {
  constructor(
    public readonly status: number,
    public readonly errors: string[] | Record<string, string[]> = [],
    message = 'core error'
  ) {
    super(message);
    this.name = 'CoreError';
  }
}

const base = () => env.CORE_URL.replace(/\/$/, '');

function mergeHeaders(init: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    'x-api-key': env.CORE_API_KEY,
    accept: 'application/json',
  };
  if (init.body) headers['content-type'] = 'application/json';
  Object.assign(headers, init.headers ?? {});
  return headers;
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: mergeHeaders(init),
  });

  if (res.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new CoreError(res.status, [`Bad response (${res.status})`]);
  }

  const parsed = body as
    | { success: true; data: T }
    | { success: false; errors: string[] | Record<string, string[]> };

  if (parsed && typeof parsed === 'object' && 'success' in parsed) {
    if (parsed.success === false) {
      throw new CoreError(res.status, parsed.errors);
    }
    return parsed.data;
  }

  throw new CoreError(res.status, [`Unexpected response shape`]);
}

function qs(params: Record<string, unknown>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : '';
}

export const core = {
  listUrls: (params: ListParams): Promise<ListResult> =>
    json<ListResult>(`/api/admin/urls${qs(params)}`),

  async getUrl(alias: string): Promise<UrlDetail | null> {
    try {
      return await json<UrlDetail>(
        `/api/admin/urls/${encodeURIComponent(alias)}`
      );
    } catch (err) {
      if (err instanceof CoreError && err.status === 404) return null;
      throw err;
    }
  },

  updateUrl: (alias: string, body: { url: string }): Promise<UrlDetail> =>
    json<UrlDetail>(`/api/admin/urls/${encodeURIComponent(alias)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteUrl: async (alias: string): Promise<void> => {
    await json<void>(`/api/admin/urls/${encodeURIComponent(alias)}`, {
      method: 'DELETE',
    });
  },

  regenerateQr: (alias: string): Promise<{ qrCode: string }> =>
    json<{ qrCode: string }>(
      `/api/admin/urls/${encodeURIComponent(alias)}/qr/regenerate`,
      { method: 'POST' }
    ),

  stats: (): Promise<Stats> => json<Stats>('/api/admin/stats'),

  // Existing core endpoint; returns `{ success, url: '<APP_URL>/r/<alias>' }`
  async createUrl(url: string): Promise<string> {
    const res = await fetch(`${base()}/api/url`, {
      method: 'POST',
      headers: {
        'x-api-key': env.CORE_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    const body = (await res.json()) as
      | { success: true; url: string }
      | { success: false; errors: string[] | Record<string, string[]> };
    if (!body.success) {
      throw new CoreError(res.status, body.errors);
    }
    return body.url;
  },
};
