import { getDb } from '@/lib/db';
import { products, productVariants } from '@/lib/schema';
import { eq, sql } from 'drizzle-orm';
import type { OrderItem } from '@/lib/schema';
import { findVariantByOptions } from '@/lib/variant-options';

/**
 * Inventory mutations on payment. WooCommerce's defining behavior:
 * stock drops when payment succeeds (not at order placement), and a
 * refund restocks. The webhook calls these one line at a time, each under a
 * lib/webhook-ledger.ts step, which is what prevents a Stripe retry from
 * double-decrementing. A failed write therefore has to throw.
 *
 * Rules, matching the product builder's save path:
 *  - a product with "Manage stock" off is never decremented, and its manual
 *    in-stock flag is left alone (it used to flip to out-of-stock on the
 *    first sale because its untracked quantity is 0);
 *  - in_stock = quantity > 0, or backorders are allowed;
 *  - the update is a single atomic statement, so two concurrent webhooks
 *    cannot both read the same starting quantity;
 *  - a variant sale also refreshes the parent's total and in-stock flag,
 *    which the storefront reads.
 */

/**
 * The web shop sells a variable product with Size/Color pickers and no
 * variant id on the line. Find the one variant those picks name, so the sale
 * lands on the variant: the parent total is re-derived from the variants on
 * every save and variant sale, which would otherwise undo it.
 */
async function matchVariantByOptions(productId: string, item: OrderItem): Promise<string | undefined> {
  const db = getDb();
  const rows = await db
    .select({ id: productVariants.id, attributes: productVariants.attributes })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
  return findVariantByOptions(rows, item)?.id;
}

/**
 * Apply a stock change for each line item. `sign` 1 decrements (payment),
 * -1 restocks (refund). Returns the items that could not be fully
 * satisfied so the caller can log an oversell. `failed` marks a line whose
 * stock write did not happen.
 */
export async function applyStockDelta(
  items: OrderItem[],
  sign: 1 | -1
): Promise<Array<{ item: OrderItem; available: number; failed?: boolean }>> {
  const db = getDb();
  const oversold: Array<{ item: OrderItem; available: number; failed?: boolean }> = [];

  for (const item of items) {
    if (!item.productId) continue;
    const delta = sign * item.quantity;

    try {
      const [product] = await db
        .select({
          id: products.id,
          manageStock: products.manageStock,
          backorderPolicy: products.backorderPolicy,
          productType: products.productType,
        })
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);

      if (!product) {
        oversold.push({ item, available: 0 });
        continue;
      }
      if (product.manageStock === false) continue;

      const backorders = (product.backorderPolicy ?? 'no') !== 'no';
      const inStockExpr = (column: typeof products.stockQuantity | typeof productVariants.stockQuantity) =>
        backorders
          ? sql`true`
          : sql`GREATEST(0, coalesce(${column}, 0) - ${delta}) > 0`;

      const variantId =
        item.variantId ||
        (product.productType === 'variable' ? await matchVariantByOptions(product.id, item) : undefined);

      if (variantId) {
        const [before] = await db
          .select({ qty: productVariants.stockQuantity })
          .from(productVariants)
          .where(eq(productVariants.id, variantId))
          .limit(1);
        const [variant] = await db
          .update(productVariants)
          .set({
            stockQuantity: sql`GREATEST(0, coalesce(${productVariants.stockQuantity}, 0) - ${delta})`,
            inStock: inStockExpr(productVariants.stockQuantity),
          })
          .where(eq(productVariants.id, variantId))
          .returning({ id: productVariants.id });

        if (!variant) {
          oversold.push({ item, available: 0 });
          continue;
        }
        if (sign === 1 && !backorders && (before?.qty ?? 0) < item.quantity) {
          oversold.push({ item, available: before?.qty ?? 0 });
        }

        // The parent row carries the total the storefront shows. It is derived
        // and re-derived on the next sale or save, so failing here must not
        // report the line as failed: the variant write above already landed,
        // and a retry would decrement it twice.
        try {
          await db
            .update(products)
            .set({
              stockQuantity: sql`(SELECT coalesce(sum(${productVariants.stockQuantity}), 0) FROM ${productVariants} WHERE ${productVariants.productId} = ${product.id})`,
              inStock: sql`EXISTS (SELECT 1 FROM ${productVariants} WHERE ${productVariants.productId} = ${product.id} AND ${productVariants.inStock} = true)`,
            })
            .where(eq(products.id, product.id));
        } catch (error) {
          console.error('Failed to refresh parent stock for product:', product.id, error);
        }
      } else {
        const [before] = await db
          .select({ qty: products.stockQuantity })
          .from(products)
          .where(eq(products.id, product.id))
          .limit(1);
        await db
          .update(products)
          .set({
            stockQuantity: sql`GREATEST(0, coalesce(${products.stockQuantity}, 0) - ${delta})`,
            inStock: inStockExpr(products.stockQuantity),
          })
          .where(eq(products.id, product.id));

        if (sign === 1 && !backorders && (before?.qty ?? 0) < item.quantity) {
          oversold.push({ item, available: before?.qty ?? 0 });
        }
      }
    } catch (error) {
      console.error('Failed to apply stock delta for item:', item.productId, error);
      oversold.push({ item, available: 0, failed: true });
    }
  }

  return oversold;
}

function throwIfFailed(results: Array<{ failed?: boolean }>) {
  const count = results.filter((r) => r.failed).length;
  if (count > 0) throw new Error(`Stock update failed for ${count} line(s)`);
}

/**
 * Decrement on payment success. Oversells are logged, not fatal — the
 * customer has already paid; the order must complete. A failed write throws
 * so the webhook can retry it.
 */
export async function decrementStock(items: OrderItem[]) {
  const oversold = await applyStockDelta(items, 1);
  throwIfFailed(oversold);
  for (const { item, available } of oversold) {
    console.error(
      `OVERSOLD: ${item.name} (product ${item.productId}${item.variantId ? ` variant ${item.variantId}` : ''}) — wanted ${item.quantity}, had ${available}`
    );
  }
}

/**
 * Restock on refund. A failed write throws so the webhook can retry it.
 */
export async function restock(items: OrderItem[]) {
  throwIfFailed(await applyStockDelta(items, -1));
}
