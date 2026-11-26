'use server';

import { updateTag } from 'next/cache';
import { getDb } from '@/lib/db';
import { categories, coupons, products } from '@/lib/schema';
import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { CATEGORIES_TAG, PRODUCTS_TAG, TAGS_TAG } from '@/lib/cache';
import { getCategoryTreeCached } from '@/lib/catalog-cache';
import { slugify } from '@/lib/utils';
import type { CategoryNode } from '@/types';
import { getSession } from '@/lib/session';

/**
 * Category CRUD. The categories table has been hierarchical since the
 * connector migration but had no write path — products carried a 3-value
 * enum instead. This is that write path.
 *
 * Taxonomy writes invalidate PRODUCTS_TAG as well as CATEGORIES_TAG: a
 * cached product payload embeds its category name, so a rename has to reach
 * the catalogue cache too.
 */
function invalidateTaxonomy() {
  updateTag(CATEGORIES_TAG);
  updateTag(TAGS_TAG);
  updateTag(PRODUCTS_TAG);
}

async function requireAdmin() {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');
}

/** Public: the full tree, root-first, ordered by position. */
export async function fetchCategoryTree(): Promise<CategoryNode[]> {
  return getCategoryTreeCached();
}

/**
 * Admin: flat list with the number of products attached to each category
 * directly (not counting descendants — the admin tree sums those itself).
 * Uncached, so the admin always sees its own writes.
 */
export async function fetchCategoriesAdmin() {
  await requireAdmin();
  const db = getDb();

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parentId: categories.parentId,
      description: categories.description,
      image: categories.image,
      position: categories.position,
      productCount: count(products.id),
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.position), asc(categories.name));

  return rows;
}

/**
 * slugify() leaves leading/trailing dashes and underscores ("& Rings &" ->
 * "-rings-"); URLs should not carry either.
 */
function cleanSlug(raw: string): string {
  return slugify(raw).replace(/_/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const db = getDb();
  const [clash] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      excludeId
        ? and(eq(categories.slug, slug), ne(categories.id, excludeId))
        : eq(categories.slug, slug)
    )
    .limit(1);
  return !!clash;
}

/**
 * Derives a unique slug from the name. Appends -2, -3 … rather than failing,
 * so creating "Rings" under two different parents does not dead-end the
 * admin. A slug the admin typed explicitly is never silently rewritten — see
 * resolveSlug.
 */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const db = getDb();
  const root = cleanSlug(base) || 'category';
  let candidate = root;

  for (let n = 2; ; n++) {
    const clash = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        excludeId
          ? and(eq(categories.slug, candidate), ne(categories.id, excludeId))
          : eq(categories.slug, candidate)
      )
      .limit(1);
    if (clash.length === 0) return candidate;
    candidate = `${root}-${n}`;
  }
}

/** Explicit slug: must be valid and free. Derived slug: auto-suffixed. */
async function resolveSlug(
  explicit: string | undefined,
  name: string,
  excludeId?: string
): Promise<string> {
  if (explicit && explicit.trim()) {
    const slug = cleanSlug(explicit);
    if (!slug) throw new Error('Slug must contain at least one letter or number');
    if (await slugTaken(slug, excludeId)) {
      throw new Error(`Another category already uses the URL /shop/${slug}`);
    }
    return slug;
  }
  return uniqueSlug(name, excludeId);
}

/**
 * Two siblings with the same name render as indistinguishable entries in the
 * nav and in every category picker. Same name under different parents is
 * fine ("Rings" under Women and under Men).
 */
async function assertUniqueSiblingName(
  name: string,
  parentId: string | null,
  excludeId?: string
) {
  const db = getDb();
  const conditions = [
    sql`lower(${categories.name}) = ${name.toLowerCase()}`,
    parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId),
  ];
  if (excludeId) conditions.push(ne(categories.id, excludeId));
  const [clash] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(...conditions))
    .limit(1);
  if (clash) {
    throw new Error(
      parentId
        ? `A category named "${name}" already exists under this parent`
        : `A top-level category named "${name}" already exists`
    );
  }
}

async function assertParentExists(parentId: string) {
  const db = getDb();
  const [parent] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, parentId))
    .limit(1);
  if (!parent) throw new Error('Parent category no longer exists');
}

/** New categories go to the end of their sibling list, not the front. */
async function nextPosition(parentId: string | null): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ max: sql<number | null>`max(${categories.position})` })
    .from(categories)
    .where(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId));
  const max = row?.max;
  return max === null || max === undefined ? 0 : Number(max) + 1;
}

function cleanPosition(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : 0;
}

export async function createCategoryAction(input: {
  name: string;
  slug?: string;
  parentId?: string | null;
  description?: string;
  image?: string | null;
  position?: number;
}) {
  await requireAdmin();
  const db = getDb();

  const name = input.name?.trim();
  if (!name) throw new Error('Name is required');
  const parentId = input.parentId || null;

  if (parentId) await assertParentExists(parentId);
  await assertUniqueSiblingName(name, parentId);

  const slug = await resolveSlug(input.slug, name);
  const position = cleanPosition(input.position) ?? (await nextPosition(parentId));

  const [row] = await db
    .insert(categories)
    .values({
      name,
      slug,
      parentId,
      description: input.description?.trim() ?? '',
      image: input.image?.trim() || null,
      position,
    })
    .returning();

  invalidateTaxonomy();
  return row;
}

/**
 * Walks up from `parentId` looking for `id`. Without this, setting a
 * category's parent to its own descendant detaches that whole branch from
 * the roots and it disappears from every tree render.
 */
async function wouldCycle(id: string, parentId: string): Promise<boolean> {
  if (id === parentId) return true;
  const db = getDb();
  const rows = await db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories);
  const byId = new Map(rows.map((r) => [r.id, r.parentId]));

  const seen = new Set<string>();
  let cursor: string | null = parentId;
  while (cursor && !seen.has(cursor)) {
    if (cursor === id) return true;
    seen.add(cursor);
    cursor = byId.get(cursor) ?? null;
  }
  return false;
}

export async function updateCategoryAction(
  id: string,
  patch: {
    name?: string;
    slug?: string;
    parentId?: string | null;
    description?: string;
    image?: string | null;
    position?: number;
  }
) {
  await requireAdmin();
  const db = getDb();

  const [current] = await db
    .select({ name: categories.name, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!current) throw new Error('Category no longer exists');

  const values: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('Name is required');
    values.name = name;
  }
  if (patch.slug !== undefined && patch.slug.trim()) {
    values.slug = await resolveSlug(patch.slug, '', id);
  }
  if (patch.description !== undefined) values.description = patch.description.trim();
  if (patch.image !== undefined) values.image = patch.image?.trim() || null;
  if (patch.position !== undefined) values.position = cleanPosition(patch.position);

  if (patch.parentId !== undefined) {
    const parentId = patch.parentId || null;
    if (parentId) {
      await assertParentExists(parentId);
      if (await wouldCycle(id, parentId)) {
        throw new Error('A category cannot be moved inside itself or one of its subcategories');
      }
    }
    values.parentId = parentId;
  }

  if (values.name !== undefined || values.parentId !== undefined) {
    await assertUniqueSiblingName(
      (values.name as string | undefined) ?? current.name,
      values.parentId !== undefined ? (values.parentId as string | null) : current.parentId,
      id
    );
  }

  if (Object.keys(values).length === 0) return null;

  const [row] = await db
    .update(categories)
    .set(values)
    .where(eq(categories.id, id))
    .returning();

  invalidateTaxonomy();
  return row;
}

/**
 * Every category id in the subtree rooted at `id`, itself included. UNION
 * (not UNION ALL) so a parent_id cycle in legacy data terminates instead of
 * recursing forever.
 */
async function subtreeIds(id: string): Promise<string[]> {
  const db = getDb();
  const result = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM categories WHERE id = ${id}
      UNION
      SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
    )
    SELECT id FROM subtree
  `);
  const rows = (result as any).rows ?? result;
  return (rows as Array<{ id: string }>).map((r) => r.id);
}

export interface CategoryDeleteImpact {
  /** Subcategories at any depth beneath the category (it is not counted). */
  descendantCount: number;
  /** Products attached to the category or anything beneath it. */
  productCount: number;
  /** Coupons restricted to the category or anything beneath it. */
  couponCount: number;
}

async function deleteImpact(ids: string[]): Promise<CategoryDeleteImpact> {
  const db = getDb();
  const [[{ value: productCount }], [{ value: couponCount }]] = await Promise.all([
    db.select({ value: count() }).from(products).where(inArray(products.categoryId, ids)),
    db.select({ value: count() }).from(coupons).where(inArray(coupons.categoryId, ids)),
  ]);
  return {
    descendantCount: ids.length - 1,
    productCount: Number(productCount) || 0,
    couponCount: Number(couponCount) || 0,
  };
}

/** Admin: what deleting `id` would touch, so the confirm dialog can say so up front. */
export async function fetchCategoryDeleteImpact(id: string): Promise<CategoryDeleteImpact> {
  await requireAdmin();
  const ids = await subtreeIds(id);
  if (ids.length === 0) throw new Error('Category no longer exists');
  return deleteImpact(ids);
}

export type DeleteCategoryResult =
  | {
      deleted: true;
      reassignedProducts: number;
      removedCategories: number;
      disabledCoupons: number;
    }
  | ({ deleted: false; blocked: true } & CategoryDeleteImpact);

/**
 * Deleting a parent takes its children with it — the parent_id FK is
 * ON DELETE cascade. So this counts the whole subtree, and refuses when any
 * product would be orphaned unless the caller names a category to move them
 * to. The UI turns `blocked` into a reassign picker.
 *
 * Coupons restricted to a deleted category are disabled first: the
 * coupons.category_id FK is ON DELETE set null, and a null category means
 * "applies to every product" — a deleted "Sale" category would otherwise
 * silently turn its coupon into a storewide discount.
 */
export async function deleteCategoryAction(
  id: string,
  opts: { reassignTo?: string | null } = {}
): Promise<DeleteCategoryResult> {
  await requireAdmin();
  const db = getDb();

  const ids = await subtreeIds(id);
  if (ids.length === 0) throw new Error('Category no longer exists');

  const impact = await deleteImpact(ids);
  const { productCount } = impact;

  if (productCount > 0 && !opts.reassignTo) {
    return { deleted: false, blocked: true, ...impact };
  }

  let reassigned = 0;
  if (productCount > 0 && opts.reassignTo) {
    if (ids.includes(opts.reassignTo)) {
      throw new Error('Cannot reassign products into the category being deleted');
    }
    const [target] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, opts.reassignTo))
      .limit(1);
    if (!target) throw new Error('Target category no longer exists');

    await db
      .update(products)
      .set({ categoryId: opts.reassignTo })
      .where(inArray(products.categoryId, ids));
    reassigned = productCount;
  }

  let disabledCoupons = 0;
  if (impact.couponCount > 0) {
    const rows = await db
      .update(coupons)
      .set({ enabled: false, updatedAt: new Date() })
      .where(inArray(coupons.categoryId, ids))
      .returning({ id: coupons.id });
    disabledCoupons = rows.length;
  }

  // Children cascade, but delete explicitly so the count is honest.
  await db.delete(categories).where(inArray(categories.id, ids));

  invalidateTaxonomy();
  return {
    deleted: true,
    reassignedProducts: reassigned,
    removedCategories: ids.length,
    disabledCoupons,
  };
}

export async function reorderCategoriesAction(
  updates: Array<{ id: string; position: number; parentId?: string | null }>
) {
  await requireAdmin();
  const db = getDb();

  // No transactions on the neon-http driver, so validate every move before
  // applying any of them — a half-applied reorder is still a valid tree,
  // but a cycle is not.
  for (const u of updates) {
    if (u.parentId && (await wouldCycle(u.id, u.parentId))) {
      throw new Error('That move would put a category inside itself');
    }
  }

  for (const u of updates) {
    const values: Record<string, unknown> = { position: cleanPosition(u.position) ?? 0 };
    if (u.parentId !== undefined) values.parentId = u.parentId;
    await db.update(categories).set(values).where(eq(categories.id, u.id));
  }

  invalidateTaxonomy();
  return { updated: updates.length };
}
