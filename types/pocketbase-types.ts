/**
 * Legacy type definitions — kept for backwards compatibility.
 * The primary types are now in types/index.ts.
 * PocketBase SDK import removed; types are now standalone.
 */

export enum Collections {
  Products = "products",
  Carts = "carts",
  Orders = "orders",
  Users = "users",
}

// System fields
export type BaseSystemFields<T = never> = {
  id: string
  created: string
  updated: string
  collectionId: string
  collectionName: string
  expand?: T
}

export type AuthSystemFields<T = never> = BaseSystemFields<T> & {
  email: string
  emailVisibility?: boolean
  username?: string
  verified: boolean
}

// Product Collection
export type ProductsRecord = {
  name: string
  slug: string
  description: string
  shortDescription: string
  price: number
  compareAtPrice?: number
  category: "men" | "women" | "accessories"
  subcategory: string
  images?: string[]
  colors?: any
  sizes?: any
  tags?: any
  featured?: boolean
  inStock?: boolean
  stockQuantity?: number
  sku: string
  weight?: number
  dimensions?: string
  similarProducts?: string[]
}

export type ProductsResponse<Texpand = unknown> = Required<ProductsRecord> & BaseSystemFields<Texpand>

// Cart Collection
export type CartsRecord = {
  user: string
  items: any
}

export type CartsResponse<Texpand = unknown> = Required<CartsRecord> & BaseSystemFields<Texpand>

// Order Collection
export type OrdersRecord = {
  orderId: string
  user?: string
  email: string
  items: any
  subtotal: number
  shipping: number
  tax: number
  total: number
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  paymentStatus: "pending" | "paid" | "failed" | "refunded" | "partial"
  paymentIntentId?: string
  shippingAddress: any
  billingAddress?: any
  notes?: string
}

export type OrdersResponse<Texpand = unknown> = Required<OrdersRecord> & BaseSystemFields<Texpand>

// User Collection
export type UsersRecord = {
  name?: string
  avatar?: string
}

export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Type Definitions
export type CollectionRecords = {
  products: ProductsRecord
  carts: CartsRecord
  orders: OrdersRecord
  users: UsersRecord
}

export type CollectionResponses = {
  products: ProductsResponse
  carts: CartsResponse
  orders: OrdersResponse
  users: UsersResponse
}
