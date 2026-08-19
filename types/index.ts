// Product types
export type ProductType = 'simple' | 'variable';
export type ProductStatus = 'draft' | 'pending' | 'scheduled' | 'published';
export type ProductVisibility = 'public' | 'hidden' | 'search_only';
export type BackorderPolicy = 'no' | 'notify' | 'yes';

/**
 * A category as a product carries it. `path` runs root-first and includes the
 * category itself, so a breadcrumb is `path.map(p => p.name).join(' / ')` and
 * the top-level section is `path[0]`.
 */
export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
  path: Array<{ id: string; name: string; slug: string }>;
}

export interface TagRef {
  id: string;
  name: string;
  slug: string;
}

/** A node in the editable category tree. */
export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string;
  image: string | null;
  position: number;
  children: CategoryNode[];
  /** Products attached to this exact node. Only populated by admin reads. */
  productCount?: number;
}

/** Per-image intrinsic size plus a base64 blur placeholder. */
export interface ImageMeta {
  w: number;
  h: number;
  lqip: string;
}

export interface Product {
  id: string;
  created: string;
  updated: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice?: number;
  /** Null when the category was deleted out from under the product. */
  category: CategoryRef | null;
  images: string[];
  colors: ProductColor[];
  sizes: string[];
  tags: TagRef[];
  featured: boolean;
  newArrivalPinned: boolean;
  excludeFromNewArrivals: boolean;
  inStock: boolean;
  stockQuantity: number;
  sku: string;
  weight?: number;
  dimensions?: string;
  similarProducts: string[];
  productType: ProductType;
  status: ProductStatus;
  visibility: ProductVisibility;
  publishedAt?: string;
  saleStartsAt?: string;
  saleEndsAt?: string;
  manageStock: boolean;
  backorderPolicy: BackorderPolicy;
  lowStockThreshold: number;
  shippingClass?: string;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  taxClass?: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  upsellIds: string[];
  crossSellIds: string[];
  imageAlts: Record<string, string>;
  /** Keyed by image URL. Empty for images uploaded before this was tracked. */
  imageMeta: Record<string, ImageMeta>;
}

export interface ProductColor {
  name: string;
  value: string;
  image?: string;
}

// User types
export interface User {
  id: string;
  created: string;
  updated: string;
  email: string;
  name: string;
  avatar?: string;
  verified: boolean;
}

// Admin types
export interface Admin {
  id: string;
  created: string;
  updated: string;
  email: string;
  name: string;
  verified: boolean;
}

// Cart types
export interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
  color?: string;
  size?: string;
  image?: string;
}

export interface Cart {
  id: string;
  created: string;
  updated: string;
  user: string;
  items: string; // JSON string of CartItem[]
}

// Order types
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partial';

export interface Order {
  id: string;
  created: string;
  updated: string;
  orderId: string;
  user?: string;
  email: string;
  items: string; // JSON string of CartItem[]
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentIntentId?: string;
  shippingAddress: ShippingAddress;
  billingAddress?: ShippingAddress;
  notes?: string;
  trackingNumber?: string;
  trackingCarrier?: string;
}

export interface ShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

// API Response types
export interface PaginatedResponse<T> {
  page: number;
  perPage: number;
  totalPages: number;
  totalItems: number;
  items: T[];
}

// Filter types
export interface ProductFilters {
  /** Category slug. Matches the category AND all of its descendants. */
  category?: string;
  colors?: string[];
  sizes?: string[];
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  inStock?: boolean;
  sort?: 'newest' | 'price-asc' | 'price-desc' | 'name';
}

// SEO types
export interface SEOData {
  title: string;
  description: string;
  canonical?: string;
  openGraph?: {
    title?: string;
    description?: string;
    images?: Array<{
      url: string;
      width?: number;
      height?: number;
      alt?: string;
    }>;
  };
}
