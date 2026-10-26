'use server';

import { updateTag } from 'next/cache';
import { getDb } from '@/lib/db';
import {
  products,
  productVariants,
  productAttributes,
  productTags,
  categories,
  tags,
  type ProductAttributeInsert,
} from '@/lib/schema';
import { eq, inArray, ilike, or, and, asc, desc, ne, count, isNotNull, gt, lte, sql, type SQL } from 'drizzle-orm';
import { PRODUCTS_TAG, productTag } from '@/lib/cache';
import { buildCategoryRef, mapProduct } from '@/lib/product-mapper';
import {
  getProductsCached,
  getProductCached,
  getNewArrivalsCached,
  getRelatedCached,
  getSearchCached,
} from '@/lib/catalog-cache';
import type { Product, ProductStatus } from '@/types';
import {
  CSV_COLUMNS,
  deriveStorefrontOptions,
  flattenIssues,
  productDocumentSchema,
  slugifyProductName,
  type ProductDocument,
  type VariantRow,
} from '@/lib/product-builder-schema';
import { stringifyCsv, parseList, joinList } from '@/lib/csv';
import { resolveImageMeta, type ImageMetaEntry } from '@/lib/image-meta';
import { getSession } from './auth.actions';
import { setProductTags } from './tag.actions';

/**
 * Writes invalidate via updateTag — read-your-own-writes. The cached reads
 * in lib/catalog-cache.ts all carry the 'products' tag (plus per-row tags),
 * so a publish is visible on the next render with no manual restart.
 */
function invalidateProductCaches(id?: string) {
  updateTag(PRODUCTS_TAG);
  if (id) updateTag(productTag(id));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');
}

export async function fetchProducts(params?: Parameters<typeof getProductsCached>[0]) {
  // Public Server Action: the unpublished flag is honoured for admins only.
  if (params?.includeUnpublished && !(await getSession(true))) {
    params = { ...params, includeUnpublished: false };
  }
  return getProductsCached(params);
}

export async function fetchProductBySlugOrId(idOrSlug: string, includeUnpublished = false): Promise<Product | null> {
  // This is a public Server Action: drafts are admin-only.
  if (includeUnpublished) {
    const session = await getSession(true);
    if (!session) includeUnpublished = false;
  }
  return getProductCached(idOrSlug, includeUnpublished);
}

export async function fetchFeaturedProducts(category?: string) {
  const result = await getProductsCached({ page: 1, limit: 8, featuredOnly: true, category, sort: 'newest' });
  return result;
}

export async function fetchNewArrivals(limit = 8) {
  return getNewArrivalsCached(limit);
}

/**
 * "You may also like": the products picked in the builder's Related products
 * field come first (published ones only, in the order picked), then the
 * remaining slots fill from the same category. All reads are cached.
 */
export async function fetchRelatedProducts(
  currentProductId: string,
  categoryId: string | null,
  limit = 4
) {
  const current = await getProductCached(currentProductId);
  const picked: Product[] = [];
  for (const id of current?.similarProducts ?? []) {
    if (picked.length >= limit) break;
    if (id === currentProductId || !UUID_RE.test(id)) continue;
    const p = await getProductCached(id);
    if (p && !picked.some((x) => x.id === p.id)) picked.push(p);
  }
  if (picked.length >= limit) return picked;

  const fill = await getRelatedCached(currentProductId, categoryId, limit + picked.length);
  return [...picked, ...fill.filter((p) => !picked.some((x) => x.id === p.id))].slice(0, limit);
}

export async function fetchSearchProducts(query: string) {
  return getSearchCached(query);
}

// ─── BUILDER SUPPORT ──────────────────────────────────────

/** Fetch a full product for the builder: row + category + tags + variants + attributes. */
export async function fetchBuilderProduct(id: string) {
  await requireAdmin();
  if (!UUID_RE.test(id)) return null;

  const db = getDb();
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) return null;

  const [variants, attributes, categoryRows, tagRows] = await Promise.all([
    db.select().from(productVariants).where(eq(productVariants.productId, id)),
    db.select().from(productAttributes).where(eq(productAttributes.productId, id)),
    db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        parentId: categories.parentId,
      })
      .from(categories),
    db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(productTags)
      .innerJoin(tags, eq(productTags.tagId, tags.id))
      .where(eq(productTags.productId, id)),
  ]);

  // Without the category and tags the builder opened with an empty category
  // (failing validation) and an empty tag list that the next save wrote back.
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c]));
  const product = mapProduct(row, {
    category: buildCategoryRef(categoryMap, row.categoryId),
    tags: tagRows,
  });

  return { product, variants, attributes };
}

/** Uniqueness check for the slug field (excludes the product being edited). */
export async function checkSlugAvailable(slug: string, excludeId?: string) {
  await requireAdmin();
  if (!slug) return true;

  const db = getDb();
  const conditions: SQL[] = [eq(products.slug, slug)];
  if (excludeId && UUID_RE.test(excludeId)) conditions.push(ne(products.id, excludeId));
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(...conditions))
    .limit(1);
  return !row;
}

export interface PickerOption {
  id: string;
  name: string;
  sku: string;
  image: string | null;
  status: string;
}

/** Lightweight options for linked-product pickers (search). Published only. */
export async function fetchProductPickerOptions(query = '', limit = 12, excludeId?: string) {
  await requireAdmin();

  const db = getDb();
  const conditions: SQL[] = [eq(products.status, 'published')];
  if (excludeId && UUID_RE.test(excludeId)) conditions.push(ne(products.id, excludeId));
  const q = query.trim();
  if (q) {
    conditions.push(or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`))!);
  }
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      images: products.images,
      status: products.status,
    })
    .from(products)
    .where(and(...conditions))
    .orderBy(products.name)
    .limit(limit);

  return rows.map(toPickerOption);
}

/** Resolve already-linked ids to display rows, whatever their status. */
export async function fetchProductsByIds(ids: string[]): Promise<PickerOption[]> {
  await requireAdmin();
  const valid = [...new Set(ids)].filter((id) => UUID_RE.test(id));
  if (valid.length === 0) return [];

  const db = getDb();
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      images: products.images,
      status: products.status,
    })
    .from(products)
    .where(inArray(products.id, valid));
  const byId = new Map(rows.map((r) => [r.id, toPickerOption(r)]));
  return valid.map((id) => byId.get(id)).filter((r): r is PickerOption => Boolean(r));
}

function toPickerOption(r: {
  id: string;
  name: string;
  sku: string;
  images: string[] | null;
  status: string;
}): PickerOption {
  return { id: r.id, name: r.name, sku: r.sku, image: (r.images || [])[0] || null, status: r.status };
}

// ─── SAVE / AUTOSAVE ──────────────────────────────────────

export type SaveResult =
  | {
      ok: true;
      productId: string;
      slug: string;
      status: ProductStatus;
      /** Server ids for the saved variants, so later saves update in place. */
      variants: Array<{ id: string; attributes: Record<string, string> }>;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Finds a SKU in `skus` already used by a DIFFERENT product (its own SKU or
 * any of its variants). Variant SKUs are unique in the database; product
 * SKUs are not, but Pirate Ship and the order export key on them.
 */
async function findSkuConflict(
  skus: string[],
  productId: string | null
): Promise<{ sku: string; productName: string } | null> {
  const wanted = [...new Set(skus.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return null;
  const db = getDb();

  const productConditions: SQL[] = [inArray(sql`lower(${products.sku})`, wanted)];
  if (productId) productConditions.push(ne(products.id, productId));
  const [p] = await db
    .select({ sku: products.sku, name: products.name })
    .from(products)
    .where(and(...productConditions))
    .limit(1);
  if (p) return { sku: p.sku, productName: p.name };

  const variantConditions: SQL[] = [inArray(sql`lower(${productVariants.sku})`, wanted)];
  if (productId) variantConditions.push(ne(productVariants.productId, productId));
  const [v] = await db
    .select({ sku: productVariants.sku, name: products.name })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(...variantConditions))
    .limit(1);
  if (v) return { sku: v.sku, productName: v.name };

  return null;
}

/** In-stock rule shared by products and variants. */
function resolveInStock(manageStock: boolean, quantity: number, backorders: string, manual: boolean) {
  return manageStock ? quantity > 0 || backorders !== 'no' : manual;
}

/**
 * Single write path for the builder. Upserts the product row and its
 * variant/attribute children. Used by the explicit Save button, the
 * debounced draft autosave, and the CSV import.
 *
 * Expected failures (validation, slug/SKU conflicts) come back as values,
 * because production builds replace thrown Server Action messages with a
 * generic one.
 */
export async function saveProductAction(input: {
  productId?: string | null;
  document: ProductDocument;
  /** Autosave is only for drafts and never changes status. */
  autosave?: boolean;
}): Promise<SaveResult> {
  await requireAdmin();

  const parsed = productDocumentSchema.safeParse(input.document);
  if (!parsed.success) {
    return { ok: false, error: 'Some fields need attention.', fieldErrors: flattenIssues(parsed) };
  }
  const doc = parsed.data;

  const db = getDb();
  const productId = input.productId || null;
  if (productId && !UUID_RE.test(productId)) return { ok: false, error: 'Product not found.' };

  const [existing] = productId
    ? await db
        .select({
          status: products.status,
          publishedAt: products.publishedAt,
          imageMeta: products.imageMeta,
          colors: products.colors,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1)
    : [];
  if (productId && !existing) return { ok: false, error: 'This product no longer exists.' };

  // Autosave used to force status 'draft' on every write, so merely opening
  // a live product in the builder unpublished it 1.5s later.
  if (input.autosave && existing && existing.status !== 'draft') {
    return { ok: false, error: 'Autosave only applies to drafts. Use Save to update this product.' };
  }

  // ── Slug ──
  const slug = doc.slug || slugifyProductName(doc.name) || `product-${Date.now().toString(36)}`;
  const slugConditions: SQL[] = [eq(products.slug, slug)];
  if (productId) slugConditions.push(ne(products.id, productId));
  const [slugOwner] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(...slugConditions))
    .limit(1);
  if (slugOwner) {
    return {
      ok: false,
      error: `The URL slug "${slug}" is already used by another product.`,
      fieldErrors: { slug: ['Already used by another product — pick another'] },
    };
  }

  // ── SKUs ── checked BEFORE any child rows are touched: a unique-index
  // failure mid-save would otherwise leave the product without variants.
  const isVariable = doc.productType === 'variable';
  const conflict = await findSkuConflict(
    [doc.sku, ...(isVariable ? doc.variants.map((v) => v.sku) : [])],
    productId
  );
  if (conflict) {
    const onProduct = conflict.sku.toLowerCase() === doc.sku.trim().toLowerCase();
    const message = `SKU "${conflict.sku}" is already used by “${conflict.productName}”`;
    return {
      ok: false,
      error: message,
      fieldErrors: onProduct ? { sku: [message] } : { variants: [message] },
    };
  }

  // ── Status ──
  let status: ProductStatus = doc.status;
  let publishedAt: Date | null = null;
  if (input.autosave) {
    status = 'draft';
    publishedAt = existing?.publishedAt ?? null;
  } else if (status === 'published') {
    // Set at the transition INTO published, and kept on later edits — New
    // Arrivals orders by it, so re-saving must not bump a product to the top.
    publishedAt =
      existing?.status === 'published' && existing.publishedAt ? existing.publishedAt : new Date();
  } else if (status === 'scheduled') {
    publishedAt = doc.publishAt ? new Date(doc.publishAt) : null;
  }

  // ── Stock ── products.in_stock is what the storefront filters and renders
  // on; it was never written here, so restocking in the admin left a sold-out
  // product unbuyable.
  const variants: VariantRow[] = isVariable
    ? doc.variants.map((v) => ({
        ...v,
        sku: v.sku.trim(),
        inStock: resolveInStock(doc.manageStock, v.stockQuantity, doc.backorderPolicy, v.inStock),
      }))
    : [];
  const stockQuantity =
    isVariable && doc.manageStock
      ? variants.reduce((n, v) => n + v.stockQuantity, 0)
      : doc.stockQuantity;
  const inStock = isVariable
    ? variants.some((v) => v.inStock)
    : resolveInStock(doc.manageStock, doc.stockQuantity, doc.backorderPolicy, doc.inStock);

  // Size / Color options feed the storefront pickers.
  const { sizes, colors } = deriveStorefrontOptions(
    doc,
    (existing?.colors || []) as Array<{ name: string; value: string; image?: string }>
  );

  // Intrinsic size + LQIP for anything uploaded through the admin. Only URLs
  // without an entry are read off disk, so the autosave does not re-encode
  // the gallery on every keystroke.
  const imageMeta = await resolveImageMeta(
    [...doc.images, ...variants.map((v) => v.image)],
    (existing?.imageMeta || {}) as Record<string, ImageMetaEntry>
  );

  const values = {
    name: doc.name,
    slug,
    productType: doc.productType,
    description: doc.description,
    shortDescription: doc.shortDescription,
    price: doc.price,
    compareAtPrice: doc.compareAtPrice || null,
    categoryId: doc.categoryId || null,
    featured: doc.featured,
    newArrivalPinned: doc.newArrivalPinned,
    excludeFromNewArrivals: doc.excludeFromNewArrivals,
    visibility: doc.visibility,
    // A sale window only means something alongside a compare-at price.
    saleStartsAt: doc.compareAtPrice && doc.saleStartsAt ? new Date(doc.saleStartsAt) : null,
    saleEndsAt: doc.compareAtPrice && doc.saleEndsAt ? new Date(doc.saleEndsAt) : null,
    taxClass: doc.taxClass || null,
    sku: doc.sku,
    manageStock: doc.manageStock,
    stockQuantity,
    inStock,
    backorderPolicy: doc.backorderPolicy,
    lowStockThreshold: doc.lowStockThreshold,
    weight: doc.weight || null,
    lengthIn: doc.lengthIn || null,
    widthIn: doc.widthIn || null,
    heightIn: doc.heightIn || null,
    shippingClass: doc.shippingClass || null,
    metaTitle: doc.metaTitle || null,
    metaDescription: doc.metaDescription || null,
    ogImage: doc.ogImage || null,
    upsellIds: doc.upsellIds,
    crossSellIds: doc.crossSellIds,
    similarProducts: doc.similarProductIds.filter((id) => id !== productId),
    images: doc.images,
    imageAlts: Object.fromEntries(
      Object.entries(doc.imageAlts).filter(([url, alt]) => doc.images.includes(url) && alt.trim())
    ),
    imageMeta,
    sizes,
    colors,
    status,
    publishedAt,
    updatedAt: new Date(),
  };

  try {
    let id: string;
    if (productId) {
      const [updated] = await db
        .update(products)
        .set(values)
        .where(eq(products.id, productId))
        .returning({ id: products.id });
      if (!updated) return { ok: false, error: 'This product no longer exists.' };
      id = updated.id;
    } else {
      const [created] = await db
        .insert(products)
        .values({ ...values, createdAt: new Date() })
        .returning({ id: products.id });
      id = created.id;
    }

    // Children. No transaction support in the neon-http driver: the product
    // row is committed first, and the next save repairs any child that fails.
    await setProductTags(id, doc.tagIds);

    await db.delete(productAttributes).where(eq(productAttributes.productId, id));
    if (doc.attributes.length > 0) {
      const attrRows: ProductAttributeInsert[] = doc.attributes.map((a, i) => ({
        productId: id,
        name: a.name.trim(),
        terms: a.terms,
        usedForVariations: isVariable && a.usedForVariations,
        position: i,
      }));
      await db.insert(productAttributes).values(attrRows);
    }

    // Variants are updated in place by id rather than deleted and
    // re-inserted: a cart or order line refers to the variant id, and
    // replacing every row on each save broke those references.
    const existingVariantIds = productId
      ? (
          await db
            .select({ id: productVariants.id })
            .from(productVariants)
            .where(eq(productVariants.productId, id))
        ).map((r) => r.id)
      : [];
    const existingSet = new Set(existingVariantIds);
    const kept = new Set(variants.filter((v) => v.id && existingSet.has(v.id)).map((v) => v.id!));
    const removed = existingVariantIds.filter((vid) => !kept.has(vid));
    if (removed.length > 0) {
      await db.delete(productVariants).where(inArray(productVariants.id, removed));
    }

    const savedVariants: Array<{ id: string; attributes: Record<string, string> }> = [];
    for (const [i, v] of variants.entries()) {
      const row = {
        productId: id,
        sku: v.sku,
        attributes: v.attributes,
        price: v.price || null,
        compareAtPrice: v.compareAtPrice || null,
        stockQuantity: v.stockQuantity,
        inStock: v.inStock,
        image: v.image || null,
        weight: v.weight || null,
        position: i,
      };
      if (v.id && kept.has(v.id)) {
        await db.update(productVariants).set(row).where(eq(productVariants.id, v.id));
        savedVariants.push({ id: v.id, attributes: v.attributes });
      } else {
        const [created] = await db
          .insert(productVariants)
          .values(row)
          .returning({ id: productVariants.id });
        savedVariants.push({ id: created.id, attributes: v.attributes });
      }
    }

    invalidateProductCaches(id);
    return { ok: true, productId: id, slug, status, variants: savedVariants };
  } catch (error: any) {
    console.error('saveProductAction failed', error);
    if (error?.code === '23505' || /duplicate key/i.test(String(error?.message))) {
      return { ok: false, error: 'Another product already uses this slug or one of these SKUs.' };
    }
    return { ok: false, error: 'Could not save the product. Please try again.' };
  }
}

// ─── DUPLICATE ────────────────────────────────────────────

export async function duplicateProductAction(id: string): Promise<{ id: string; slug: string }> {
  await requireAdmin();

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
  // "-COPY", "-COPY-2", … — tracks the slug so a second copy does not reuse
  // the first copy's variant SKUs (variant SKUs are unique).
  const skuSuffix = slug.slice(row.slug.length).toUpperCase();

  // Every column carries over except identity, timestamps and the fields a
  // copy must not inherit. Spreading the row means a new column is copied
  // by default instead of silently dropped.
  const { id: _id, wooProductId: _woo, createdAt: _c, updatedAt: _u, ...rest } = row;

  // Sequential (no transaction support in the neon-http driver).
  const [created] = await db
    .insert(products)
    .values({
      ...rest,
      name: `${row.name} (Copy)`,
      slug,
      sku: row.sku ? `${row.sku}${skuSuffix}` : '',
      featured: false,
      newArrivalPinned: false,
      // A copy is always a draft; publishing is a deliberate action.
      status: 'draft',
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: products.id });

  // Carry the tag set across; the copy is otherwise identical.
  const sourceTags = await db
    .select({ tagId: productTags.tagId })
    .from(productTags)
    .where(eq(productTags.productId, id));
  if (sourceTags.length > 0) {
    await db
      .insert(productTags)
      .values(sourceTags.map((t) => ({ productId: created.id, tagId: t.tagId })))
      .onConflictDoNothing();
  }

  if (variants.length > 0) {
    await db.insert(productVariants).values(
      [...variants]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((v, i) => ({
          productId: created.id,
          sku: v.sku ? `${v.sku}${skuSuffix}` : `${slug.toUpperCase()}-${i + 1}`,
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
      [...attributes]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((a, i) => ({
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
  await requireAdmin();

  const db = getDb();
  const rows = await db.select().from(products).orderBy(desc(products.createdAt));
  const ids = rows.map((r) => r.id);
  const [variantRows, attrRows, categoryRows, tagJoinRows] = ids.length
    ? await Promise.all([
        db.select().from(productVariants).where(inArray(productVariants.productId, ids)),
        db.select().from(productAttributes).where(inArray(productAttributes.productId, ids)),
        // The CSV carries slugs, not uuids — it has to stay hand-editable, and
        // a uuid means nothing to whoever opens it in a spreadsheet.
        db.select({ id: categories.id, slug: categories.slug }).from(categories),
        db
          .select({ productId: productTags.productId, slug: tags.slug })
          .from(productTags)
          .innerJoin(tags, eq(productTags.tagId, tags.id))
          .where(inArray(productTags.productId, ids)),
      ])
    : [[], [], [], []];

  const categorySlug = new Map(categoryRows.map((c) => [c.id, c.slug]));
  const group = <T extends { productId: string }>(list: T[]) => {
    const out = new Map<string, T[]>();
    for (const item of list) {
      const bucket = out.get(item.productId) ?? [];
      bucket.push(item);
      out.set(item.productId, bucket);
    }
    return out;
  };
  const tagSlugsByProduct = group(tagJoinRows);
  const variantsByProduct = group(variantRows);
  const attrsByProduct = group(attrRows);
  const byPosition = (a: { position: number | null }, b: { position: number | null }) =>
    (a.position ?? 0) - (b.position ?? 0);

  const date = (d: Date | null) => (d ? d.toISOString() : '');
  const num = (v: unknown) => (v != null && v !== '' ? String(v) : '');
  const bool = (v: unknown) => (v ? 'true' : 'false');

  const line = (p: (typeof rows)[number], v?: (typeof variantRows)[number]) => {
    const attrs = (attrsByProduct.get(p.id) || []).sort(byPosition);
    const cells: Partial<Record<(typeof CSV_COLUMNS)[number], string>> = {
      name: p.name,
      slug: p.slug,
      product_type: p.productType,
      short_description: p.shortDescription,
      description: p.description,
      category: p.categoryId ? categorySlug.get(p.categoryId) ?? '' : '',
      tags: joinList((tagSlugsByProduct.get(p.id) ?? []).map((t) => t.slug)),
      featured: bool(p.featured),
      new_arrival_pinned: bool(p.newArrivalPinned),
      exclude_from_new_arrivals: bool(p.excludeFromNewArrivals),
      visibility: p.visibility,
      price: num(p.price),
      compare_at_price: num(p.compareAtPrice),
      sale_starts_at: date(p.saleStartsAt),
      sale_ends_at: date(p.saleEndsAt),
      tax_class: p.taxClass || '',
      sku: p.sku,
      manage_stock: bool(p.manageStock),
      stock_quantity: String(p.stockQuantity || 0),
      in_stock: bool(p.inStock),
      backorder_policy: p.backorderPolicy || 'no',
      low_stock_threshold: String(p.lowStockThreshold ?? 5),
      weight_oz: num(p.weight),
      length_in: num(p.lengthIn),
      width_in: num(p.widthIn),
      height_in: num(p.heightIn),
      shipping_class: p.shippingClass || '',
      meta_title: p.metaTitle || '',
      meta_description: p.metaDescription || '',
      og_image: p.ogImage || '',
      images: joinList(p.images as string[]),
      status: p.status,
      publish_at: date(p.publishedAt),
    };
    attrs.slice(0, 3).forEach((a, i) => {
      const n = (i + 1) as 1 | 2 | 3;
      cells[`attribute_${n}_name`] = a.name;
      cells[`attribute_${n}_terms`] = joinList(a.terms as string[]);
      cells[`attribute_${n}_variation`] = bool(a.usedForVariations);
    });
    if (v) {
      cells.variant_attributes = Object.entries(v.attributes as Record<string, string>)
        .map(([k, val]) => `${k}:${val}`)
        .join('|');
      cells.variant_sku = v.sku;
      cells.variant_price = num(v.price);
      cells.variant_compare_at_price = num(v.compareAtPrice);
      cells.variant_stock_quantity = String(v.stockQuantity || 0);
      cells.variant_in_stock = bool(v.inStock);
      cells.variant_image = v.image || '';
      cells.variant_weight_oz = num(v.weight);
    }
    return CSV_COLUMNS.map((c) => cells[c] ?? '');
  };

  const out: string[][] = [[...CSV_COLUMNS]];
  for (const p of rows) {
    const pv = (variantsByProduct.get(p.id) || []).sort(byPosition);
    if (pv.length === 0) out.push(line(p));
    else for (const v of pv) out.push(line(p, v));
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
 * CSV import with a dry-run mode. Rows are grouped into products — a
 * variable product is one row per variant sharing a slug — and each product
 * is validated against the same Zod document schema the builder uses, plus
 * the slug/SKU uniqueness checks. Import mode creates products (never
 * updates existing ones).
 */
export async function importProductsAction(input: {
  rows: string[][];
  dryRun: boolean;
}): Promise<{ results: ImportRowResult[]; created: number }> {
  await requireAdmin();

  const { rows, dryRun } = input;
  const header = rows[0]?.map((h) => h.replace(/^﻿/, '').trim().toLowerCase()) || [];
  const dataRows = rows.slice(1);
  const results: ImportRowResult[] = [];

  // Taxonomy is addressed by slug. Unknown category slugs are reported;
  // unknown tag slugs are dropped rather than auto-created — silently
  // inventing taxonomy from a typo is how a catalogue rots.
  const db = getDb();
  const [categoryRows, tagRows] = await Promise.all([
    db.select({ id: categories.id, slug: categories.slug }).from(categories),
    db.select({ id: tags.id, slug: tags.slug }).from(tags),
  ]);
  const categoryBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));
  const tagBySlug = new Map(tagRows.map((t) => [t.slug, t.id]));

  /** First non-empty value among the given column names (old exports used `weight`). */
  const get = (row: string[], ...cols: string[]) => {
    for (const col of cols) {
      const idx = header.indexOf(col);
      const value = idx >= 0 ? row[idx]?.trim() ?? '' : '';
      if (value) return value;
    }
    return '';
  };
  const toBool = (v: string) => ['true', '1', 'yes'].includes(v.toLowerCase());
  const toNum = (v: string) => (v === '' ? null : Number(v));

  // ── Group rows into products ──
  interface Group {
    rowNumber: number;
    first: string[];
    variantRows: string[][];
  }
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  dataRows.forEach((row, i) => {
    if (row.every((c) => c.trim() === '')) return;
    const key = (get(row, 'slug') || slugifyProductName(get(row, 'name'))).toLowerCase();
    const hasVariant = Boolean(get(row, 'variant_attributes') || get(row, 'variant_sku'));
    const owner = key ? byKey.get(key) : undefined;
    if (owner && hasVariant) {
      owner.variantRows.push(row);
      return;
    }
    const g: Group = { rowNumber: i + 2, first: row, variantRows: hasVariant ? [row] : [] };
    groups.push(g);
    if (key && !owner) byKey.set(key, g);
  });

  const toDoc = (g: Group): { doc?: ProductDocument; error?: string } => {
    const row = g.first;
    const categoryRef = get(row, 'category');
    const categoryId = categoryRef ? categoryBySlug.get(categoryRef) : undefined;
    if (categoryRef && !categoryId) return { error: `category: no category with slug "${categoryRef}"` };

    const attrSpecs = [1, 2, 3]
      .map((i) => ({
        name: get(row, `attribute_${i}_name`),
        terms: get(row, `attribute_${i}_terms`),
        variation: get(row, `attribute_${i}_variation`),
      }))
      .filter((a) => a.name);

    const parsed = productDocumentSchema.safeParse({
      name: get(row, 'name'),
      slug: get(row, 'slug'),
      productType: get(row, 'product_type') || (g.variantRows.length > 0 ? 'variable' : 'simple'),
      shortDescription: get(row, 'short_description'),
      description: get(row, 'description'),
      images: parseList(get(row, 'images')),
      imageAlts: {},
      categoryId: categoryId ?? '',
      tagIds: parseList(get(row, 'tags'))
        .map((slug) => tagBySlug.get(slug))
        .filter((id): id is string => Boolean(id)),
      featured: toBool(get(row, 'featured')),
      newArrivalPinned: toBool(get(row, 'new_arrival_pinned')),
      excludeFromNewArrivals: toBool(get(row, 'exclude_from_new_arrivals')),
      visibility: get(row, 'visibility') || 'public',
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
      colorSwatches: {},
      variants: g.variantRows.map((r, i) => ({
        sku: get(r, 'variant_sku'),
        attributes: Object.fromEntries(
          parseList(get(r, 'variant_attributes'))
            .map((pair) => {
              const at = pair.indexOf(':');
              return at > 0 ? [pair.slice(0, at).trim(), pair.slice(at + 1).trim()] : ['', ''];
            })
            .filter(([k, v]) => k && v)
        ),
        price: get(r, 'variant_price') || null,
        compareAtPrice: get(r, 'variant_compare_at_price') || null,
        stockQuantity: toNum(get(r, 'variant_stock_quantity')) ?? 0,
        inStock: get(r, 'variant_in_stock') === '' ? true : toBool(get(r, 'variant_in_stock')),
        image: get(r, 'variant_image') || undefined,
        weight: get(r, 'variant_weight_oz', 'variant_weight') || null,
        position: i,
      })),
      sku: get(row, 'sku'),
      manageStock: get(row, 'manage_stock') === '' ? true : toBool(get(row, 'manage_stock')),
      stockQuantity: toNum(get(row, 'stock_quantity')) ?? 0,
      inStock: get(row, 'in_stock') === '' ? true : toBool(get(row, 'in_stock')),
      backorderPolicy: get(row, 'backorder_policy') || 'no',
      lowStockThreshold: toNum(get(row, 'low_stock_threshold')) ?? 5,
      weight: get(row, 'weight_oz', 'weight') || null,
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
      status: get(row, 'status') || 'draft',
      publishAt: get(row, 'publish_at') || null,
    });
    if (!parsed.success) {
      return {
        error: Object.entries(flattenIssues(parsed))
          .map(([path, messages]) => `${path}: ${messages[0]}`)
          .join('; '),
      };
    }
    const doc = parsed.data;
    if (!doc.slug) doc.slug = slugifyProductName(doc.name);
    return { doc };
  };

  let created = 0;
  const slugsInFile = new Set<string>();

  for (const g of groups) {
    const { doc, error } = toDoc(g);
    if (!doc) {
      results.push({ row: g.rowNumber, ok: false, error: error || 'Invalid row' });
      continue;
    }

    if (slugsInFile.has(doc.slug)) {
      results.push({ row: g.rowNumber, ok: false, error: `slug: "${doc.slug}" appears twice in this file` });
      continue;
    }
    slugsInFile.add(doc.slug);

    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, doc.slug))
      .limit(1);
    if (existing) {
      results.push({ row: g.rowNumber, ok: false, error: `slug: "${doc.slug}" already exists` });
      continue;
    }

    if (dryRun) {
      const conflict = await findSkuConflict(
        [doc.sku, ...(doc.productType === 'variable' ? doc.variants.map((v) => v.sku) : [])],
        null
      );
      if (conflict) {
        results.push({
          row: g.rowNumber,
          ok: false,
          error: `sku: "${conflict.sku}" is already used by “${conflict.productName}”`,
        });
      } else {
        results.push({ row: g.rowNumber, ok: true, name: doc.name });
      }
      continue;
    }

    const saved = await saveProductAction({ document: doc });
    if (saved.ok) {
      results.push({ row: g.rowNumber, ok: true, productId: saved.productId, name: doc.name });
      created++;
    } else {
      const detail = saved.fieldErrors
        ? Object.entries(saved.fieldErrors).map(([k, m]) => `${k}: ${m[0]}`).join('; ')
        : saved.error;
      results.push({ row: g.rowNumber, ok: false, error: detail });
    }
  }

  return { results, created };
}

// ─── ADMIN LIST ───────────────────────────────────────────

export type AdminProductSort =
  | 'newest'
  | 'oldest'
  | 'updated'
  | 'name'
  | '-name'
  | 'price'
  | '-price'
  | 'stock'
  | '-stock';

export type AdminStockFilter = 'in' | 'out' | 'low';

export interface AdminProductRow extends Product {
  /** Variable products only: number of variants and the price span they sell at. */
  variantCount: number;
  priceMin: number;
  priceMax: number;
}

export async function fetchAllProductsAdmin(
  page = 1,
  limit = 50,
  options?: {
    search?: string;
    status?: string;
    stock?: AdminStockFilter;
    categoryId?: string;
    sort?: AdminProductSort;
  }
) {
  await requireAdmin();

  const db = getDb();
  const offset = (Math.max(1, page) - 1) * limit;

  // Scheduled products go live by time alone (storefront reads treat a due
  // schedule as published; there is no cron). Settle the stored status here,
  // on an admin read rather than a timer, so the list shows what is live.
  const settled = await db
    .update(products)
    .set({ status: 'published', updatedAt: new Date() })
    .where(and(eq(products.status, 'scheduled'), lte(products.publishedAt, new Date())))
    .returning({ id: products.id });
  // Cached storefront reads filled before the publish time still hold the
  // old answer (a 404 for the product page) until they revalidate.
  if (settled.length > 0) invalidateProductCaches();

  const categoryRows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parentId: categories.parentId,
    })
    .from(categories);
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c]));

  const conditions: SQL[] = [];
  const search = options?.search?.trim();
  if (search) {
    // ilike: the old `like` made "abaya" miss "Abaya".
    const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      or(
        ilike(products.name, pattern),
        ilike(products.sku, pattern),
        sql`EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = ${products.id} AND pv.sku ILIKE ${pattern})`
      )!
    );
  }
  if (options?.status && ['draft', 'pending', 'scheduled', 'published'].includes(options.status)) {
    conditions.push(eq(products.status, options.status as ProductStatus));
  }
  if (options?.stock === 'in') conditions.push(eq(products.inStock, true));
  if (options?.stock === 'out') conditions.push(eq(products.inStock, false));
  if (options?.stock === 'low') {
    conditions.push(
      sql`${products.manageStock} = true AND ${products.stockQuantity} > 0 AND ${products.stockQuantity} <= coalesce(${products.lowStockThreshold}, 5)`
    );
  }
  if (options?.categoryId && categoryMap.has(options.categoryId)) {
    // The chosen category and everything below it.
    const ids = new Set([options.categoryId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of categoryRows) {
        if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
      }
    }
    conditions.push(inArray(products.categoryId, [...ids]));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const priceNum = sql`CAST(${products.price} AS NUMERIC)`;
  const orderBy = (() => {
    switch (options?.sort) {
      case 'oldest': return [asc(products.createdAt)];
      case 'updated': return [desc(products.updatedAt)];
      case 'name': return [asc(products.name)];
      case '-name': return [desc(products.name)];
      case 'price': return [asc(priceNum)];
      case '-price': return [desc(priceNum)];
      case 'stock': return [asc(products.stockQuantity), asc(products.name)];
      case '-stock': return [desc(products.stockQuantity), asc(products.name)];
      default: return [desc(products.createdAt)];
    }
  })();

  const [[countResult], rows] = await Promise.all([
    db.select({ count: count() }).from(products).where(where),
    db.select().from(products).where(where).orderBy(...orderBy).limit(limit).offset(offset),
  ]);

  const ids = rows.map((r) => r.id);
  const variableIds = rows.filter((r) => r.productType === 'variable').map((r) => r.id);
  const [tagJoins, variantRows] = await Promise.all([
    ids.length
      ? db
          .select({ productId: productTags.productId, id: tags.id, name: tags.name, slug: tags.slug })
          .from(productTags)
          .innerJoin(tags, eq(productTags.tagId, tags.id))
          .where(inArray(productTags.productId, ids))
      : Promise.resolve([]),
    variableIds.length
      ? db
          .select({
            productId: productVariants.productId,
            price: productVariants.price,
            stockQuantity: productVariants.stockQuantity,
            inStock: productVariants.inStock,
          })
          .from(productVariants)
          .where(inArray(productVariants.productId, variableIds))
      : Promise.resolve([]),
  ]);

  const tagsByProduct = new Map<string, Array<{ id: string; name: string; slug: string }>>();
  for (const t of tagJoins) {
    const list = tagsByProduct.get(t.productId) ?? [];
    list.push({ id: t.id, name: t.name, slug: t.slug });
    tagsByProduct.set(t.productId, list);
  }
  const variantsByProduct = new Map<string, typeof variantRows>();
  for (const v of variantRows) {
    const list = variantsByProduct.get(v.productId) ?? [];
    list.push(v);
    variantsByProduct.set(v.productId, list);
  }

  const items: AdminProductRow[] = rows.map((r) => {
    const product = mapProduct(r, {
      category: buildCategoryRef(categoryMap, r.categoryId),
      tags: tagsByProduct.get(r.id) ?? [],
    });
    const vs = r.productType === 'variable' ? variantsByProduct.get(r.id) ?? [] : [];
    const prices = vs.map((v) => (v.price != null ? parseFloat(v.price) : product.price));
    if (vs.length > 0) {
      // Older variable rows were saved before the product row carried the
      // variant totals; read them off the variants so the list is accurate.
      if (product.manageStock) product.stockQuantity = vs.reduce((n, v) => n + (v.stockQuantity || 0), 0);
      product.inStock = vs.some((v) => v.inStock);
    }
    return {
      ...product,
      variantCount: vs.length,
      priceMin: prices.length ? Math.min(...prices) : product.price,
      priceMax: prices.length ? Math.max(...prices) : product.price,
    };
  });

  const totalItems = countResult?.count || 0;
  return {
    items,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    page,
    limit,
  };
}

/** Bulk update: publish / unpublish (draft) / feature / unfeature / delete. */
export async function bulkUpdateProductsAction(input: {
  ids: string[];
  action: 'publish' | 'draft' | 'feature' | 'unfeature' | 'delete';
}): Promise<{ updated: number; skipped: number }> {
  await requireAdmin();

  const ids = Array.isArray(input.ids) ? input.ids.filter((id) => UUID_RE.test(id)) : [];
  if (ids.length === 0) return { updated: 0, skipped: 0 };

  const db = getDb();
  let updated = 0;
  let skipped = 0;

  if (input.action === 'delete') {
    const deleted = await db
      .delete(products)
      .where(inArray(products.id, ids))
      .returning({ id: products.id });
    updated = deleted.length;
  } else if (input.action === 'publish') {
    // Only rows that are not live yet (re-publishing must not reset
    // published_at and reshuffle New Arrivals), and only rows the builder
    // would let through: a price and a category.
    const rows = await db
      .update(products)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          inArray(products.id, ids),
          ne(products.status, 'published'),
          gt(sql`CAST(${products.price} AS NUMERIC)`, 0),
          isNotNull(products.categoryId)
        )
      )
      .returning({ id: products.id });
    updated = rows.length;
    const [{ live }] = await db
      .select({ live: count() })
      .from(products)
      .where(and(inArray(products.id, ids), eq(products.status, 'published')));
    skipped = ids.length - live;
  } else {
    const patch =
      input.action === 'draft'
        ? { status: 'draft' as const, publishedAt: null, updatedAt: new Date() }
        : { featured: input.action === 'feature', updatedAt: new Date() };
    const rows = await db
      .update(products)
      .set(patch)
      .where(inArray(products.id, ids))
      .returning({ id: products.id });
    updated = rows.length;
  }

  if (updated > 0) invalidateProductCaches();
  return { updated, skipped };
}

export async function deleteProductAction(id: string) {
  await requireAdmin();
  if (!UUID_RE.test(id)) return false;

  const db = getDb();
  const [deleted] = await db
    .delete(products)
    .where(eq(products.id, id))
    .returning({ id: products.id });
  if (deleted) invalidateProductCaches(deleted.id);
  return !!deleted;
}
