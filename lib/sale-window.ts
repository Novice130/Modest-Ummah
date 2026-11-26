/**
 * The price a line is charged given its sale window. `price` is the sale price
 * and `compareAtPrice` the regular one, so outside the window the customer pays
 * compareAtPrice. Same window test as isOnSale in lib/api/v1/serializers.ts.
 *
 * A variant with its own price uses its own compareAtPrice; one that inherits
 * the parent price uses the parent's. The window itself lives on the product.
 */
export function priceForSaleWindow(
  price: number,
  product: {
    compareAtPrice?: string | null;
    saleStartsAt?: Date | string | null;
    saleEndsAt?: Date | string | null;
  },
  variant?: { price?: string | null; compareAtPrice?: string | null }
): number {
  const hasOwnPrice = variant?.price !== null && variant?.price !== undefined;
  const raw = hasOwnPrice ? variant?.compareAtPrice : product.compareAtPrice;
  const regular = raw ? parseFloat(raw) : NaN;
  if (!Number.isFinite(regular) || regular <= price) return price;

  const now = Date.now();
  const notStarted = product.saleStartsAt && new Date(product.saleStartsAt).getTime() > now;
  const ended = product.saleEndsAt && new Date(product.saleEndsAt).getTime() < now;
  return notStarted || ended ? regular : price;
}
