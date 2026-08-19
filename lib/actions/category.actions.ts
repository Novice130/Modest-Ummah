'use server';

import { updateTag } from 'next/cache';
import { getDb } from '@/lib/db';
import { categories, products } from '@/lib/schema';
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { CATEGORIES_TAG, PRODUCTS_TAG, TAGS_TAG } from '@/lib/cache';
import { getCategoryTreeCached } from '@/lib/catalog-cache';
import { slugify } from '@/lib/utils';
import type { CategoryNode } from '@/types';
import { getSession } from './auth.actions';

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
 * directly (not counting descendants — the tree view sums those itself).
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
 * Derives a unique slug. Appends -2, -3 … rather than failing, so creating
 * "Rings" under two different parents does not dead-end the admin.
 */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const db = getDb();
  const root = slugify(base) || 'category';
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

  if (input.parentId) {
    const [parent] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, input.parentId))
      .limit(1);
    if (!parent) throw new Error('Parent category no longer exists');
  }

  const slug = await uniqueSlug(input.slug || name);

  const [row] = await db
    .insert(categories)
    .values({
      name,
      slug,
      parentId: input.parentId ?? null,
      description: input.description ?? '',
      image: input.image ?? null,
      position: input.position ?? 0,
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

  const values: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('Name is required');
    values.name = name;
  }
  if (patch.slug !== undefined) values.slug = await uniqueSlug(patch.slug, id);
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.image !== undefined) values.image = patch.image;
  if (patch.position !== undefined) values.position = patch.position;

  if (patch.parentId !== undefined) {
    if (patch.parentId && (await wouldCycle(id, patch.parentId))) {
      throw new Error('A category cannot be moved inside itself');
    }
    values.parentId = patch.parentId;
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

/** Every category id in the subtree rooted at `id`, itself included. */
async function subtreeIds(id: string): Promise<string[]> {
  const db = getDb();
  const result = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM categories WHERE id = ${id}
      UNION ALL
      SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
    )
    SELECT id FROM subtree
  `);
  const rows = (result as any).rows ?? result;
  return (rows as Array<{ id: string }>).map((r) => r.id);
}

export type DeleteCategoryResult =
  | { deleted: true; reassignedProducts: number; removedCategories: number }
  | { deleted: false; blocked: true; productCount: number; descendantCount: number };

/**
 * Deleting a parent takes its children with it — the parent_id FK is
 * ON DELETE cascade. So this counts the whole subtree, and refuses when any
 * product would be orphaned unless the caller names a category to move them
 * to. The UI turns `blocked` into a reassign picker.
 */
export async function deleteCategoryAction(
  id: string,
  opts: { reassignTo?: string | null } = {}
): Promise<DeleteCategoryResult> {
  await requireAdmin();
  const db = getDb();

  const ids = await subtreeIds(id);
  if (ids.length === 0) throw new Error('Category no longer exists');

  const [{ value: productCount }] = await db
    .select({ value: count() })
    .from(products)
    .where(inArray(products.categoryId, ids));

  if (productCount > 0 && !opts.reassignTo) {
    return {
      deleted: false,
      blocked: true,
      productCount,
      descendantCount: ids.length - 1,
    };
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

  // Children cascade, but delete explicitly so the count is honest.
  await db.delete(categories).where(inArray(categories.id, ids));

  invalidateTaxonomy();
  return { deleted: true, reassignedProducts: reassigned, removedCategories: ids.length };
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
    const values: Record<string, unknown> = { position: u.position };
    if (u.parentId !== undefined) values.parentId = u.parentId;
    await db.update(categories).set(values).where(eq(categories.id, u.id));
  }

  invalidateTaxonomy();
  return { updated: updates.length };
}
