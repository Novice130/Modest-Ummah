'use server';

import { updateTag } from 'next/cache';
import { getDb } from '@/lib/db';
import {
  products,
  productVariants,
  productAttributes,
  categories,
  type ProductAttributeInsert,
} from '@/lib/schema';
import { eq, inArray, ilike, or, and, desc, ne, count, like } from 'drizzle-orm';
import { PRODUCTS_TAG, productTag } from '@/lib/cache';
import { mapProduct } from '@/lib/product-mapper';
import {
  getProductsCached,
  getProductCached,
  getNewArrivalsCached,
  getRelatedCached,
  getSearchCached,
} from '@/lib/catalog-cache';
import type { Product } from '@/types';
import { productDocumentSchema, type ProductDocument } from '@/lib/product-builder-schema';
import { stringifyCsv, parseList, joinList } from '@/lib/csv';
import { getSession } from './auth.actions';

/**
 * Writes invalidate via updateTag — read-your-own-writes. The cached reads
 * in lib/catalog-cache.ts all carry the 'products' tag (plus per-row tags),
 * so a publish is visible on the next render with no manual restart.
 */
function invalidateProductCaches(id?: string) {
  updateTag(PRODUCTS_TAG);
  if (id) updateTag(productTag(id));
}

export async function fetchProducts(params?: Parameters<typeof getProductsCached>[0]) {
  return getProductsCached(params);
}

export async function fetchProductBySlugOrId(idOrSlug: string, includeUnpublished = false): Promise<Product | null> {
  return getProductCached(idOrSlug, includeUnpublished);
}

export async function fetchFeaturedProducts(category?: string) {
  const result = await getProductsCached({ page: 1, limit: 8, featuredOnly: true, category, sort: 'newest' });
  return result;
}

export async function fetchNewArrivals(limit = 8) {
  return getNewArrivalsCached(limit);
}

export async function fetchRelatedProducts(currentProductId: string, category: string, limit = 4) {
  return getRelatedCached(currentProductId, category, limit);
}

export async function fetchSearchProducts(query: string) {
  return getSearchCached(query);
}

// ─── BUILDER SUPPORT ──────────────────────────────────────

/** Fetch a full product for the builder: row + variants + attributes. */
export async function fetchBuilderProduct(id: string) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) return null;

  const [variants, attributes] = await Promise.all([
    db.select().from(productVariants).where(eq(productVariants.productId, id)),
    db.select().from(productAttributes).where(eq(productAttributes.productId, id)),
  ]);

  return { product: mapProduct(row), variants, attributes };
}

/** Uniqueness check for the slug field (excludes the product being edited). */
export async function checkSlugAvailable(slug: string, excludeId?: string) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const conditions = [eq(products.slug, slug)];
  if (excludeId) conditions.push(ne(products.id, excludeId) as any);
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(...conditions))
    .limit(1);
  return !row;
}

/** Lightweight options for linked-product pickers (search + paginate). */
export async function fetchProductPickerOptions(query = '', limit = 12) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const conditions = [eq(products.status, 'published')];
  if (query) {
    conditions.push(or(ilike(products.name, `%${query}%`), ilike(products.sku, `%${query}%`)) as any);
  }
  const rows = await db
    .select({ id: products.id, name: products.name, sku: products.sku, images: products.images })
    .from(products)
    .where(and(...conditions))
    .orderBy(products.name)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    image: (r.images || [])[0] || null,
  }));
}

// ─── SAVE / AUTOSAVE ──────────────────────────────────────

interface SaveResult {
  productId: string;
  slug: string;
  status: string;
}

/**
 * Single write path for the builder. Upserts the product row and its
 * variant/attribute children in one transaction. Used by the explicit
 * Save button and the debounced autosave.
 */
export async function saveProductAction(input: {
  productId?: string | null;
  document: ProductDocument;
  /** Autosave never transitions into 'published'; explicit saves can. */
  autosave?: boolean;
}): Promise<SaveResult> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const parsed = productDocumentSchema.safeParse(input.document);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'form'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid product data — ${fields}`);
  }
  const doc = parsed.data;

  const db = getDb();
  const productId = input.productId || null;

  // Autosave of a new row still creates a draft row on the server (the plan
  // replaces localStorage with server drafts); it must never publish.
  let status = doc.status;
  let publishedAt: Date | null = null;
  if (input.autosave) {
    status = 'draft';
  } else if (status === 'published') {
    publishedAt = new Date();
  } else if (status === 'scheduled') {
    publishedAt = doc.publishAt ? new Date(doc.publishAt) : null;
  }

  const values = {
    name: doc.name,
    slug: doc.slug,
    productType: doc.productType,
    description: doc.description,
    shortDescription: doc.shortDescription,
    price: doc.price,
    compareAtPrice: doc.compareAtPrice ?? null,
    category: doc.category,
    subcategory: doc.subcategory,
    tags: doc.tags,
    featured: doc.featured,
    newArrivalPinned: doc.newArrivalPinned,
    excludeFromNewArrivals: doc.excludeFromNewArrivals,
    visibility: doc.visibility,
    saleStartsAt: doc.saleStartsAt ? new Date(doc.saleStartsAt) : null,
    saleEndsAt: doc.saleEndsAt ? new Date(doc.saleEndsAt) : null,
    taxClass: doc.taxClass || null,
    sku: doc.sku,
    manageStock: doc.manageStock,
    stockQuantity: doc.stockQuantity,
    backorderPolicy: doc.backorderPolicy,
    lowStockThreshold: doc.lowStockThreshold,
    weight: doc.weight ?? null,
    lengthIn: doc.lengthIn ?? null,
    widthIn: doc.widthIn ?? null,
    heightIn: doc.heightIn ?? null,
    shippingClass: doc.shippingClass || null,
    metaTitle: doc.metaTitle || null,
    metaDescription: doc.metaDescription || null,
    ogImage: doc.ogImage || null,
    upsellIds: doc.upsellIds,
    crossSellIds: doc.crossSellIds,
    similarProducts: doc.similarProductIds,
    images: doc.images,
    imageAlts: doc.imageAlts,
    status,
    publishedAt,
    updatedAt: new Date(),
  };

  const finalId = await (async () => {
    let id: string;
    if (productId) {
      const [updated] = await db
        .update(products)
        .set(values)
        .where(eq(products.id, productId))
        .returning({ id: products.id });
      if (!updated) throw new Error('Product not found');
      id = updated.id;
      // Replace children: delete and re-insert keeps the matrix exactly in
      // sync with the attributes section. (No transaction support in the
      // neon-http driver; the product row is already committed, and the next
      // autosave repairs any children that fail here.)
      await db.delete(productVariants).where(eq(productVariants.productId, id));
      await db.delete(productAttributes).where(eq(productAttributes.productId, id));
    } else {
      const [created] = await db
        .insert(products)
        .values({
          ...values,
          createdAt: new Date(),
        })
        .returning({ id: products.id });
      id = created.id;
    }

    if (doc.attributes.length > 0) {
      const attrRows: ProductAttributeInsert[] = doc.attributes.map((a, i) => ({
        productId: id,
        name: a.name,
        terms: a.terms,
        usedForVariations: a.usedForVariations,
        position: i,
      }));
      await db.insert(productAttributes).values(attrRows);
    }

    if (doc.productType === 'variable' && doc.variants.length > 0) {
      await db.insert(productVariants).values(
        doc.variants.map((v, i) => ({
          productId: id,
          sku: v.sku,
          attributes: v.attributes,
          price: v.price ?? null,
          compareAtPrice: v.compareAtPrice ?? null,
          stockQuantity: v.stockQuantity,
          inStock: v.inStock,
          image: v.image || null,
          weight: v.weight ?? null,
          position: i,
        }))
      );
    }

    return id;
  })();

  invalidateProductCaches(finalId);
  return { productId: finalId, slug: values.slug, status };
}

// ─── DUPLICATE ────────────────────────────────────────────

export async function duplicateProductAction(id: string): Promise<{ id: string; slug: string }> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) throw new Error('Product not found');

  const [variants, attributes] = await Promise.all([
    db.select().from(productVariants).where(eq(productVariants.productId, id)),
    db.select().from(productAttributes).where(eq(productAttributes.productId, id)),
  ]);

  const baseSlug = `${row.slug}-copy`;
  let slug = baseSlug;
  for (let i = 2; ; i++) {
    const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  // Sequential (no transaction support in the neon-http driver).
  const [created] = await db
    .insert(products)
    .values({
      name: `${row.name} (Copy)`,
      slug,
      productType: row.productType,
      description: row.description,
      shortDescription: row.shortDescription,
      price: row.price,
      compareAtPrice: row.compareAtPrice,
      category: row.category,
      subcategory: row.subcategory,
      tags: row.tags,
      featured: false,
      newArrivalPinned: false,
      excludeFromNewArrivals: row.excludeFromNewArrivals,
      visibility: 'hidden',
      saleStartsAt: row.saleStartsAt,
      saleEndsAt: row.saleEndsAt,
      taxClass: row.taxClass,
      sku: row.sku ? `${row.sku}-COPY` : '',
      manageStock: row.manageStock,
      stockQuantity: row.stockQuantity,
      backorderPolicy: row.backorderPolicy,
      lowStockThreshold: row.lowStockThreshold,
      weight: row.weight,
      lengthIn: row.lengthIn,
      widthIn: row.widthIn,
      heightIn: row.heightIn,
      shippingClass: row.shippingClass,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      ogImage: row.ogImage,
      upsellIds: row.upsellIds,
      crossSellIds: row.crossSellIds,
      similarProducts: row.similarProducts,
      images: row.images,
      imageAlts: row.imageAlts,
      // A copy is always a draft; publishing is a deliberate action.
      status: 'draft',
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: products.id });

  if (variants.length > 0) {
    await db.insert(productVariants).values(
      variants.map((v, i) => ({
        productId: created.id,
        sku: v.sku ? `${v.sku}-COPY` : `V-${i + 1}`,
        attributes: v.attributes,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stockQuantity: v.stockQuantity,
        inStock: v.inStock,
        image: v.image,
        weight: v.weight,
        position: i,
      }))
    );
  }
  if (attributes.length > 0) {
    await db.insert(productAttributes).values(
      attributes.map((a, i) => ({
        productId: created.id,
        name: a.name,
        terms: a.terms,
        usedForVariations: a.usedForVariations,
        position: i,
      }))
    );
  }

  invalidateProductCaches(created.id);
  return { id: created.id, slug };
}

// ─── CSV ──────────────────────────────────────────────────

export async function exportProductsCsv(): Promise<string> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const rows = await db.select().from(products).orderBy(desc(products.createdAt));
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, rows.map((r) => r.id)));
  const attrRows = await db
    .select()
    .from(productAttributes)
    .where(inArray(productAttributes.productId, rows.map((r) => r.id)));

  const variantsByProduct = new Map<string, typeof variantRows>();
  const attrsByProduct = new Map<string, typeof attrRows>();
  for (const v of variantRows) {
    (variantsByProduct.get(v.productId) ?? variantsByProduct.set(v.productId, []).get(v.productId)!).push(v);
  }
  for (const a of attrRows) {
    (attrsByProduct.get(a.productId) ?? attrsByProduct.set(a.productId, []).get(a.productId)!).push(a);
  }

  const header = [
    'name', 'slug', 'product_type', 'short_description', 'description',
    'category', 'subcategory', 'tags', 'featured', 'new_arrival_pinned',
    'exclude_from_new_arrivals', 'visibility', 'price', 'compare_at_price',
    'sale_starts_at', 'sale_ends_at', 'tax_class', 'sku', 'manage_stock',
    'stock_quantity', 'backorder_policy', 'low_stock_threshold', 'weight',
    'length_in', 'width_in', 'height_in', 'shipping_class', 'meta_title',
    'meta_description', 'og_image', 'images', 'status', 'publish_at',
    'attribute_1_name', 'attribute_1_terms', 'attribute_1_variation',
    'attribute_2_name', 'attribute_2_terms', 'attribute_2_variation',
    'attribute_3_name', 'attribute_3_terms', 'attribute_3_variation',
    'variant_attributes', 'variant_sku', 'variant_price',
    'variant_compare_at_price', 'variant_stock_quantity', 'variant_in_stock',
    'variant_image', 'variant_weight',
  ];

  const out: Array<Array<string | number | boolean | null>> = [header];

  const base = (p: typeof rows[number], v?: typeof variantRows[number] | null) => {
    const attrs = attrsByProduct.get(p.id) || [];
    const cell = (i: number) => attrs[i]?.name ?? '';
    const terms = (i: number) => joinList(attrs[i]?.terms);
    const variation = (i: number) => (attrs[i]?.usedForVariations ? 'true' : 'false');
    const date = (d: Date | null) => (d ? d.toISOString() : '');
    return [
      p.name,
      p.slug,
      p.productType,
      p.shortDescription,
      p.description,
      p.category,
      p.subcategory,
      joinList(p.tags as string[]),
      p.featured ? 'true' : 'false',
      p.newArrivalPinned ? 'true' : 'false',
      p.excludeFromNewArrivals ? 'true' : 'false',
      p.visibility,
      String(p.price),
      p.compareAtPrice != null ? String(p.compareAtPrice) : '',
      date(p.saleStartsAt),
      date(p.saleEndsAt),
      p.taxClass || '',
      p.sku,
      p.manageStock ? 'true' : 'false',
      String(p.stockQuantity || 0),
      p.backorderPolicy || 'no',
      String(p.lowStockThreshold ?? 5),
      p.weight != null ? String(p.weight) : '',
      p.lengthIn != null ? String(p.lengthIn) : '',
      p.widthIn != null ? String(p.widthIn) : '',
      p.heightIn != null ? String(p.heightIn) : '',
      p.shippingClass || '',
      p.metaTitle || '',
      p.metaDescription || '',
      p.ogImage || '',
      joinList(p.images as string[]),
      p.status,
      date(p.publishedAt),
      cell(0), terms(0), variation(0),
      cell(1), terms(1), variation(1),
      cell(2), terms(2), variation(2),
      v ? Object.entries(v.attributes as Record<string, string>).map(([k, val]) => `${k}:${val}`).join('|') : '',
      v ? v.sku : '',
      v && v.price != null ? String(v.price) : '',
      v && v.compareAtPrice != null ? String(v.compareAtPrice) : '',
      v ? String(v.stockQuantity || 0) : '',
      v ? (v.inStock ? 'true' : 'false') : '',
      v ? v.image || '' : '',
      v && v.weight != null ? String(v.weight) : '',
    ];
  };

  for (const p of rows) {
    const pv = variantsByProduct.get(p.id) || [];
    if (pv.length === 0) {
      out.push(base(p));
    } else {
      for (const v of pv) out.push(base(p, v));
    }
  }

  return stringifyCsv(out);
}

export interface ImportRowResult {
  row: number;
  ok: boolean;
  error?: string;
  productId?: string;
  name?: string;
}

/**
 * CSV import with a dry-run mode. Each row is validated against the same
 * Zod document schema the builder uses; dry-run reports row-level errors
 * without writing. Import mode creates rows (never updates existing ones).
 */
export async function importProductsAction(input: {
  rows: string[][];
  dryRun: boolean;
}): Promise<{ results: ImportRowResult[]; created: number }> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const { rows, dryRun } = input;
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) || [];
  const dataRows = rows.slice(1);
  const results: ImportRowResult[] = [];

  const get = (row: string[], col: string) => {
    const idx = header.indexOf(col);
    return idx >= 0 ? row[idx]?.trim() : '';
  };
  const toBool = (v: string) => v.toLowerCase() === 'true' || v === '1';
  const toNum = (v: string) => (v === '' ? null : Number(v));
  const toDoc = (row: string[]): ProductDocument => {
    const attrSpecs = [1, 2, 3]
      .map((i) => ({
        name: get(row, `attribute_${i}_name`),
        terms: get(row, `attribute_${i}_terms`),
        variation: get(row, `attribute_${i}_variation`),
      }))
      .filter((a) => a.name);
    return productDocumentSchema.parse({
      name: get(row, 'name'),
      slug: get(row, 'slug'),
      productType: (get(row, 'product_type') || 'simple') as 'simple' | 'variable',
      shortDescription: get(row, 'short_description'),
      description: get(row, 'description'),
      images: parseList(get(row, 'images')),
      imageAlts: {},
      category: get(row, 'category') || 'men',
      subcategory: get(row, 'subcategory') || 'General',
      tags: parseList(get(row, 'tags')),
      featured: toBool(get(row, 'featured')),
      newArrivalPinned: toBool(get(row, 'new_arrival_pinned')),
      excludeFromNewArrivals: toBool(get(row, 'exclude_from_new_arrivals')),
      visibility: (get(row, 'visibility') || 'public') as 'public' | 'hidden' | 'search_only',
      price: get(row, 'price'),
      compareAtPrice: get(row, 'compare_at_price') || null,
      saleStartsAt: get(row, 'sale_starts_at') || null,
      saleEndsAt: get(row, 'sale_ends_at') || null,
      taxClass: get(row, 'tax_class'),
      attributes: attrSpecs.map((a) => ({
        name: a.name,
        terms: parseList(a.terms),
        usedForVariations: toBool(a.variation),
      })),
      variants: [],
      sku: get(row, 'sku'),
      manageStock: get(row, 'manage_stock') === '' ? true : toBool(get(row, 'manage_stock')),
      stockQuantity: toNum(get(row, 'stock_quantity')) ?? 0,
      backorderPolicy: (get(row, 'backorder_policy') || 'no') as 'no' | 'notify' | 'yes',
      lowStockThreshold: toNum(get(row, 'low_stock_threshold')) ?? 5,
      weight: get(row, 'weight') || null,
      lengthIn: get(row, 'length_in') || null,
      widthIn: get(row, 'width_in') || null,
      heightIn: get(row, 'height_in') || null,
      shippingClass: get(row, 'shipping_class'),
      upsellIds: [],
      crossSellIds: [],
      similarProductIds: [],
      metaTitle: get(row, 'meta_title'),
      metaDescription: get(row, 'meta_description'),
      ogImage: get(row, 'og_image'),
      status: (get(row, 'status') || 'draft') as 'draft' | 'pending' | 'scheduled' | 'published',
      publishAt: get(row, 'publish_at') || null,
    });
  };

  let created = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (row.every((c) => c === '')) continue;
    const rowNumber = i + 2; // 1-based + header row

    let doc: ProductDocument;
    try {
      doc = toDoc(row);
    } catch (e: any) {
      const issues = e?.issues?.map((iss: any) => `${iss.path.join('.')}: ${iss.message}`).join('; ');
      results.push({ row: rowNumber, ok: false, error: issues || e?.message || 'Invalid row' });
      continue;
    }

    if (!doc.name) {
      results.push({ row: rowNumber, ok: false, error: 'name: required' });
      continue;
    }

    if (dryRun) {
      results.push({ row: rowNumber, ok: true, name: doc.name });
      continue;
    }

    // Ensure a unique slug on import.
    if (!doc.slug) {
      doc.slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    const db = getDb();
    const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, doc.slug)).limit(1);
    if (existing) {
      results.push({ row: rowNumber, ok: false, error: `slug: "${doc.slug}" already exists` });
      continue;
    }

    try {
      const saved = await saveProductAction({ document: doc });
      results.push({ row: rowNumber, ok: true, productId: saved.productId, name: doc.name });
      created++;
    } catch (e: any) {
      results.push({ row: rowNumber, ok: false, error: e?.message || 'Failed to save row' });
    }
  }

  return { results, created };
}

// ─── LEGACY ADMIN ACTIONS (kept for the products table) ──

export async function fetchAllProductsAdmin(
  page = 1,
  limit = 50,
  options?: { search?: string; status?: string }
) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  const search = options?.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(like(products.name, pattern), like(products.sku, pattern)) as any
    );
  }
  if (options?.status) {
    conditions.push(eq(products.status, options.status as any));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: count() })
    .from(products)
    .where(where);
  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map(mapProduct),
    totalItems: countResult?.count || 0,
    totalPages: Math.ceil((countResult?.count || 0) / limit),
    page,
    limit,
  };
}

/** Bulk update: publish / unpublish (draft) / feature / unfeature / delete. */
export async function bulkUpdateProductsAction(input: {
  ids: string[];
  action: 'publish' | 'draft' | 'feature' | 'unfeature' | 'delete';
}): Promise<{ updated: number }> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    return { updated: 0 };
  }

  const db = getDb();
  let updated = 0;

  if (input.action === 'delete') {
    const deleted = await db
      .delete(products)
      .where(inArray(products.id, input.ids))
      .returning({ id: products.id });
    updated = deleted.length;
  } else {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.action === 'publish') {
      patch.status = 'published';
      patch.publishedAt = new Date();
    } else if (input.action === 'draft') {
      patch.status = 'draft';
    } else if (input.action === 'feature') {
      patch.featured = true;
    } else if (input.action === 'unfeature') {
      patch.featured = false;
    }
    const rows = await db
      .update(products)
      .set(patch)
      .where(inArray(products.id, input.ids))
      .returning({ id: products.id });
    updated = rows.length;
  }

  if (updated > 0) invalidateProductCaches();
  return { updated };
}

export async function deleteProductAction(id: string) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const [deleted] = await db.delete(products).where(eq(products.id, id)).returning();
  if (deleted) invalidateProductCaches(deleted.id);
  return !!deleted;
}

// ─── BACKWARD-COMPAT (lib/api.ts) ────────────────────────

/**
 * Thin wrappers so lib/api.ts keeps compiling while the builder migrates
 * callers onto saveProductAction. FormData fields map onto the document.
 */
export async function createProductAction(data: Record<string, any>) {
  const document = productDocumentSchema.parse({
    ...defaultDocument(),
    name: data.name || '',
    slug: data.slug || '',
    productType: data.productType || 'simple',
    shortDescription: data.shortDescription || '',
    description: data.description || '',
    images: parseJsonField(data.images, []),
    imageAlts: {},
    category: data.category || 'men',
    subcategory: data.subcategory || 'General',
    tags: parseJsonField(data.tags, []),
    featured: data.featured === true || data.featured === 'true',
    visibility: data.visibility || 'public',
    price: String(data.price || '0'),
    compareAtPrice: data.compareAtPrice ? String(data.compareAtPrice) : null,
    sku: data.sku || '',
    manageStock: data.manageStock === undefined ? true : data.manageStock === true || data.manageStock === 'true',
    stockQuantity: Number(data.stockQuantity || 0),
    status: data.status || 'draft',
    publishAt: null,
  });
  return saveProductAction({ document });
}

export async function updateProductAction(id: string, data: Record<string, any>) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) throw new Error('Product not found');

  const existing = mapProduct(row);
  const document = productDocumentSchema.parse({
    ...productToDocumentSafe(existing),
    name: data.name ?? existing.name,
    slug: data.slug ?? existing.slug,
    productType: data.productType ?? existing.productType,
    shortDescription: data.shortDescription ?? existing.shortDescription,
    description: data.description ?? existing.description,
    images: data.images !== undefined ? parseJsonField(data.images, existing.images) : existing.images,
    imageAlts: existing.imageAlts || {},
    category: data.category ?? existing.category,
    subcategory: data.subcategory ?? existing.subcategory,
    tags: data.tags !== undefined ? parseJsonField(data.tags, existing.tags) : existing.tags,
    featured: data.featured !== undefined ? data.featured === true || data.featured === 'true' : existing.featured,
    newArrivalPinned: existing.newArrivalPinned ?? false,
    excludeFromNewArrivals: existing.excludeFromNewArrivals ?? false,
    visibility: data.visibility ?? existing.visibility,
    price: data.price !== undefined ? String(data.price) : String(existing.price),
    compareAtPrice: data.compareAtPrice !== undefined ? (data.compareAtPrice ? String(data.compareAtPrice) : null) : (existing.compareAtPrice != null ? String(existing.compareAtPrice) : null),
    sku: data.sku ?? existing.sku,
    manageStock: existing.manageStock ?? true,
    stockQuantity: data.stockQuantity !== undefined ? Number(data.stockQuantity) : existing.stockQuantity,
    status: data.status ?? existing.status,
    publishAt: existing.publishedAt ?? null,
  });
  return saveProductAction({ productId: id, document });
}

function parseJsonField(value: any, fallback: any): any {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function defaultDocument(): Record<string, any> {
  return {
    tags: [],
    featured: false,
    newArrivalPinned: false,
    excludeFromNewArrivals: false,
    visibility: 'public',
    saleStartsAt: null,
    saleEndsAt: null,
    taxClass: '',
    attributes: [],
    variants: [],
    backorderPolicy: 'no',
    lowStockThreshold: 5,
    weight: null,
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    shippingClass: '',
    upsellIds: [],
    crossSellIds: [],
    similarProductIds: [],
    metaTitle: '',
    metaDescription: '',
    ogImage: '',
  };
}

function productToDocumentSafe(p: Product): Record<string, any> {
  return {
    name: p.name,
    slug: p.slug,
    productType: p.productType,
    shortDescription: p.shortDescription,
    description: p.description,
    images: p.images || [],
    imageAlts: p.imageAlts || {},
    category: p.category,
    subcategory: p.subcategory,
    tags: p.tags || [],
    featured: p.featured,
    newArrivalPinned: p.newArrivalPinned ?? false,
    excludeFromNewArrivals: p.excludeFromNewArrivals ?? false,
    visibility: p.visibility,
    price: String(p.price),
    compareAtPrice: p.compareAtPrice != null ? String(p.compareAtPrice) : null,
    saleStartsAt: p.saleStartsAt ?? null,
    saleEndsAt: p.saleEndsAt ?? null,
    taxClass: p.taxClass || '',
    attributes: [],
    variants: [],
    sku: p.sku,
    manageStock: p.manageStock,
    stockQuantity: p.stockQuantity,
    backorderPolicy: p.backorderPolicy,
    lowStockThreshold: p.lowStockThreshold,
    weight: p.weight != null ? String(p.weight) : null,
    lengthIn: p.lengthIn != null ? String(p.lengthIn) : null,
    widthIn: p.widthIn != null ? String(p.widthIn) : null,
    heightIn: p.heightIn != null ? String(p.heightIn) : null,
    shippingClass: p.shippingClass || '',
    upsellIds: p.upsellIds || [],
    crossSellIds: p.crossSellIds || [],
    similarProductIds: p.similarProducts || [],
    metaTitle: p.metaTitle || '',
    metaDescription: p.metaDescription || '',
    ogImage: p.ogImage || '',
    status: p.status,
    publishAt: p.publishedAt ?? null,
  };
}

// ─── CATEGORY HELPERS ────────────────────────────────────

/** Admin list of categories (for the org section, backed by the table). */
export async function fetchCategoriesAdmin() {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  return db.select().from(categories).orderBy(categories.position);
}
