'use server';

import { updateTag } from 'next/cache';
import { getDb } from '@/lib/db';
import { productTags, tags } from '@/lib/schema';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { CATEGORIES_TAG, PRODUCTS_TAG, TAGS_TAG } from '@/lib/cache';
import { getTagsCached } from '@/lib/catalog-cache';
import { slugify } from '@/lib/utils';
import type { TagRef } from '@/types';
import { getSession } from './auth.actions';

/**
 * Tag CRUD against a real registry.
 *
 * Tags used to be a jsonb string[] on the product row, which made a rename or
 * a store-wide delete impossible — you would have had to rewrite every
 * product. Products now reference tag ids through product_tags, so renaming a
 * tag touches exactly one row and every product follows.
 */
function invalidateTaxonomy() {
  updateTag(TAGS_TAG);
  updateTag(CATEGORIES_TAG);
  updateTag(PRODUCTS_TAG);
}

async function requireAdmin() {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');
}

/** Public: all tags, ordered by position then name. */
export async function fetchTags(): Promise<TagRef[]> {
  return getTagsCached();
}

/** Admin: the same list plus how many products carry each tag. */
export async function fetchTagsWithCounts() {
  await requireAdmin();
  const db = getDb();

  return db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      position: tags.position,
      productCount: count(productTags.productId),
    })
    .from(tags)
    .leftJoin(productTags, eq(productTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.position), asc(tags.name));
}

/**
 * Creates a tag, or returns the existing one when the slug already exists.
 *
 * Deliberately idempotent rather than erroring: the product-builder combobox
 * creates tags on Enter, and a user typing a name that already exists means
 * "use that one", not "fail".
 */
export async function createTagAction(input: { name: string; slug?: string }) {
  await requireAdmin();
  const db = getDb();

  const name = input.name?.trim();
  if (!name) throw new Error('Name is required');
  const slug = slugify(input.slug || name);
  if (!slug) throw new Error('Name must contain at least one letter or number');

  const [existing] = await db
    .select()
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);
  if (existing) return existing;

  const [row] = await db.insert(tags).values({ name, slug, position: 0 }).returning();

  invalidateTaxonomy();
  return row;
}

export async function updateTagAction(
  id: string,
  patch: { name?: string; slug?: string; position?: number }
) {
  await requireAdmin();
  const db = getDb();

  const values: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('Name is required');
    values.name = name;
  }

  if (patch.slug !== undefined) {
    const slug = slugify(patch.slug);
    if (!slug) throw new Error('Slug must contain at least one letter or number');
    const [clash] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.slug, slug), ne(tags.id, id)))
      .limit(1);
    if (clash) throw new Error(`Another tag already uses the slug "${slug}"`);
    values.slug = slug;
  }

  if (patch.position !== undefined) values.position = patch.position;
  if (Object.keys(values).length === 0) return null;

  const [row] = await db.update(tags).set(values).where(eq(tags.id, id)).returning();

  invalidateTaxonomy();
  return row;
}

/**
 * Deletes a tag. product_tags rows cascade, so no product is left pointing at
 * a missing tag. Returns the number of products that lost it so the UI can
 * report the blast radius after the fact.
 */
export async function deleteTagAction(id: string) {
  await requireAdmin();
  const db = getDb();

  const [{ value: affected }] = await db
    .select({ value: count() })
    .from(productTags)
    .where(eq(productTags.tagId, id));

  await db.delete(tags).where(eq(tags.id, id));

  invalidateTaxonomy();
  return { affectedProducts: affected };
}

/**
 * Folds `sourceIds` into `targetId`: every product carrying a source tag gains
 * the target, then the sources are deleted (their joins cascade).
 *
 * The composite primary key on product_tags makes the insert safe to repeat —
 * a product already carrying the target is skipped rather than erroring.
 */
export async function mergeTagsAction(sourceIds: string[], targetId: string) {
  await requireAdmin();
  const db = getDb();

  const sources = sourceIds.filter((id) => id !== targetId);
  if (sources.length === 0) return { merged: 0, movedProducts: 0 };

  const [target] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.id, targetId))
    .limit(1);
  if (!target) throw new Error('Target tag no longer exists');

  const rows = await db
    .select({ productId: productTags.productId })
    .from(productTags)
    .where(inArray(productTags.tagId, sources));

  const productIds = [...new Set(rows.map((r) => r.productId))];
  if (productIds.length > 0) {
    await db
      .insert(productTags)
      .values(productIds.map((productId) => ({ productId, tagId: targetId })))
      .onConflictDoNothing();
  }

  await db.delete(tags).where(inArray(tags.id, sources));

  invalidateTaxonomy();
  return { merged: sources.length, movedProducts: productIds.length };
}

/**
 * Replaces one product's tag set. Delete-then-reinsert, matching how the
 * builder already handles variants and attributes — the neon-http driver has
 * no transactions, so this is not atomic. Called from the product save path
 * AFTER the product row is written, so a mid-failure leaves stale tags rather
 * than an orphaned join row.
 */
export async function setProductTags(productId: string, tagIds: string[]) {
  const db = getDb();

  await db.delete(productTags).where(eq(productTags.productId, productId));

  const unique = [...new Set(tagIds)].filter(Boolean);
  if (unique.length > 0) {
    await db
      .insert(productTags)
      .values(unique.map((tagId) => ({ productId, tagId })))
      .onConflictDoNothing();
  }
}
