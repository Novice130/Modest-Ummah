// Product types
export interface Product {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice?: number;
  category: 'men' | 'women' | 'accessories';
  subcategory: string;
  images: string[];
  colors: ProductColor[];
  sizes: string[];
  tags: string[];
  featured: boolean;
  inStock: boolean;
  stockQuantity: number;
  sku: string;
  weight?: number;
  dimensions?: string;
  similarProducts: string[];
}

export interface ProductColor {
  name: string;
  value: string;
  image?: string;
}

// User types
export interface User {
  id: string;
  collectionId: string;
  collectionName: string;
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
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  email: string;
  name: string;
  verified: boolean;
}

// Cart types
export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  color?: string;
  size?: string;
  image?: string;
}

export interface Cart {
  id: string;
  collectionId: string;
  collectionName: string;
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
  collectionId: string;
  collectionName: string;
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
  category?: string;
  subcategory?: string;
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
