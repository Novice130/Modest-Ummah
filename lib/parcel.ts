import { getDb } from '@/lib/db';
import { products, productVariants } from '@/lib/schema';
import { inArray } from 'drizzle-orm';
import { PACKAGE_PRESETS, type PackageDimensions } from '@/lib/shipping';

/**
 * Single source of truth for parcel weight and dimensions.
 *
 * Before this existed the same "8 oz per item" guess was hardcoded in five
 * places with two different box sizes, so the rate quoted at checkout and the
 * rate charged could disagree — and any label bought downstream was priced at
 * a fabricated weight. Products and variants have carried real weight and
 * L/W/H columns since the product-builder work; this reads them.
 */

/** Fallback per-unit weight, in ounces, when a product has no weight set. */
export const DEFAULT_ITEM_WEIGHT_OZ = 8;

/** Packaging tare added to every parcel, in ounces. */
export const PACKAGING_TARE_OZ = 2;

/** USPS caps Ground Advantage / Priority at 70 lb. */
const MAX_PARCEL_OZ = 70 * 16;

export interface ParcelInput {
  productId?: string;
  variantId?: string;
  quantity: number;
  /** Pre-resolved per-unit weight in oz. Skips the DB lookup when present. */
  weightOz?: number;
}

/**
 * Choose a box for a given weight. Mirrors the previous
 * calculatePackageDimensions ladder so quotes stay comparable.
 */
function presetForWeight(weightOz: number): PackageDimensions {
  if (weightOz <= 16) return { ...PACKAGE_PRESETS.POLY_MAILER_SMALL, weight: weightOz };
  if (weightOz <= 32) return { ...PACKAGE_PRESETS.POLY_MAILER_MEDIUM, weight: weightOz };
  if (weightOz <= 48) return { ...PACKAGE_PRESETS.POLY_MAILER_LARGE, weight: weightOz };
  return { ...PACKAGE_PRESETS.MEDIUM_FLAT_RATE, weight: weightOz };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolve per-unit weights for a set of cart/order lines.
 *
 * Precedence: explicit weightOz on the line (an order's snapshot) → variant
 * weight → parent product weight → DEFAULT_ITEM_WEIGHT_OZ.
 */
export async function resolveItemWeights(
  items: ParcelInput[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();

  const needsLookup = items.some(
    (i) => toNumber(i.weightOz) === null && (i.productId || i.variantId)
  );

  let productById = new Map<string, { weight: unknown }>();
  let variantById = new Map<string, { weight: unknown; productId: string }>();

  if (needsLookup) {
    const db = getDb();

    const productIds = [
      ...new Set(items.map((i) => i.productId).filter(Boolean)),
    ] as string[];
    const variantIds = [
      ...new Set(items.map((i) => i.variantId).filter(Boolean)),
    ] as string[];

    const [productRows, variantRows] = await Promise.all([
      productIds.length
        ? db
            .select({ id: products.id, weight: products.weight })
            .from(products)
            .where(inArray(products.id, productIds))
        : Promise.resolve([]),
      variantIds.length
        ? db
            .select({
              id: productVariants.id,
              weight: productVariants.weight,
              productId: productVariants.productId,
            })
            .from(productVariants)
            .where(inArray(productVariants.id, variantIds))
        : Promise.resolve([]),
    ]);

    productById = new Map(productRows.map((r) => [r.id, { weight: r.weight }]));
    variantById = new Map(
      variantRows.map((r) => [r.id, { weight: r.weight, productId: r.productId }])
    );
  }

  items.forEach((item, index) => {
    const explicit = toNumber(item.weightOz);
    if (explicit !== null) {
      out.set(index, explicit);
      return;
    }

    if (item.variantId) {
      const variant = variantById.get(item.variantId);
      const variantWeight = toNumber(variant?.weight);
      if (variantWeight !== null) {
        out.set(index, variantWeight);
        return;
      }
      // Variant with no weight of its own inherits the parent product's.
      const parentId = variant?.productId || item.productId;
      const parentWeight = parentId ? toNumber(productById.get(parentId)?.weight) : null;
      out.set(index, parentWeight ?? DEFAULT_ITEM_WEIGHT_OZ);
      return;
    }

    const productWeight = item.productId
      ? toNumber(productById.get(item.productId)?.weight)
      : null;
    out.set(index, productWeight ?? DEFAULT_ITEM_WEIGHT_OZ);
  });

  return out;
}

/**
 * Compute the parcel for a set of lines, reading real product/variant weights.
 * Dimensions come from the largest per-product box in the order when products
 * declare L/W/H, otherwise from the weight-based preset ladder.
 */
export async function computeParcel(items: ParcelInput[]): Promise<PackageDimensions> {
  const weights = await resolveItemWeights(items);

  const contentWeight = items.reduce((sum, item, index) => {
    const qty = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    return sum + (weights.get(index) ?? DEFAULT_ITEM_WEIGHT_OZ) * qty;
  }, 0);

  const totalWeight = Math.min(
    Math.max(contentWeight + PACKAGING_TARE_OZ, 1),
    MAX_PARCEL_OZ
  );

  const parcel = presetForWeight(totalWeight);

  // If any product in the order declares explicit dimensions, the box has to
  // be at least large enough to hold it.
  const dims = await largestDeclaredDimensions(items);
  if (dims) {
    return {
      length: Math.max(parcel.length, dims.length),
      width: Math.max(parcel.width, dims.width),
      height: Math.max(parcel.height, dims.height),
      weight: totalWeight,
    };
  }

  return parcel;
}

async function largestDeclaredDimensions(
  items: ParcelInput[]
): Promise<{ length: number; width: number; height: number } | null> {
  const productIds = [
    ...new Set(items.map((i) => i.productId).filter(Boolean)),
  ] as string[];
  if (productIds.length === 0) return null;

  const db = getDb();
  const rows = await db
    .select({
      lengthIn: products.lengthIn,
      widthIn: products.widthIn,
      heightIn: products.heightIn,
    })
    .from(products)
    .where(inArray(products.id, productIds));

  let length = 0;
  let width = 0;
  let height = 0;

  for (const row of rows) {
    length = Math.max(length, toNumber(row.lengthIn) ?? 0);
    width = Math.max(width, toNumber(row.widthIn) ?? 0);
    height = Math.max(height, toNumber(row.heightIn) ?? 0);
  }

  if (length <= 0 || width <= 0 || height <= 0) return null;
  return { length, width, height };
}

/**
 * Synchronous variant for callers that already hold per-unit weights (order
 * line items carry a weightOz snapshot). No DB access.
 */
export function computeParcelFromWeights(
  items: Array<{ weightOz?: number; quantity: number }>
): PackageDimensions {
  const contentWeight = items.reduce((sum, item) => {
    const qty = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    const w = toNumber(item.weightOz) ?? DEFAULT_ITEM_WEIGHT_OZ;
    return sum + w * qty;
  }, 0);

  const totalWeight = Math.min(
    Math.max(contentWeight + PACKAGING_TARE_OZ, 1),
    MAX_PARCEL_OZ
  );
  return presetForWeight(totalWeight);
}
