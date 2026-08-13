import { getDb } from '@/lib/db';
import { products, productVariants } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import type { OrderItem } from '@/lib/schema';

/**
 * Inventory mutations on payment. WooCommerce's defining behavior:
 * stock drops when payment succeeds (not at order placement), and a
 * refund restocks. The webhook idempotency table (stripe_events) is the
 * only thing that prevents a Stripe retry from double-decrementing.
 */

/**
 * Decrement stock for each line item. `quantity` is signed: negative
 * values restock (used by charge.refunded). Returns the items that could
 * not be fully satisfied so the caller can log an oversell.
 */
export async function applyStockDelta(
  items: OrderItem[],
  sign: 1 | -1
): Promise<Array<{ item: OrderItem; available: number }>> {
  const db = getDb();
  const oversold: Array<{ item: OrderItem; available: number }> = [];

  for (const item of items) {
    if (!item.productId) continue;

    try {
      if (item.variantId) {
        const [variant] = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId))
          .limit(1);

        if (!variant) {
          oversold.push({ item, available: 0 });
          continue;
        }

        const newQty = Math.max(
          0,
          (variant.stockQuantity || 0) - sign * item.quantity
        );
        await db
          .update(productVariants)
          .set({
            stockQuantity: newQty,
            inStock: newQty > 0,
          })
          .where(eq(productVariants.id, variant.id));

        if (sign === 1 && newQty < 0) {
          oversold.push({ item, available: variant.stockQuantity || 0 });
        }
      } else {
        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);

        if (!product) {
          oversold.push({ item, available: 0 });
          continue;
        }

        const newQty = Math.max(
          0,
          (product.stockQuantity || 0) - sign * item.quantity
        );
        await db
          .update(products)
          .set({
            stockQuantity: newQty,
            inStock: newQty > 0,
          })
          .where(eq(products.id, product.id));

        if (sign === 1 && newQty < 0) {
          oversold.push({ item, available: product.stockQuantity || 0 });
        }
      }
    } catch (error) {
      console.error('Failed to apply stock delta for item:', item.productId, error);
      oversold.push({ item, available: 0 });
    }
  }

  return oversold;
}

/**
 * Decrement on payment success. Oversells are logged, not fatal — the
 * customer has already paid; the order must complete.
 */
export async function decrementStock(items: OrderItem[]) {
  const oversold = await applyStockDelta(items, 1);
  for (const { item, available } of oversold) {
    console.error(
      `OVERSOLD: ${item.name} (product ${item.productId}${item.variantId ? ` variant ${item.variantId}` : ''}) — wanted ${item.quantity}, had ${available}`
    );
  }
}

/**
 * Restock on refund.
 */
export async function restock(items: OrderItem[]) {
  await applyStockDelta(items, -1);
}
