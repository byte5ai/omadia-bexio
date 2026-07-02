// src/resourceTools.ts
/**
 * Factory for the five per-resource READ tools (bexio_contacts, bexio_invoices,
 * bexio_quotes, bexio_items, bexio_projects). Each tool: optional free-text
 * `search` (mapped to a `like` criterion on the resource's primary search field),
 * OR explicit `criteria` (raw Bexio search array), OR a plain paginated list.
 * All reads go through the short-TTL cache. READ-ONLY.
 */
import type { NativeToolHandler, NativeToolSpec } from '@omadia/plugin-api';

import type { BexioClient, SearchCriterion } from './bexioClient.ts';
import { BexioApiError, BexioAuthError, BexioRateLimitError } from './bexioClient.ts';
import type { BexioResponseCache } from './bexioResponseCache.ts';
import { RESOURCES, type ResourceKey } from './resources.ts';

const MAX_TOP = 100;
const DEFAULT_TOP = 10;

export const RESOURCE_TOOLS: Array<{ key: ResourceKey; name: string; description: string; promptDoc: string }> = [
  { key: 'contact',    name: 'bexio_contacts', description: 'Read contacts (companies + people) from Bexio. READ-ONLY.', promptDoc: '\n- `bexio_contacts`: read Bexio contacts (companies + people). Free-text `search` matches name/e-mail; or pass raw `criteria`; or list with `limit`/`offset`/`order_by`. READ-ONLY.\n' },
  { key: 'kb_invoice', name: 'bexio_invoices', description: 'Read invoices from Bexio. READ-ONLY.',                        promptDoc: '\n- `bexio_invoices`: read Bexio invoices (kb_invoice). Free-text `search` matches title/document number; or raw `criteria`; or list. READ-ONLY.\n' },
  { key: 'kb_offer',   name: 'bexio_quotes',   description: 'Read quotes (Offerten) from Bexio. READ-ONLY.',              promptDoc: '\n- `bexio_quotes`: read Bexio quotes/Offerten (kb_offer). Free-text `search` matches title/document number; or raw `criteria`; or list. READ-ONLY.\n' },
  { key: 'kb_order',   name: 'bexio_orders',   description: 'Read orders from Bexio. READ-ONLY.',                        promptDoc: '\n- `bexio_orders`: read Bexio orders (kb_order). Free-text `search` matches title/document number; or raw `criteria`; or list. READ-ONLY.\n' },
  { key: 'article',    name: 'bexio_items',    description: 'Read items/articles (products) from Bexio. READ-ONLY.',     promptDoc: '\n- `bexio_items`: read Bexio items/articles (products). Free-text `search` matches internal name/code; or raw `criteria`; or list. READ-ONLY.\n' },
  { key: 'pr_project', name: 'bexio_projects', description: 'Read projects from Bexio. READ-ONLY.',                       promptDoc: '\n- `bexio_projects`: read Bexio projects (pr_project). Free-text `search` matches name/number; or raw `criteria`; or list. READ-ONLY.\n' },
];

interface ToolInput {
  search?: unknown;
  criteria?: unknown;
  limit?: unknown;
  offset?: unknown;
  order_by?: unknown;
}

export function makeResourceTool(
  key: ResourceKey,
  meta: { name: string; description: string; promptDoc: string },
  client: BexioClient,
  cache: BexioResponseCache,
): { spec: NativeToolSpec; handler: NativeToolHandler; promptDoc: string } {
  const def = RESOURCES[key];
  const spec: NativeToolSpec = {
    name: meta.name,
    description: meta.description,
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: `Free-text term matched (Bexio "like") against ${def.searchFields.join(', ')}.` },
        criteria: {
          type: 'array',
          description: 'Advanced: raw Bexio search criteria. Each item {field, value, criteria?}. criteria one of =, !=, >, <, >=, <=, like (default), not_like, is_null, not_null, in, not_in.',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              value: {},
              criteria: { type: 'string' },
            },
            required: ['field', 'value'],
          },
        },
        limit: { type: 'number', description: `Max rows (1–${MAX_TOP}, default ${DEFAULT_TOP}).` },
        offset: { type: 'number', description: 'Pagination offset (default 0).' },
        order_by: { type: 'string', description: `Bexio order_by (default ${def.orderDefault}); append _asc/_desc.` },
      },
      required: [],
    },
  };

  const handler: NativeToolHandler = async (raw: unknown): Promise<string> => {
    const input = (raw ?? {}) as ToolInput;
    const limit = clampTop(input.limit);
    const offset = toPositiveInt(input.offset, 0);
    const orderBy = typeof input.order_by === 'string' ? input.order_by : undefined;
    const searchTerm = typeof input.search === 'string' ? input.search.trim() : '';
    const rawCriteria = Array.isArray(input.criteria) ? (input.criteria as SearchCriterion[]) : undefined;

    let op: string;
    let cacheKey: string;
    let run: () => Promise<unknown[]>;
    if (rawCriteria && rawCriteria.length > 0) {
      op = 'search'; cacheKey = `${key}:search:${JSON.stringify(rawCriteria)}:${limit}:${offset}`;
      run = () => client.search(key, rawCriteria, { limit, offset });
    } else if (searchTerm) {
      const criteria: SearchCriterion[] = [{ field: def.searchFields[0], value: searchTerm, criteria: 'like' }];
      op = 'search'; cacheKey = `${key}:term:${searchTerm}:${limit}:${offset}`;
      run = () => client.search(key, criteria, { limit, offset });
    } else {
      op = 'list'; cacheKey = `${key}:list:${orderBy ?? def.orderDefault}:${limit}:${offset}`;
      run = () => client.list(key, { limit, offset, orderBy });
    }

    try {
      const rows = await cache.getOrSet(cacheKey, run);
      const capped = rows.slice(0, limit);
      if (capped.length === 0) return `No ${def.label} matched the ${op}.`;
      return JSON.stringify({ resource: key, op, count: capped.length, records: capped, truncated: rows.length > capped.length }, null, 2);
    } catch (err) {
      return formatToolError(err);
    }
  };

  return { spec, handler, promptDoc: meta.promptDoc };
}

export function formatToolError(err: unknown): string {
  if (err instanceof BexioAuthError) return `Error: ${err.message}`;
  if (err instanceof BexioRateLimitError) return `Error: ${err.message}`;
  if (err instanceof BexioApiError) return `Error: ${err.message}`;
  return `Error: ${err instanceof Error ? err.message : String(err)}`;
}

function clampTop(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TOP;
  return Math.min(Math.floor(n), MAX_TOP);
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
