/**
 * Pirate Ship API Integration
 * USPS Commercial Rates, Free Pickup Scheduling, and Tracking
 * 
 * Documentation: https://docs.pirateship.com/
 * 
 * SETUP REQUIRED:
 * 1. Sign up at https://www.pirateship.com (free account)
 * 2. Go to Settings > API and generate an API key
 * 3. Add to your .env.local file
 * 
 * Features:
 * - USPS Commercial Plus pricing (cheapest rates)
 * - Free package pickup scheduling
 * - Real-time tracking
 * - Address verification
 * - Label generation
 */

const PIRATE_SHIP_API_URL = 'https://api.pirateship.com/v1';

export interface ShippingAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface PackageDimensions {
  length: number; // inches
  width: number;  // inches
  height: number; // inches
  weight: number; // ounces
}

export interface ShippingRate {
  carrier: string;
  service: string;
  serviceName: string;
  rate: number;
  estimatedDays: number;
  deliveryDate?: string;
  guaranteed?: boolean;
}

export interface ShipmentLabel {
  id: string;
  trackingNumber: string;
  labelUrl: string;
  carrier: string;
  service: string;
  rate: number;
  refundable: boolean;
}

// Default origin address (your business)
const ORIGIN_ADDRESS: ShippingAddress = {
  name: process.env.PIRATESHIP_ORIGIN_NAME || 'Modest Ummah',
  company: process.env.PIRATESHIP_ORIGIN_COMPANY || '',
  street1: process.env.PIRATESHIP_ORIGIN_STREET1 || '123 Business St',
  street2: process.env.PIRATESHIP_ORIGIN_STREET2 || '',
  city: process.env.PIRATESHIP_ORIGIN_CITY || 'New York',
  state: process.env.PIRATESHIP_ORIGIN_STATE || 'NY',
  zip: process.env.PIRATESHIP_ORIGIN_ZIP || '10001',
  country: 'US',
  phone: process.env.PIRATESHIP_ORIGIN_PHONE || '',
  email: process.env.PIRATESHIP_ORIGIN_EMAIL || '',
};

// Standard package sizes for products
export const PACKAGE_PRESETS = {
  SMALL_FLAT_RATE: { length: 8.625, width: 5.375, height: 1.625, weight: 16 },
  MEDIUM_FLAT_RATE: { length: 11, width: 8.5, height: 5.5, weight: 32 },
  LARGE_FLAT_RATE: { length: 12, width: 12, height: 5.5, weight: 64 },
  POLY_MAILER_SMALL: { length: 10, width: 7, height: 1, weight: 8 },
  POLY_MAILER_MEDIUM: { length: 14.5, width: 10, height: 2, weight: 16 },
  POLY_MAILER_LARGE: { length: 19, width: 15, height: 3, weight: 32 },
};

/**
 * Get authorization header
 */
function getAuthHeader(): Record<string, string> {
  const apiKey = process.env.PIRATESHIP_API_KEY;
  if (!apiKey) {
    throw new Error('PIRATESHIP_API_KEY is not configured');
  }
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Get shipping rates for a package
 */
export async function getShippingRates(params: {
  destination: ShippingAddress;
  package: PackageDimensions;
  origin?: ShippingAddress;
}): Promise<{
  success: boolean;
  rates: ShippingRate[];
  error?: string;
}> {
  const apiKey = process.env.PIRATESHIP_API_KEY;

  // If Pirate Ship is not configured, return estimated rates
  if (!apiKey) {
    console.warn('Pirate Ship not configured, using estimated rates');
    return {
      success: true,
      rates: getEstimatedRates(params.destination.state, params.package.weight),
    };
  }

  try {
    const response = await fetch(`${PIRATE_SHIP_API_URL}/rates`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        from_address: params.origin || ORIGIN_ADDRESS,
        to_address: params.destination,
        parcel: {
          length: params.package.length,
          width: params.package.width,
          height: params.package.height,
          weight: params.package.weight,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    const rates: ShippingRate[] = data.rates.map((rate: any) => ({
      carrier: rate.carrier || 'USPS',
      service: rate.service,
      serviceName: rate.service_name || rate.service,
      rate: rate.rate,
      estimatedDays: rate.estimated_days || rate.delivery_days,
      deliveryDate: rate.delivery_date,
      guaranteed: rate.guaranteed || false,
    }));

    // Sort by price
    rates.sort((a, b) => a.rate - b.rate);

    return { success: true, rates };
  } catch (error: any) {
    console.error('Pirate Ship rates error:', error);
    return {
      success: false,
      rates: getEstimatedRates(params.destination.state, params.package.weight),
      error: error.message,
    };
  }
}

/**
 * Create a shipping label
 */
export async function createShipment(params: {
  destination: ShippingAddress;
  package: PackageDimensions;
  service: string;
  orderId: string;
  origin?: ShippingAddress;
}): Promise<{
  success: boolean;
  shipment?: ShipmentLabel;
  error?: string;
}> {
  const apiKey = process.env.PIRATESHIP_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'Pirate Ship API is not configured',
    };
  }

  try {
    const response = await fetch(`${PIRATE_SHIP_API_URL}/shipments`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        from_address: params.origin || ORIGIN_ADDRESS,
        to_address: params.destination,
        parcel: {
          length: params.package.length,
          width: params.package.width,
          height: params.package.height,
          weight: params.package.weight,
        },
        service: params.service,
        reference: params.orderId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      shipment: {
        id: data.id,
        trackingNumber: data.tracking_number,
        labelUrl: data.label_url,
        carrier: data.carrier || 'USPS',
        service: data.service,
        rate: data.rate,
        refundable: data.refundable ?? true,
      },
    };
  } catch (error: any) {
    console.error('Pirate Ship create shipment error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get tracking information for a shipment
 */
export async function getTracking(trackingNumber: string): Promise<{
  success: boolean;
  tracking?: {
    status: string;
    statusDescription: string;
    estimatedDelivery?: string;
    deliveredAt?: string;
    events: Array<{
      timestamp: string;
      status: string;
      location?: string;
      description: string;
    }>;
  };
  error?: string;
}> {
  const apiKey = process.env.PIRATESHIP_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'Pirate Ship API is not configured',
    };
  }

  try {
    const response = await fetch(`${PIRATE_SHIP_API_URL}/tracking/${trackingNumber}`, {
      method: 'GET',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      tracking: {
        status: data.status,
        statusDescription: data.status_description || data.status,
        estimatedDelivery: data.estimated_delivery,
        deliveredAt: data.delivered_at,
        events: (data.events || []).map((event: any) => ({
          timestamp: event.timestamp || event.datetime,
          status: event.status,
          location: event.location,
          description: event.description || event.message,
        })),
      },
    };
  } catch (error: any) {
    console.error('Pirate Ship tracking error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Schedule a free USPS pickup
 */
export async function schedulePickup(params: {
  pickupDate: string; // YYYY-MM-DD
  packageCount: number;
  totalWeight: number; // ounces
  pickupLocation?: 'front_door' | 'back_door' | 'side_door' | 'mailbox' | 'other';
  instructions?: string;
}): Promise<{
  success: boolean;
  confirmation?: string;
  error?: string;
}> {
  const apiKey = process.env.PIRATESHIP_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'Pirate Ship API is not configured',
    };
  }

  try {
    const response = await fetch(`${PIRATE_SHIP_API_URL}/pickups`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({
        pickup_date: params.pickupDate,
        package_count: params.packageCount,
        total_weight: params.totalWeight,
        pickup_location: params.pickupLocation || 'front_door',
        special_instructions: params.instructions || '',
        address: ORIGIN_ADDRESS,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      confirmation: data.confirmation_number || data.id,
    };
  } catch (error: any) {
    console.error('Pirate Ship pickup error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancel a shipment and get refund
 */
export async function cancelShipment(shipmentId: string): Promise<{
  success: boolean;
  refunded: boolean;
  error?: string;
}> {
  const apiKey = process.env.PIRATESHIP_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      refunded: false,
      error: 'Pirate Ship API is not configured',
    };
  }

  try {
    const response = await fetch(`${PIRATE_SHIP_API_URL}/shipments/${shipmentId}/refund`, {
      method: 'POST',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      refunded: data.refunded ?? true,
    };
  } catch (error: any) {
    console.error('Pirate Ship cancel error:', error);
    return { success: false, refunded: false, error: error.message };
  }
}

/**
 * Verify and normalize an address
 */
export async function verifyAddress(address: ShippingAddress): Promise<{
  success: boolean;
  verified: boolean;
  normalizedAddress?: ShippingAddress;
  messages?: string[];
  error?: string;
}> {
  const apiKey = process.env.PIRATESHIP_API_KEY;

  if (!apiKey) {
    // Skip verification if not configured
    return { success: true, verified: true };
  }

  try {
    const response = await fetch(`${PIRATE_SHIP_API_URL}/addresses/verify`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(address),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      verified: data.verified ?? data.valid,
      normalizedAddress: data.normalized || data.address,
      messages: data.messages || [],
    };
  } catch (error: any) {
    console.error('Pirate Ship address verification error:', error);
    return { success: false, verified: false, error: error.message };
  }
}

/**
 * Calculate package dimensions based on items
 */
export function calculatePackageDimensions(items: Array<{
  weight?: number; // ounces per item
  quantity: number;
}>): PackageDimensions {
  const totalWeight = items.reduce((sum, item) => {
    return sum + (item.weight || 8) * item.quantity; // Default 8oz per item
  }, 0);

  // Add 2oz for packaging
  const packageWeight = totalWeight + 2;

  // Select appropriate package size
  if (packageWeight <= 16) {
    return { ...PACKAGE_PRESETS.POLY_MAILER_SMALL, weight: packageWeight };
  } else if (packageWeight <= 32) {
    return { ...PACKAGE_PRESETS.POLY_MAILER_MEDIUM, weight: packageWeight };
  } else if (packageWeight <= 48) {
    return { ...PACKAGE_PRESETS.POLY_MAILER_LARGE, weight: packageWeight };
  } else {
    return { ...PACKAGE_PRESETS.MEDIUM_FLAT_RATE, weight: packageWeight };
  }
}

/**
 * Get estimated shipping rates (fallback when API not configured)
 */
function getEstimatedRates(destinationState: string, weight: number): ShippingRate[] {
  // Determine zone (simplified)
  const eastCoast = ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE', 'MD', 'DC', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL'];
  const midwest = ['OH', 'MI', 'IN', 'WI', 'IL', 'MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS'];
  
  const zone = eastCoast.includes(destinationState.toUpperCase()) ? 'near' 
    : midwest.includes(destinationState.toUpperCase()) ? 'medium' 
    : 'far';

  const zoneMultiplier = { near: 1, medium: 1.3, far: 1.6 };
  const baseRate = weight <= 16 ? 4.99 : weight <= 32 ? 7.99 : 12.99;

  return [
    {
      carrier: 'USPS',
      service: 'usps_ground_advantage',
      serviceName: 'USPS Ground Advantage',
      rate: Math.round(baseRate * zoneMultiplier[zone] * 100) / 100,
      estimatedDays: zone === 'near' ? 3 : zone === 'medium' ? 5 : 7,
      guaranteed: false,
    },
    {
      carrier: 'USPS',
      service: 'usps_priority',
      serviceName: 'USPS Priority Mail',
      rate: Math.round((baseRate + 4) * zoneMultiplier[zone] * 100) / 100,
      estimatedDays: zone === 'near' ? 2 : zone === 'medium' ? 3 : 4,
      guaranteed: false,
    },
    {
      carrier: 'USPS',
      service: 'usps_priority_express',
      serviceName: 'USPS Priority Mail Express',
      rate: Math.round((baseRate + 20) * zoneMultiplier[zone] * 100) / 100,
      estimatedDays: zone === 'near' ? 1 : 2,
      guaranteed: true,
    },
  ];
}

/**
 * Get free shipping threshold info
 */
export function getFreeShippingInfo(subtotal: number): {
  eligible: boolean;
  threshold: number;
  amountNeeded: number;
} {
  const threshold = 75; // $75 for free shipping
  return {
    eligible: subtotal >= threshold,
    threshold,
    amountNeeded: Math.max(0, threshold - subtotal),
  };
}
