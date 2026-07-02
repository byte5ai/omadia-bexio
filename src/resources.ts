/**
 * The Bexio read allow-list. The plugin never touches an endpoint outside this
 * registry. Each resource maps to a versioned API path, the fields a free-text
 * `search` term is applied to (with `like`), and a sensible default order.
 */
export type ResourceKey = 'contact' | 'kb_invoice' | 'kb_offer' | 'kb_order' | 'article' | 'pr_project';

export interface ResourceDef {
  /** Versioned API path relative to base, e.g. `2.0/contact`. */
  readonly path: string;
  /** Human label used in tool descriptions and errors. */
  readonly label: string;
  /** Fields a free-text `search` term maps onto (Bexio `like` criteria). */
  readonly searchFields: readonly string[];
  /** Default `order_by` value. */
  readonly orderDefault: string;
}

export const RESOURCES: Record<ResourceKey, ResourceDef> = {
  contact:    { path: '2.0/contact',    label: 'contacts (companies + people)', searchFields: ['name_1', 'name_2', 'mail'], orderDefault: 'id_desc' },
  kb_invoice: { path: '2.0/kb_invoice', label: 'invoices',                        searchFields: ['title', 'document_nr'],       orderDefault: 'id_desc' },
  kb_offer:   { path: '2.0/kb_offer',   label: 'quotes (Offerten)',               searchFields: ['title', 'document_nr'],       orderDefault: 'id_desc' },
  kb_order:   { path: '2.0/kb_order',   label: 'orders',                          searchFields: ['title', 'document_nr'],       orderDefault: 'id_desc' },
  article:    { path: '2.0/article',    label: 'items (articles/products)',       searchFields: ['intern_name', 'intern_code'], orderDefault: 'id_desc' },
  pr_project: { path: '2.0/pr_project', label: 'projects',                        searchFields: ['name', 'nr'],                 orderDefault: 'id_desc' },
};

export function isResourceKey(x: unknown): x is ResourceKey {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(RESOURCES, x);
}
