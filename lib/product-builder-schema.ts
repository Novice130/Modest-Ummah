import { z } from 'zod';

/**
 * The single source of truth for product data across the builder, the CSV
 * import/export, and the persistence layer. Directive-free so it can be
 * imported from 'use server' actions and client components alike.
 *
 * Storage decision (see IMPLEMENTATION_PLAN): product descriptions are
 * markdown. The builder ships a markdown textarea with a rendered preview;
 * nothing in the app parses HTML descriptions, so keeping the existing
 * plain-text/markdown storage format means zero migration of existing rows.
 *
 * Dates are serialized as ISO strings so the whole object survives JSON
 * round-trips (CSV, autosave over the server boundary).
 */

// ─── Primitives ──────────────────────────────────────────

export const isoDateString = z.string().datetime({ offset: true }).nullable().optional();

export const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a number with at most 2 decimals');

export const positiveMoney = moneyString.refine(
  (v) => parseFloat(v) > 0,
  'Must be greater than 0'
);

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers, and hyphens only');

export const colorSchema = z.object({
  name: z.string().min(1, 'Color name is required'),
  value: z.string().min(1, 'Color value is required'),
  image: z.string().optional(),
});

export const variantSchema = z
  .object({
    // Local row id (client-side only, e.g. "local-1"); the server assigns
    // the real id and echoes it back after the first save.
    id: z.string().optional(),
    sku: z.string().default(''),
    attributes: z.record(z.string(), z.string()),
    price: moneyString.nullable().optional(),
    compareAtPrice: moneyString.nullable().optional(),
    stockQuantity: z.number().int().min(0).default(0),
    inStock: z.boolean().default(true),
    image: z.string().optional(),
    weight: moneyString.nullable().optional(),
    position: z.number().int().default(0),
  })
  .superRefine((v, ctx) => {
    if (v.price !== undefined && v.price !== null) {
      if (!/^\d+(\.\d{1,2})?$/.test(v.price)) {
        ctx.addIssue({ code: 'custom', path: ['price'], message: 'Must be a number with at most 2 decimals' });
      }
    }
  });

export const attributeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Attribute name is required'),
  terms: z.array(z.string().min(1, 'Term cannot be empty')).min(1, 'At least one term is required'),
  usedForVariations: z.boolean().default(false),
});

// ─── Sections ────────────────────────────────────────────

/** Basics — section 1 */
export const basicsSchema = z.object({
  name: z.string().min(2, 'Name is required (min 2 characters)'),
  slug: slugSchema.optional().default(''),
  productType: z.enum(['simple', 'variable']).default('simple'),
  shortDescription: z.string().min(1, 'Short description is required'),
  description: z.string().default(''),
});

/** Media — section 2 */
export const mediaSchema = z.object({
  images: z.array(z.string()).default([]),
  imageAlts: z.record(z.string(), z.string()).default({}),
});

/** Organization — section 3 */
export const organizationSchema = z.object({
  category: z.enum(['men', 'women', 'accessories']),
  subcategory: z.string().min(1, 'Subcategory is required'),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  newArrivalPinned: z.boolean().default(false),
  excludeFromNewArrivals: z.boolean().default(false),
  visibility: z.enum(['public', 'hidden', 'search_only']).default('public'),
});

/** Pricing — section 4 (and attribute definitions) */
export const pricingSchema = z.object({
  price: positiveMoney,
  compareAtPrice: moneyString.nullable().optional(),
  saleStartsAt: isoDateString,
  saleEndsAt: isoDateString,
  taxClass: z.string().default(''),
  attributes: z.array(attributeSchema).default([]),
});

/** Variants — section 4b (matrix rows) */
export const variantsSchema = z.object({
  variants: z.array(variantSchema).default([]),
});

/** Inventory & Shipping — section 5 */
export const inventorySchema = z.object({
  sku: z.string().default(''),
  manageStock: z.boolean().default(true),
  stockQuantity: z.number().int().min(0).default(0),
  backorderPolicy: z.enum(['no', 'notify', 'yes']).default('no'),
  lowStockThreshold: z.number().int().min(0).default(5),
  weight: moneyString.nullable().optional(),
  lengthIn: moneyString.nullable().optional(),
  widthIn: moneyString.nullable().optional(),
  heightIn: moneyString.nullable().optional(),
  shippingClass: z.string().default(''),
});

/** Linked products — section 5b */
export const linkedSchema = z.object({
  upsellIds: z.array(z.string()).default([]),
  crossSellIds: z.array(z.string()).default([]),
  similarProductIds: z.array(z.string()).default([]),
});

/** SEO & Publish — section 6 */
export const publishSchema = z.object({
  metaTitle: z.string().default(''),
  metaDescription: z.string().default(''),
  ogImage: z.string().default(''),
  status: z.enum(['draft', 'pending', 'scheduled', 'published']).default('draft'),
  publishAt: isoDateString,
});

/** The complete product document. */
export const productDocumentSchema = z
  .object({})
  .merge(basicsSchema)
  .merge(mediaSchema)
  .merge(organizationSchema)
  .merge(pricingSchema)
  .merge(variantsSchema)
  .merge(inventorySchema)
  .merge(linkedSchema)
  .merge(publishSchema)
  .superRefine((doc, ctx) => {
    // Sale price must be below the regular price.
    if (
      doc.compareAtPrice &&
      parseFloat(doc.compareAtPrice) <= parseFloat(doc.price)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['compareAtPrice'],
        message: 'Compare-at price must be higher than the regular price',
      });
    }
    // A scheduled product needs a publish datetime.
    if (doc.status === 'scheduled' && !doc.publishAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['publishAt'],
        message: 'Scheduled products need a publish date and time',
      });
    }
  });

export type ProductDocument = z.infer<typeof productDocumentSchema>;
export type VariantRow = z.infer<typeof variantSchema>;
export type AttributeRow = z.infer<typeof attributeSchema>;

/** Section descriptors used by the builder shell for validation + nav. */
export const SECTIONS = [
  { id: 'basics', label: 'Basics', schema: basicsSchema },
  { id: 'media', label: 'Media', schema: mediaSchema },
  { id: 'organization', label: 'Organization', schema: organizationSchema },
  { id: 'pricing', label: 'Pricing & Variants', schema: pricingSchema },
  { id: 'inventory', label: 'Inventory & Shipping', schema: inventorySchema },
  { id: 'publish', label: 'SEO & Publish', schema: publishSchema },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export function validateSection<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  return schema.safeParse(data);
}

/** Zod's flat issue shape, safe to pass across the server boundary. */
export function flattenIssues(result: { success: false; error: z.ZodError }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_form';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

// ─── Defaults ────────────────────────────────────────────

/** Initial state for a brand-new product. */
export function defaultProductDocument(): ProductDocument {
  return {
    name: '',
    slug: '',
    productType: 'simple',
    shortDescription: '',
    description: '',
    images: [],
    imageAlts: {},
    category: 'men',
    subcategory: '',
    tags: [],
    featured: false,
    newArrivalPinned: false,
    excludeFromNewArrivals: false,
    visibility: 'public',
    price: '',
    compareAtPrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
    taxClass: '',
    attributes: [],
    variants: [],
    sku: '',
    manageStock: true,
    stockQuantity: 0,
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
    status: 'draft',
    publishAt: null,
  };
}

// ─── CSV column mapping (import/export) ──────────────────

/**
 * Flat-column mapping for the CSV. Simple + variable products share the
 * template; variable rows carry attributes/terms and variant rows. Multi-
 * valued fields are pipe-joined; only variant-column rows populate the
 * variant columns, following the WooCommerce import convention.
 */
export const CSV_COLUMNS = [
  'name',
  'slug',
  'product_type',
  'short_description',
  'description',
  'category',
  'subcategory',
  'tags',
  'featured',
  'new_arrival_pinned',
  'exclude_from_new_arrivals',
  'visibility',
  'price',
  'compare_at_price',
  'sale_starts_at',
  'sale_ends_at',
  'tax_class',
  'sku',
  'manage_stock',
  'stock_quantity',
  'backorder_policy',
  'low_stock_threshold',
  'weight',
  'length_in',
  'width_in',
  'height_in',
  'shipping_class',
  'meta_title',
  'meta_description',
  'og_image',
  'images',
  'status',
  'publish_at',
  'attribute_1_name',
  'attribute_1_terms',
  'attribute_1_variation',
  'attribute_2_name',
  'attribute_2_terms',
  'attribute_2_variation',
  'attribute_3_name',
  'attribute_3_terms',
  'attribute_3_variation',
  'variant_attributes',
  'variant_sku',
  'variant_price',
  'variant_compare_at_price',
  'variant_stock_quantity',
  'variant_in_stock',
  'variant_image',
  'variant_weight',
] as const;

export function csvTemplate(): string {
  const header = (CSV_COLUMNS as readonly string[]).join(',');
  const example = [
    'Example Thobe',
    'example-thobe',
    'simple',
    'Premium everyday thobe',
    'A comfortable, breathable thobe.',
    'men',
    'Thobes',
    'summer,premium',
    'false',
    'false',
    'false',
    'public',
    '59.99',
    '79.99',
    '',
    '',
    '',
    'THB-001',
    'true',
    '25',
    'no',
    '5',
    '1.5',
    '10',
    '7',
    '1',
    '',
    'Example Thobe | Modest Ummah',
    'Premium everyday thobe in breathable fabric.',
    '',
    '',
    'draft',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
  return [header, example.join(',')].join('\n');
}

export const CSV_EXPORT_COLUMNS: Array<{ key: string; label: string }> = (
  CSV_COLUMNS as readonly string[]
).map((c) => ({ key: c, label: c }));

// ─── Product → document (edit round-trip) ────────────────

import type { Product } from '@/types';
import type { ProductAttributeSelect, ProductVariantSelect } from '@/lib/schema';

export function productToDocument(
  product: Product,
  extra: { variants?: ProductVariantSelect[]; attributes?: ProductAttributeSelect[] } = {}
): ProductDocument {
  return {
    name: product.name,
    slug: product.slug,
    productType: product.productType,
    shortDescription: product.shortDescription,
    description: product.description,
    images: product.images || [],
    imageAlts: product.imageAlts || {},
    category: product.category,
    subcategory: product.subcategory,
    tags: product.tags || [],
    featured: product.featured ?? false,
    newArrivalPinned: product.newArrivalPinned ?? false,
    excludeFromNewArrivals: product.excludeFromNewArrivals ?? false,
    visibility: product.visibility,
    price: String(product.price),
    compareAtPrice: product.compareAtPrice != null ? String(product.compareAtPrice) : null,
    saleStartsAt: product.saleStartsAt ?? null,
    saleEndsAt: product.saleEndsAt ?? null,
    taxClass: product.taxClass || '',
    attributes: (extra.attributes || []).map((a) => ({
      id: a.id,
      name: a.name,
      terms: (a.terms || []) as string[],
      usedForVariations: a.usedForVariations ?? false,
    })),
    variants: (extra.variants || []).map((v) => ({
      id: v.id,
      sku: v.sku,
      attributes: (v.attributes || {}) as Record<string, string>,
      price: v.price != null ? String(parseFloat(v.price as string)) : null,
      compareAtPrice: v.compareAtPrice != null ? String(parseFloat(v.compareAtPrice as string)) : null,
      stockQuantity: v.stockQuantity ?? 0,
      inStock: v.inStock ?? true,
      image: v.image || undefined,
      weight: v.weight != null ? String(parseFloat(v.weight as string)) : null,
      position: v.position ?? 0,
    })),
    sku: product.sku,
    manageStock: product.manageStock ?? true,
    stockQuantity: product.stockQuantity ?? 0,
    backorderPolicy: product.backorderPolicy,
    lowStockThreshold: product.lowStockThreshold ?? 5,
    weight: product.weight != null ? String(product.weight) : null,
    lengthIn: product.lengthIn != null ? String(product.lengthIn) : null,
    widthIn: product.widthIn != null ? String(product.widthIn) : null,
    heightIn: product.heightIn != null ? String(product.heightIn) : null,
    shippingClass: product.shippingClass || '',
    upsellIds: product.upsellIds || [],
    crossSellIds: product.crossSellIds || [],
    similarProductIds: product.similarProducts || [],
    metaTitle: product.metaTitle || '',
    metaDescription: product.metaDescription || '',
    ogImage: product.ogImage || '',
    status: product.status,
    publishAt: product.publishedAt ?? null,
  };
}
