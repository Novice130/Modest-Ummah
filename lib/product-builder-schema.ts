import { z } from 'zod';
import { stringifyCsv } from '@/lib/csv';
import { optionKind } from '@/lib/variant-options';

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
 *
 * Units: price in dollars (decimal strings, never cents), weight in OUNCES
 * (lib/parcel.ts and the WooCommerce connector both read it as oz),
 * dimensions in inches.
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

export const variantSchema = z.object({
  // Server id once saved; absent for rows created in this session. Kept
  // across saves so a cart line pointing at a variant survives an edit.
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
});

export const attributeSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Option name is required'),
  terms: z.array(z.string().min(1, 'Value cannot be empty')).min(1, 'Add at least one value'),
  usedForVariations: z.boolean().default(false),
});

// ─── Sections ────────────────────────────────────────────

/** Basics — section 1 */
export const basicsSchema = z.object({
  name: z.string().trim().min(2, 'Name is required (min 2 characters)'),
  // Empty means "derive from the name" — the server fills it in on save.
  slug: z.union([z.literal(''), slugSchema]).default(''),
  productType: z.enum(['simple', 'variable']).default('simple'),
  shortDescription: z.string().trim().min(1, 'Short description is required'),
  description: z.string().default(''),
});

/** Media — section 2 */
export const mediaSchema = z.object({
  images: z.array(z.string()).default([]),
  imageAlts: z.record(z.string(), z.string()).default({}),
});

/** Organization — section 3 */
export const organizationSchema = z.object({
  // The LEAF category id. Products attach to leaves; the ancestor chain is
  // derived, so there is no separate subcategory field any more.
  categoryId: z.string().uuid('Select a category'),
  tagIds: z.array(z.string().uuid()).default([]),
  featured: z.boolean().default(false),
  newArrivalPinned: z.boolean().default(false),
  excludeFromNewArrivals: z.boolean().default(false),
  visibility: z.enum(['public', 'hidden', 'search_only']).default('public'),
});

/** Pricing — section 4 (and option/attribute definitions) */
export const pricingSchema = z.object({
  price: positiveMoney,
  compareAtPrice: moneyString.nullable().optional(),
  saleStartsAt: isoDateString,
  saleEndsAt: isoDateString,
  taxClass: z.string().default(''),
  attributes: z.array(attributeSchema).default([]),
  // Swatch colour per value of the Color option, keyed by value name. The
  // storefront's colour picker reads products.colors, built from these.
  colorSwatches: z.record(z.string(), z.string()).default({}),
});

/** Variants — section 4b (matrix rows) */
export const variantsSchema = z.object({
  variants: z.array(variantSchema).default([]),
});

/** Inventory & Shipping — section 5 */
export const inventorySchema = z.object({
  sku: z.string().trim().default(''),
  manageStock: z.boolean().default(true),
  stockQuantity: z.number().int().min(0).default(0),
  // Only meaningful when stock is NOT tracked: the manual stock status.
  // With tracking on, the server derives it from quantity + backorders.
  inStock: z.boolean().default(true),
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
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    // Compare-at ("was") price must be above the price charged.
    if (doc.compareAtPrice && parseFloat(doc.compareAtPrice) <= parseFloat(doc.price)) {
      issue(['compareAtPrice'], 'Compare-at price must be higher than the price');
    }
    if (
      doc.saleStartsAt &&
      doc.saleEndsAt &&
      new Date(doc.saleEndsAt).getTime() <= new Date(doc.saleStartsAt).getTime()
    ) {
      issue(['saleEndsAt'], 'The sale must end after it starts');
    }

    // A scheduled product needs a publish datetime.
    if (doc.status === 'scheduled' && !doc.publishAt) {
      issue(['publishAt'], 'Scheduled products need a publish date and time');
    }

    // Option names key the variant attribute map, so they must be unique.
    const seenNames = new Set<string>();
    doc.attributes.forEach((a, i) => {
      const key = a.name.trim().toLowerCase();
      if (key && seenNames.has(key)) issue(['attributes', i, 'name'], `Option "${a.name}" is listed twice`);
      seenNames.add(key);
    });

    if (doc.productType !== 'variable') return;

    const variationAttrs = doc.attributes.filter((a) => a.usedForVariations && a.terms.length > 0);
    if (variationAttrs.length === 0) {
      issue(['attributes'], 'A variable product needs at least one option marked “Used for variations”');
      return;
    }
    if (doc.variants.length === 0) {
      issue(['variants'], 'Generate the variants — a variable product needs at least one');
      return;
    }

    const productSku = doc.sku.trim().toLowerCase();
    const seenSkus = new Set<string>();
    doc.variants.forEach((v, i) => {
      const row = `Row ${i + 1}`;
      const matches =
        Object.keys(v.attributes).length === variationAttrs.length &&
        variationAttrs.every((a) => a.terms.includes(v.attributes[a.name] ?? ''));
      if (!matches) {
        issue(['variants', i, 'attributes'], `${row} no longer matches the options — regenerate the variants`);
      }

      const sku = v.sku.trim().toLowerCase();
      if (!sku) issue(['variants', i, 'sku'], `${row}: SKU is required`);
      else if (seenSkus.has(sku) || sku === productSku) {
        issue(['variants', i, 'sku'], `${row}: SKU "${v.sku}" is used more than once`);
      }
      seenSkus.add(sku);

      if (v.price != null && parseFloat(v.price) <= 0) {
        issue(['variants', i, 'price'], `${row}: price must be greater than 0`);
      }
      const effective = v.price ?? doc.price;
      if (v.compareAtPrice && parseFloat(v.compareAtPrice) <= parseFloat(effective || '0')) {
        issue(['variants', i, 'compareAtPrice'], `${row}: compare-at price must be higher than its price`);
      }
    });
  });

export type ProductDocument = z.infer<typeof productDocumentSchema>;
export type VariantRow = z.infer<typeof variantSchema>;
export type AttributeRow = z.infer<typeof attributeSchema>;

/** Section descriptors used by the builder shell for validation + nav. */
export const SECTIONS = [
  { id: 'basics', label: 'Basics', schema: basicsSchema },
  { id: 'media', label: 'Media', schema: mediaSchema },
  { id: 'organization', label: 'Organization', schema: organizationSchema },
  { id: 'pricing', label: 'Pricing & Options', schema: pricingSchema },
  { id: 'inventory', label: 'Inventory & Shipping', schema: inventorySchema },
  { id: 'publish', label: 'SEO & Publish', schema: publishSchema },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/** Zod's flat issue shape, safe to pass across the server boundary. */
export function flattenIssues(result: { success: false; error: z.ZodError }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_form';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Every message whose path is `prefix` or nested under it. */
export function errorsUnder(errors: Record<string, string[]>, prefix: string): string[] {
  return Object.entries(errors)
    .filter(([key]) => key === prefix || key.startsWith(prefix + '.'))
    .flatMap(([, messages]) => messages);
}

export function slugifyProductName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Storefront options (Size / Color) ───────────────────

/**
 * The storefront product page renders a size picker from products.sizes and
 * colour swatches from products.colors. Rather than a second, duplicate
 * input for those, an option NAMED Size or Color is the source: on save the
 * server writes its values into those columns.
 */
export { optionKind };

export const DEFAULT_SWATCH = '#d4d4d4';

export function deriveStorefrontOptions(
  doc: Pick<ProductDocument, 'attributes' | 'colorSwatches'>,
  existingColors: Array<{ name: string; value: string; image?: string }> = []
): { sizes: string[]; colors: Array<{ name: string; value: string; image?: string }> } {
  const sizeAttr = doc.attributes.find((a) => optionKind(a.name) === 'size');
  const colorAttr = doc.attributes.find((a) => optionKind(a.name) === 'color');
  const previous = new Map(existingColors.map((c) => [c.name, c]));
  return {
    sizes: sizeAttr ? [...sizeAttr.terms] : [],
    colors: (colorAttr?.terms ?? []).map((name) => {
      const prev = previous.get(name);
      return {
        name,
        value: doc.colorSwatches[name] || prev?.value || DEFAULT_SWATCH,
        ...(prev?.image ? { image: prev.image } : {}),
      };
    }),
  };
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
    categoryId: '',
    tagIds: [],
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
    colorSwatches: {},
    variants: [],
    sku: '',
    manageStock: true,
    stockQuantity: 0,
    inStock: true,
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
 * template. Multi-valued fields are pipe-joined. A variable product is one
 * row per variant, each repeating the product columns (same slug) and
 * filling the variant_* columns — the WooCommerce import convention. The
 * importer reads columns by header name, so column order is not significant.
 */
export const CSV_COLUMNS = [
  'name',
  'slug',
  'product_type',
  'short_description',
  'description',
  'category',
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
  'in_stock',
  'backorder_policy',
  'low_stock_threshold',
  'weight_oz',
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
  'variant_weight_oz',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export function csvTemplate(): string {
  const example: Partial<Record<CsvColumn, string>> = {
    name: 'Example Necklace Set',
    slug: 'example-necklace-set',
    product_type: 'simple',
    short_description: 'A cubic zirconia necklace with matching earrings.',
    description: 'Rhodium-plated brass with hand-set stones.',
    category: 'necklace-sets',
    tags: 'everyday|statement',
    featured: 'false',
    new_arrival_pinned: 'false',
    exclude_from_new_arrivals: 'false',
    visibility: 'public',
    price: '59.99',
    compare_at_price: '79.99',
    sku: 'MU-JWL-NS-999',
    manage_stock: 'true',
    stock_quantity: '25',
    in_stock: 'true',
    backorder_policy: 'no',
    low_stock_threshold: '5',
    weight_oz: '4',
    length_in: '8',
    width_in: '6',
    height_in: '2',
    meta_title: 'Example Necklace Set | Modest Ummah',
    meta_description: 'A cubic zirconia necklace with matching earrings.',
    status: 'draft',
    attribute_1_name: 'Color',
    attribute_1_terms: 'Silver|Gold',
    attribute_1_variation: 'false',
  };
  return stringifyCsv([
    [...CSV_COLUMNS],
    CSV_COLUMNS.map((c) => example[c] ?? ''),
  ]);
}

// ─── Product → document (edit round-trip) ────────────────

import type { Product } from '@/types';
import type { ProductAttributeSelect, ProductVariantSelect } from '@/lib/schema';

const decimalOrNull = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(parseFloat(String(v)));

export function productToDocument(
  product: Product,
  extra: { variants?: ProductVariantSelect[]; attributes?: ProductAttributeSelect[] } = {}
): ProductDocument {
  const attributes: AttributeRow[] = [...(extra.attributes || [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((a) => ({
      id: a.id,
      name: a.name,
      terms: (a.terms || []) as string[],
      usedForVariations: a.usedForVariations ?? false,
    }));

  // Older products carry sizes/colors on the row with no option rows. Surface
  // them as options so they are visible and editable, and so a save does not
  // silently drop them.
  const colors = product.colors || [];
  const sizes = product.sizes || [];
  if (colors.length > 0 && !attributes.some((a) => optionKind(a.name) === 'color')) {
    attributes.push({ name: 'Color', terms: colors.map((c) => c.name), usedForVariations: false });
  }
  if (sizes.length > 0 && !attributes.some((a) => optionKind(a.name) === 'size')) {
    attributes.push({ name: 'Size', terms: [...sizes], usedForVariations: false });
  }

  return {
    name: product.name,
    slug: product.slug,
    productType: product.productType,
    shortDescription: product.shortDescription,
    description: product.description,
    images: product.images || [],
    imageAlts: product.imageAlts || {},
    categoryId: product.category?.id ?? '',
    tagIds: (product.tags || []).map((t) => t.id),
    featured: product.featured ?? false,
    newArrivalPinned: product.newArrivalPinned ?? false,
    excludeFromNewArrivals: product.excludeFromNewArrivals ?? false,
    visibility: product.visibility,
    price: product.price ? product.price.toFixed(2) : '',
    compareAtPrice: product.compareAtPrice != null ? product.compareAtPrice.toFixed(2) : null,
    saleStartsAt: product.saleStartsAt ?? null,
    saleEndsAt: product.saleEndsAt ?? null,
    taxClass: product.taxClass || '',
    attributes,
    colorSwatches: Object.fromEntries(colors.map((c) => [c.name, c.value])),
    variants: [...(extra.variants || [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        attributes: (v.attributes || {}) as Record<string, string>,
        price: v.price != null ? parseFloat(v.price as string).toFixed(2) : null,
        compareAtPrice:
          v.compareAtPrice != null ? parseFloat(v.compareAtPrice as string).toFixed(2) : null,
        stockQuantity: v.stockQuantity ?? 0,
        inStock: v.inStock ?? true,
        image: v.image || undefined,
        weight: decimalOrNull(v.weight),
        position: v.position ?? 0,
      })),
    sku: product.sku,
    manageStock: product.manageStock ?? true,
    stockQuantity: product.stockQuantity ?? 0,
    inStock: product.inStock ?? true,
    backorderPolicy: product.backorderPolicy,
    lowStockThreshold: product.lowStockThreshold ?? 5,
    weight: decimalOrNull(product.weight),
    lengthIn: decimalOrNull(product.lengthIn),
    widthIn: decimalOrNull(product.widthIn),
    heightIn: decimalOrNull(product.heightIn),
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
