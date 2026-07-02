// src/getTool.ts
/**
 * `bexio_get` — fetch a single record by id from an allow-listed Bexio resource.
 * READ-ONLY. The `resource` enum is guarded against the allow-list; anything
 * else returns a clear error rather than reaching an arbitrary endpoint.
 */
import type { NativeToolHandler, NativeToolSpec } from '@omadia/plugin-api';

import type { BexioClient } from './bexioClient.ts';
import type { BexioResponseCache } from './bexioResponseCache.ts';
import { isResourceKey, RESOURCES } from './resources.ts';
import { formatToolError } from './resourceTools.ts';

export const BEXIO_GET_PROMPT_DOC =
  '\n- `bexio_get`: fetch one Bexio record by id from an allow-listed resource (contact, kb_invoice, kb_offer, article, pr_project). READ-ONLY.\n';

interface GetInput { resource?: unknown; id?: unknown }

export function createBexioGetTool(
  client: BexioClient,
  cache: BexioResponseCache,
): { spec: NativeToolSpec; handler: NativeToolHandler } {
  const spec: NativeToolSpec = {
    name: 'bexio_get',
    description: 'Fetch a single Bexio record by id from an allow-listed resource. READ-ONLY.',
    input_schema: {
      type: 'object',
      properties: {
        resource: { type: 'string', enum: Object.keys(RESOURCES), description: 'One of: ' + Object.keys(RESOURCES).join(', ') },
        id: { type: ['string', 'number'], description: 'The record id.' },
      },
      required: ['resource', 'id'],
    },
  };

  const handler: NativeToolHandler = async (raw: unknown): Promise<string> => {
    const input = (raw ?? {}) as GetInput;
    if (!isResourceKey(input.resource)) {
      return `Error: unknown resource "${String(input.resource)}". Allowed: ${Object.keys(RESOURCES).join(', ')}.`;
    }
    const id = typeof input.id === 'number' || typeof input.id === 'string' ? input.id : '';
    if (id === '') return 'Error: "id" is required.';
    try {
      const record = await cache.getOrSet(`get:${input.resource}:${id}`, () => client.get(input.resource as any, id));
      return JSON.stringify({ resource: input.resource, record }, null, 2);
    } catch (err) {
      return formatToolError(err);
    }
  };

  return { spec, handler };
}
