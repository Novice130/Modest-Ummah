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

// Your business origin address (shipping from)
const ORIGIN_ADDRESS: TaxCloudAddress = {
  address1: process.env.TAXCLOUD_ORIGIN_ADDRESS1 || '123 Business St',
  address2: process.env.TAXCLOUD_ORIGIN_ADDRESS2 || '',
  city: process.env.TAXCLOUD_ORIGIN_CITY || 'New York',
  state: process.env.TAXCLOUD_ORIGIN_STATE || 'NY',
  zip5: process.env.TAXCLOUD_ORIGIN_ZIP5 || '10001',
  zip4: process.env.TAXCLOUD_ORIGIN_ZIP4 || '',
};

/**
 * Calculate sales tax using TaxCloud API
 */
export async function calculateTax(params: {
  items: Array<{
    id: string;
    price: number;
    quantity: number;
    category: 'men' | 'women' | 'accessories';
    subcategory?: string;
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

  // If TaxCloud is not configured, fall back to estimate
  if (!apiLoginId || !apiKey) {
    console.warn('TaxCloud not configured, using estimated tax rate');
    const subtotal = params.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const estimatedRate = getEstimatedTaxRate(params.shippingAddress.state);
    return {
      success: true,
      totalTax: Math.round(subtotal * estimatedRate * 100) / 100,
      itemTaxes: params.items.map(item => ({
        itemId: item.id,
        taxAmount: Math.round(item.price * item.quantity * estimatedRate * 100) / 100,
      })),
    };
  }

  // Map items to TaxCloud format
  const cartItems: TaxCloudCartItem[] = params.items.map((item, index) => ({
    index,
    itemId: item.id,
    tic: getTICForProduct(item.category, item.subcategory),
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
        origin: ORIGIN_ADDRESS,
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
    
    // Fall back to estimated tax
    const subtotal = params.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const estimatedRate = getEstimatedTaxRate(params.shippingAddress.state);
    
    return {
      success: false,
      totalTax: Math.round(subtotal * estimatedRate * 100) / 100,
      itemTaxes: params.items.map(item => ({
        itemId: item.id,
        taxAmount: Math.round(item.price * item.quantity * estimatedRate * 100) / 100,
      })),
      error: error.message,
    };
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
 * Get TIC code based on product category
 */
function getTICForProduct(category: string, subcategory?: string): string {
  // Map subcategories to specific TICs
  const subcategoryMap: Record<string, string> = {
    'attar': TaxCloudTICs.COSMETICS,
    'perfumes': TaxCloudTICs.COSMETICS,
    'miswak': TaxCloudTICs.HEALTH_PRODUCTS,
  };

  if (subcategory) {
    const lowerSub = subcategory.toLowerCase();
    for (const [key, tic] of Object.entries(subcategoryMap)) {
      if (lowerSub.includes(key)) {
        return tic;
      }
    }
  }

  // Map main categories
  switch (category) {
    case 'men':
    case 'women':
      return TaxCloudTICs.CLOTHING;
    case 'accessories':
      return TaxCloudTICs.CLOTHING_ACCESSORIES;
    default:
      return TaxCloudTICs.GENERAL_MERCHANDISE;
  }
}

/**
 * Estimated tax rates by state (fallback when TaxCloud is not configured)
 */
function getEstimatedTaxRate(state: string): number {
  const rates: Record<string, number> = {
    'AL': 0.04, 'AK': 0.00, 'AZ': 0.056, 'AR': 0.065, 'CA': 0.0725,
    'CO': 0.029, 'CT': 0.0635, 'DE': 0.00, 'FL': 0.06, 'GA': 0.04,
    'HI': 0.04, 'ID': 0.06, 'IL': 0.0625, 'IN': 0.07, 'IA': 0.06,
    'KS': 0.065, 'KY': 0.06, 'LA': 0.0445, 'ME': 0.055, 'MD': 0.06,
    'MA': 0.0625, 'MI': 0.06, 'MN': 0.06875, 'MS': 0.07, 'MO': 0.04225,
    'MT': 0.00, 'NE': 0.055, 'NV': 0.0685, 'NH': 0.00, 'NJ': 0.06625,
    'NM': 0.05125, 'NY': 0.08, 'NC': 0.0475, 'ND': 0.05, 'OH': 0.0575,
    'OK': 0.045, 'OR': 0.00, 'PA': 0.06, 'RI': 0.07, 'SC': 0.06,
    'SD': 0.045, 'TN': 0.07, 'TX': 0.0625, 'UT': 0.0485, 'VT': 0.06,
    'VA': 0.053, 'WA': 0.065, 'WV': 0.06, 'WI': 0.05, 'WY': 0.04,
    'DC': 0.06,
  };

  return rates[state.toUpperCase()] || 0.07; // Default 7% if state not found
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
