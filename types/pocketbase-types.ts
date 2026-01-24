/**
* This file was manually generated to bypass connection issues.
*/

import PocketBase, { type RecordService } from 'pocketbase'

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
	collectionName: Collections
	expand?: T
}

export type AuthSystemFields<T = never> = BaseSystemFields<T> & {
	email: string
	emailVisibility: boolean
	username: string
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
	images?: string[] // file(s)
	colors?: any // json
	sizes?: any // json
	tags?: any // json
	featured?: boolean
	inStock?: boolean
	stockQuantity?: number
	sku: string
	weight?: number
	dimensions?: string
	similarProducts?: string[] // relation
}

export type ProductsResponse<Texpand = unknown> = Required<ProductsRecord> & BaseSystemFields<Texpand>

// Cart Collection
export type CartsRecord = {
	user: string // relation
	items: any // json
}

export type CartsResponse<Texpand = unknown> = Required<CartsRecord> & BaseSystemFields<Texpand>

// Order Collection
export type OrdersRecord = {
	orderId: string
	user?: string // relation
	email: string
	items: any // json
	subtotal: number
	shipping: number
	tax: number
	total: number
	status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
	paymentStatus: "pending" | "paid" | "failed" | "refunded" | "partial"
	paymentIntentId?: string
	shippingAddress: any // json
	billingAddress?: any // json
	notes?: string
}

export type OrdersResponse<Texpand = unknown> = Required<OrdersRecord> & BaseSystemFields<Texpand>

// User Collection (Default)
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

// Typed PocketBase
export type TypedPocketBase = PocketBase & {
	collection(idOrName: 'products'): RecordService<ProductsResponse>
	collection(idOrName: 'carts'): RecordService<CartsResponse>
	collection(idOrName: 'orders'): RecordService<OrdersResponse>
	collection(idOrName: 'users'): RecordService<UsersResponse>
}
