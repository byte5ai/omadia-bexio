// src/plugin.ts
/**
 * @omadia/integration-bexio — plugin entry point. `kind: integration`.
 *
 * activate():
 *   1. reads the Bexio PAT (vault secret) + optional base URL / caps (config),
 *   2. builds a BexioClient bound to the host's allow-listed ctx.http egress,
 *   3. publishes services: `bexio.client` → BexioClient, `bexio.cache` → cache,
 *   4. registers the five per-resource read tools + `bexio_get`. READ-ONLY.
 *   5. runs a non-blocking connectivity probe (GET /3.0/permissions).
 */
import type { PluginContext } from '@omadia/plugin-api';

import { BexioClient } from './bexioClient.ts';
import { BexioResponseCache } from './bexioResponseCache.ts';
import { makeResourceTool, RESOURCE_TOOLS } from './resourceTools.ts';
import { createBexioGetTool, BEXIO_GET_PROMPT_DOC } from './getTool.ts';

export const BEXIO_CLIENT_SERVICE_NAME = 'bexio.client';
export const BEXIO_CACHE_SERVICE_NAME = 'bexio.cache';

export interface BexioPluginHandle { close(): Promise<void> }

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function activate(ctx: PluginContext): Promise<BexioPluginHandle> {
  ctx.log('activating bexio integration');

  if (!ctx.http) {
    throw new Error(
      '@omadia/integration-bexio: ctx.http is unavailable — the manifest must declare permissions.network.outbound (api.bexio.com)',
    );
  }
  const httpFetch = ctx.http.fetch.bind(ctx.http) as typeof fetch;

  const apiToken = await ctx.secrets.require('bexio_api_token');
  const baseUrl = ctx.config.get<string>('bexio_base_url') || 'https://api.bexio.com';
  const maxBytes = parsePositiveInt(ctx.config.get<string>('bexio_max_bytes'), 1024 * 1024);
  const cacheTtlSeconds = parsePositiveInt(ctx.config.get<string>('bexio_cache_ttl_seconds'), 60);

  const client = new BexioClient({ baseUrl, apiToken, maxBytes, fetch: httpFetch, log: (m) => ctx.log(m) });
  const cache = new BexioResponseCache({ ttlMs: cacheTtlSeconds * 1000 });

  const disposers: Array<() => void> = [];
  disposers.push(ctx.services.provide<BexioClient>(BEXIO_CLIENT_SERVICE_NAME, client));
  disposers.push(ctx.services.provide<BexioResponseCache>(BEXIO_CACHE_SERVICE_NAME, cache));

  for (const t of RESOURCE_TOOLS) {
    const { spec, handler, promptDoc } = makeResourceTool(t.key, { name: t.name, description: t.description, promptDoc: t.promptDoc }, client, cache);
    disposers.push(ctx.tools.register(spec, handler, { promptDoc }));
  }
  const getTool = createBexioGetTool(client, cache);
  disposers.push(ctx.tools.register(getTool.spec, getTool.handler, { promptDoc: BEXIO_GET_PROMPT_DOC }));

  ctx.log(
    `[bexio] ready (apiBase=${client.baseUrl}) — services '${BEXIO_CLIENT_SERVICE_NAME}' + '${BEXIO_CACHE_SERVICE_NAME}' published, tools ${RESOURCE_TOOLS.map((t) => `'${t.name}'`).join(' + ')} + 'bexio_get' contributed (read-only)`,
  );

  if (!ctx.smokeMode) {
    void client
      .permissions()
      .then(() => ctx.log('[bexio] connected (PAT valid)'))
      .catch((err: unknown) => ctx.log(`[bexio] WARNING: permissions probe failed — ${err instanceof Error ? err.message : String(err)}`));
  }

  return {
    async close(): Promise<void> {
      ctx.log('deactivating bexio integration');
      for (const dispose of disposers.reverse()) dispose();
      cache.clear();
    },
  };
}
