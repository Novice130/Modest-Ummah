/**
 * TaxCloud API Integration
 * Free SST (Streamlined Sales Tax) calculation and filing
 * 
 * Documentation: https://taxcloud.com/support/
 * 
 * SETUP REQUIRED:
 * 1. Sign up at https://taxcloud.com (free account)
 * 2. Get your API Login ID and API Key from the dashboard
 * 3. Add to your .env.local file
 */

// TaxCloud TIC (Taxability Information Codes) for common product categories
export const TaxCloudTICs = {
  GENERAL_MERCHANDISE: '00000', // General - tangible personal property
  CLOTHING: '20010', // Clothing - general
  CLOTHING_ACCESSORIES: '20020', // Clothing accessories
  RELIGIOUS_ITEMS: '31000', // Religious items (may be exempt in some states)
  COSMETICS: '20130', // Cosmetics and perfumes
  HEALTH_PRODUCTS: '51010', // Health products
} as const;

export interface TaxCloudAddress {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip5: string;
  zip4?: string;
}

export interface TaxCloudCartItem {
  index: number;
  itemId: string;
  tic: string;
  price: number;
  qty: number;
}

export interface TaxCloudLookupRequest {
  apiLoginId: string;
  apiKey: string;
  customerId: string;
  cartId: string;
  cartItems: TaxCloudCartItem[];
  origin: TaxCloudAddress;
  destination: TaxCloudAddress;
  deliveredBySeller: boolean;
}

export interface TaxCloudLookupResponse {
  ResponseType: number;
  Messages: string[];
  CartID: string;
  CartItemsResponse: Array<{
    CartItemIndex: number;
    TaxAmount: number;
  }>;
}

export interface TaxCloudCaptureRequest {
  apiLoginId: string;
  apiKey: string;
  customerId: string;
  cartId: string;
  orderId: string;
  dateAuthorized: string;
  dateCaptured: string;
}

/**
 * Business origin address resolved from the environment per call (not at module
 * load, so `next build` can evaluate this module cleanly). Fails loudly when
 * TaxCloud credentials are present without a configured origin address.
 */
export function getTaxCloudOriginAddress(): TaxCloudAddress {
  const required = {
    address1: process.env.TAXCLOUD_ORIGIN_ADDRESS1,
    city: process.env.TAXCLOUD_ORIGIN_CITY,
    state: process.env.TAXCLOUD_ORIGIN_STATE,
    zip5: process.env.TAXCLOUD_ORIGIN_ZIP5,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => `TAXCLOUD_ORIGIN_${key.toUpperCase()}`);

  if (missing.length > 0) {
    throw new Error(
      `TaxCloud origin is not configured. Set ${missing.join(', ')} before calculating tax.`
    );
  }

  return {
    address1: required.address1!.trim(),
    address2: process.env.TAXCLOUD_ORIGIN_ADDRESS2?.trim() || '',
    city: required.city!.trim(),
    state: required.state!.trim(),
    zip5: required.zip5!.trim(),
    zip4: process.env.TAXCLOUD_ORIGIN_ZIP4?.trim() || '',
  };
}

/**
 * Calculate sales tax using TaxCloud API
 */
export async function calculateTax(params: {
  items: Array<{
    id: string;
    price: number;
    quantity: number;
    /** Category slug, e.g. 'rings' or 'abayas'. Empty when uncategorised. */
    category: string;
  }>;
  shippingAddress: {
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
  customerId?: string;
  cartId?: string;
}): Promise<{
  success: boolean;
  totalTax: number;
  itemTaxes: Array<{ itemId: string; taxAmount: number }>;
  error?: string;
}> {
  const apiLoginId = process.env.TAXCLOUD_API_LOGIN_ID;
  const apiKey = process.env.TAXCLOUD_API_KEY;

  // Tax is collected only where the store is registered (has nexus). Anywhere
  // else nothing is charged and TaxCloud is not called.
  const nexusRate = getNexusTaxRate(params.shippingAddress.state);
  if (nexusRate === null) {
    return {
      success: true,
      totalTax: 0,
      itemTaxes: params.items.map((item) => ({ itemId: item.id, taxAmount: 0 })),
    };
  }

  // Without TaxCloud, the configured rate for that state is charged.
  if (!apiLoginId || !apiKey) {
    return flatRateTax(params.items, nexusRate);
  }

  const origin = getTaxCloudOriginAddress();

  // Map items to TaxCloud format
  const cartItems: TaxCloudCartItem[] = params.items.map((item, index) => ({
    index,
    itemId: item.id,
    tic: getTICForProduct(item.category),
    price: item.price,
    qty: item.quantity,
  }));

  // Parse postal code
  const zip5 = params.shippingAddress.postalCode.substring(0, 5);
  const zip4 = params.shippingAddress.postalCode.length > 5 
    ? params.shippingAddress.postalCode.substring(6, 10) 
    : '';

  const destination: TaxCloudAddress = {
    address1: params.shippingAddress.address1,
    address2: params.shippingAddress.address2 || '',
    city: params.shippingAddress.city,
    state: params.shippingAddress.state,
    zip5,
    zip4,
  };

  try {
    const response = await fetch('https://api.taxcloud.com/1.0/TaxCloud/Lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiLoginId,
        apiKey,
        customerId: params.customerId || 'guest',
        cartId: params.cartId || `cart_${Date.now()}`,
        cartItems,
        origin,
        destination,
        deliveredBySeller: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`TaxCloud API error: ${response.status}`);
    }

    const data: TaxCloudLookupResponse = await response.json();

    if (data.ResponseType !== 3) { // 3 = Success
      throw new Error(data.Messages.join(', ') || 'TaxCloud lookup failed');
    }

    const itemTaxes = data.CartItemsResponse.map(item => ({
      itemId: cartItems[item.CartItemIndex].itemId,
      taxAmount: item.TaxAmount,
    }));

    const totalTax = itemTaxes.reduce((sum, item) => sum + item.taxAmount, 0);

    return {
      success: true,
      totalTax: Math.round(totalTax * 100) / 100,
      itemTaxes,
    };
  } catch (error: any) {
    console.error('TaxCloud API error:', error);
    
    // Fall back to the configured rate for this (nexus) state.
    return { ...flatRateTax(params.items, nexusRate), success: false, error: error.message };
  }
}

/**
 * Capture/authorize a tax transaction (call this after payment is confirmed)
 */
export async function captureTax(params: {
  customerId: string;
  cartId: string;
  orderId: string;
}): Promise<{ success: boolean; error?: string }> {
  const apiLoginId = process.env.TAXCLOUD_API_LOGIN_ID;
  const apiKey = process.env.TAXCLOUD_API_KEY;

  if (!apiLoginId || !apiKey) {
    return { success: true }; // Skip if not configured
  }

  const now = new Date().toISOString();

  try {
    const response = await fetch('https://api.taxcloud.com/1.0/TaxCloud/AuthorizedWithCapture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiLoginId,
        apiKey,
        customerId: params.customerId,
        cartId: params.cartId,
        orderId: params.orderId,
        dateAuthorized: now,
        dateCaptured: now,
      }),
    });

    if (!response.ok) {
      throw new Error(`TaxCloud capture error: ${response.status}`);
    }

    const data = await response.json();

    if (data.ResponseType !== 3) {
      throw new Error(data.Messages?.join(', ') || 'TaxCloud capture failed');
    }

    return { success: true };
  } catch (error: any) {
    console.error('TaxCloud capture error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Return/refund a tax transaction
 */
export async function returnTax(params: {
  orderId: string;
  items: Array<{
    index: number;
    itemId: string;
    tic: string;
    price: number;
    qty: number;
  }>;
}): Promise<{ success: boolean; error?: string }> {
  const apiLoginId = process.env.TAXCLOUD_API_LOGIN_ID;
  const apiKey = process.env.TAXCLOUD_API_KEY;

  if (!apiLoginId || !apiKey) {
    return { success: true }; // Skip if not configured
  }

  try {
    const response = await fetch('https://api.taxcloud.com/1.0/TaxCloud/Returned', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiLoginId,
        apiKey,
        orderId: params.orderId,
        cartItems: params.items,
        returnedDate: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`TaxCloud return error: ${response.status}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('TaxCloud return error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Maps a category slug to a TaxCloud TIC.
 *
 * The distinction that matters is clothing vs everything else: several states
 * exempt or reduce tax on apparel, and none of them extend that to jewellery.
 * Filing jewellery as CLOTHING would under-collect, so anything not explicitly
 * apparel falls through to general merchandise.
 *
 * Categories are admin-editable, so this cannot be exhaustive — it matches on
 * slug fragments and defaults safely.
 */
const APPAREL_SLUGS = [
  'abaya',
  'hijab',
  'khimar',
  'jilbab',
  'dress',
  'thobe',
  'kurta',
  'jubba',
  'apparel',
  'clothing',
];

const SLUG_TIC_OVERRIDES: Array<[string, string]> = [
  ['attar', TaxCloudTICs.COSMETICS],
  ['perfume', TaxCloudTICs.COSMETICS],
  ['miswak', TaxCloudTICs.HEALTH_PRODUCTS],
  ['prayer-mat', TaxCloudTICs.RELIGIOUS_ITEMS],
  ['tasbeeh', TaxCloudTICs.RELIGIOUS_ITEMS],
  ['cap', TaxCloudTICs.CLOTHING_ACCESSORIES],
  ['kufi', TaxCloudTICs.CLOTHING_ACCESSORIES],
];

function getTICForProduct(category: string): string {
  const slug = (category || '').toLowerCase();
  if (!slug) return TaxCloudTICs.GENERAL_MERCHANDISE;

  for (const [fragment, tic] of SLUG_TIC_OVERRIDES) {
    if (slug.includes(fragment)) return tic;
  }

  if (APPAREL_SLUGS.some((fragment) => slug.includes(fragment))) {
    return TaxCloudTICs.CLOTHING;
  }

  // Jewellery and anything else the admin invents.
  return TaxCloudTICs.GENERAL_MERCHANDISE;
}

/**
 * States where the store collects sales tax, and the rate it charges there,
 * from SALES_TAX_RATES, e.g. "IL:0.0875". The store is in Romeoville, Illinois
 * and ships from there, so Illinois taxes every Illinois order at the rate of
 * the shipping location (origin sourcing for in-state retailers), whatever the
 * customer's Illinois address. Other states are added only once the store
 * registers there (economic nexus, usually $100,000 of sales into that state).
 * Unset means no state: nothing is charged anywhere, with a warning.
 */
function getNexusTaxRates(): Map<string, number> {
  const raw = process.env.SALES_TAX_RATES?.trim();
  const rates = new Map<string, number>();
  if (!raw) {
    console.warn('SALES_TAX_RATES is not set: no sales tax is being charged');
    return rates;
  }
  for (const part of raw.split(',')) {
    const [state, value] = part.split(':').map((v) => v?.trim());
    const rate = Number(value);
    if (!/^[A-Za-z]{2}$/.test(state || '') || !Number.isFinite(rate) || rate < 0 || rate >= 0.2) {
      throw new Error(`SALES_TAX_RATES entry is invalid: "${part}" (expected e.g. IL:0.0875)`);
    }
    rates.set(state!.toUpperCase(), rate);
  }
  return rates;
}

/** The rate to charge for a destination state, or null where the store has no nexus. */
export function getNexusTaxRate(state: string): number | null {
  return getNexusTaxRates().get((state || '').trim().toUpperCase()) ?? null;
}

function flatRateTax(
  items: Array<{ id: string; price: number; quantity: number }>,
  rate: number
): { success: true; totalTax: number; itemTaxes: Array<{ itemId: string; taxAmount: number }> } {
  const itemTaxes = items.map((item) => ({
    itemId: item.id,
    taxAmount: Math.round(item.price * item.quantity * rate * 100) / 100,
  }));
  const totalTax = Math.round(itemTaxes.reduce((sum, t) => sum + t.taxAmount, 0) * 100) / 100;
  return { success: true, totalTax, itemTaxes };
}

/**
 * Verify a destination address with TaxCloud
 */
export async function verifyAddress(address: {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
}): Promise<{
  success: boolean;
  verified: boolean;
  correctedAddress?: TaxCloudAddress;
  error?: string;
}> {
  const apiLoginId = process.env.TAXCLOUD_API_LOGIN_ID;
  const apiKey = process.env.TAXCLOUD_API_KEY;

  if (!apiLoginId || !apiKey) {
    return { success: true, verified: true }; // Skip verification if not configured
  }

  const zip5 = address.postalCode.substring(0, 5);
  const zip4 = address.postalCode.length > 5 ? address.postalCode.substring(6, 10) : '';

  try {
    const response = await fetch('https://api.taxcloud.com/1.0/TaxCloud/VerifyAddress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiLoginId,
        apiKey,
        address1: address.address1,
        address2: address.address2 || '',
        city: address.city,
        state: address.state,
        zip5,
        zip4,
      }),
    });

    if (!response.ok) {
      throw new Error(`Address verification error: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      verified: data.ErrNumber === 0,
      correctedAddress: data.ErrNumber === 0 ? {
        address1: data.Address1,
        address2: data.Address2,
        city: data.City,
        state: data.State,
        zip5: data.Zip5,
        zip4: data.Zip4,
      } : undefined,
      error: data.ErrNumber !== 0 ? data.ErrDescription : undefined,
    };
  } catch (error: any) {
    console.error('Address verification error:', error);
    return { success: false, verified: false, error: error.message };
  }
}
