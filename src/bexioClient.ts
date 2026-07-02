/**
 * BexioClient — a thin, READ-ONLY wrapper around the Bexio REST API.
 *
 * Auth is a Bexio Personal Access Token (PAT) used directly as a bearer token —
 * no token endpoint, no OAuth, no refresh. All egress goes through the injected
 * `fetch` (in the plugin: `ctx.http.fetch`, which enforces the manifest's
 * `network.outbound` allow-list + per-plugin rate limit). Bodies are size-capped
 * before JSON.parse so a huge list can't blow up host memory.
 */
import { RESOURCES, type ResourceKey } from './resources.ts';

export class BexioAuthError extends Error {}
export class BexioApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export class BexioRateLimitError extends Error {
  readonly retryAfterSeconds?: number;
  constructor(message: string, retryAfterSeconds?: number) { super(message); this.retryAfterSeconds = retryAfterSeconds; }
}

export type SearchCriterion = { field: string; value: unknown; criteria?: string };

export interface BexioClientOptions {
  readonly baseUrl?: string;
  readonly apiToken: string;
  readonly maxBytes?: number;
  readonly fetch: typeof fetch;
  readonly log?: (message: string) => void;
}

export interface ListOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: string;
}

const DEFAULT_BASE = 'https://api.bexio.com';
const DEFAULT_MAX_BYTES = 1024 * 1024;

export class BexioClient {
  readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly maxBytes: number;
  private readonly doFetch: typeof fetch;
  private readonly log: (m: string) => void;

  constructor(opts: BexioClientOptions) {
    if (!opts.apiToken) throw new Error('BexioClient: apiToken is required');
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    this.apiToken = opts.apiToken;
    this.maxBytes = opts.maxBytes && opts.maxBytes > 0 ? opts.maxBytes : DEFAULT_MAX_BYTES;
    this.doFetch = opts.fetch;
    this.log = opts.log ?? (() => {});
  }

  async list(resource: ResourceKey, options: ListOptions = {}): Promise<unknown[]> {
    const def = RESOURCES[resource];
    const qs = new URLSearchParams();
    qs.set('order_by', options.orderBy && options.orderBy.trim() ? options.orderBy.trim() : def.orderDefault);
    if (options.limit !== undefined) qs.set('limit', String(options.limit));
    if (options.offset !== undefined) qs.set('offset', String(options.offset));
    const json = await this.request('GET', `${def.path}?${qs.toString()}`);
    return Array.isArray(json) ? json : [json];
  }

  async search(resource: ResourceKey, criteria: SearchCriterion[], options: ListOptions = {}): Promise<unknown[]> {
    const def = RESOURCES[resource];
    const qs = new URLSearchParams();
    if (options.limit !== undefined) qs.set('limit', String(options.limit));
    if (options.offset !== undefined) qs.set('offset', String(options.offset));
    const body = criteria.map((c) => ({ field: c.field, value: c.value, criteria: c.criteria ?? 'like' }));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const json = await this.request('POST', `${def.path}/search${suffix}`, body);
    return Array.isArray(json) ? json : [json];
  }

  async get(resource: ResourceKey, id: string | number): Promise<unknown> {
    const def = RESOURCES[resource];
    return this.request('GET', `${def.path}/${encodeURIComponent(String(id))}`);
  }

  /** Connectivity probe — the PAT's access info. Analogue of Dynamics whoAmI. */
  async permissions(): Promise<unknown> {
    return this.request('GET', '3.0/permissions');
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}/${path}`;
    this.log(`[bexio] ${method} ${path}`);
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiToken}`,
      accept: 'application/json',
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const res = await this.doFetch(url, init);

    if (res.status === 401 || res.status === 403) {
      throw new BexioAuthError(
        `Bexio authentication failed (HTTP ${res.status}) — check the Personal Access Token (valid 6 months; re-issue/revoke at developer.bexio.com/pat).`,
      );
    }
    if (res.status === 429) {
      const reset = Number(res.headers.get('ratelimit-reset') ?? res.headers.get('RateLimit-Reset') ?? '');
      throw new BexioRateLimitError(
        `Bexio rate limit reached (HTTP 429)${Number.isFinite(reset) ? ` — retry in ${reset}s` : ''}.`,
        Number.isFinite(reset) ? reset : undefined,
      );
    }

    const text = await res.text();
    if (text.length > this.maxBytes) {
      throw new BexioApiError(`Bexio response exceeded ${this.maxBytes} bytes — narrow the query (limit/criteria).`, res.status);
    }
    let json: unknown = undefined;
    if (text) {
      try { json = JSON.parse(text); }
      catch { if (res.ok) throw new BexioApiError('Bexio returned a non-JSON body.', res.status); }
    }
    if (!res.ok) {
      const msg = extractMessage(json) ?? res.statusText ?? 'request failed';
      throw new BexioApiError(`Bexio API returned HTTP ${res.status}: ${msg}`, res.status);
    }
    return json ?? [];
  }
}

function extractMessage(json: unknown): string | undefined {
  if (json && typeof json === 'object') {
    const m = (json as Record<string, unknown>).message ?? (json as Record<string, unknown>).error;
    if (typeof m === 'string') return m;
  }
  return undefined;
}
