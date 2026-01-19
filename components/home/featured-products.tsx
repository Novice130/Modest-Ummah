import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProductCard from '@/components/product/product-card';
import { getFeaturedProducts } from '@/lib/pocketbase';
import type { Product } from '@/types';

// Fallback mock data when PocketBase is not available
const fallbackProducts: Product[] = [
  {
    id: '1',
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Premium White Thobe',
    slug: 'premium-white-thobe',
    description: 'Elegant white thobe made from premium cotton',
    shortDescription: 'Classic white thobe for everyday wear',
    price: 89.99,
    compareAtPrice: 119.99,
    category: 'men',
    subcategory: 'Thobes',
    images: ['/images/products/thobe-1.jpg'],
    colors: [{ name: 'White', value: '#FFFFFF' }],
    sizes: ['S', 'M', 'L', 'XL'],
    tags: ['thobe', 'men', 'classic'],
    featured: true,
    inStock: true,
    stockQuantity: 50,
    sku: 'THB-001',
    similarProducts: [],
  },
  {
    id: '2',
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Elegant Black Abaya',
    slug: 'elegant-black-abaya',
    description: 'Flowing black abaya with subtle embroidery',
    shortDescription: 'Timeless black abaya for all occasions',
    price: 129.99,
    category: 'women',
    subcategory: 'Abayas',
    images: ['/images/products/abaya-1.jpg'],
    colors: [{ name: 'Black', value: '#000000' }],
    sizes: ['S', 'M', 'L', 'XL'],
    tags: ['abaya', 'women', 'elegant'],
    featured: true,
    inStock: true,
    stockQuantity: 35,
    sku: 'ABY-001',
    similarProducts: [],
  },
  {
    id: '3',
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Premium Hijab Set',
    slug: 'premium-hijab-set',
    description: 'Soft jersey hijab in multiple colors',
    shortDescription: 'Comfortable everyday hijab',
    price: 24.99,
    category: 'women',
    subcategory: 'Hijabs',
    images: ['/images/products/hijab-1.jpg'],
    colors: [
      { name: 'Sage', value: '#b5c1a0' },
      { name: 'Rose', value: '#d4a3a3' },
      { name: 'Navy', value: '#345995' },
    ],
    sizes: ['One Size'],
    tags: ['hijab', 'women', 'everyday'],
    featured: true,
    inStock: true,
    stockQuantity: 100,
    sku: 'HJB-001',
    similarProducts: [],
  },
  {
    id: '4',
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Natural Miswak (5 Pack)',
    slug: 'natural-miswak-5-pack',
    description: 'Authentic miswak from Arak tree',
    shortDescription: 'Natural tooth-cleaning sticks',
    price: 12.99,
    category: 'accessories',
    subcategory: 'Miswak',
    images: ['/images/products/miswak-1.jpg'],
    colors: [],
    sizes: ['One Size'],
    tags: ['miswak', 'sunnah', 'natural'],
    featured: true,
    inStock: true,
    stockQuantity: 200,
    sku: 'MSK-001',
    similarProducts: [],
  },
  {
    id: '5',
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Embroidered Kufi Cap',
    slug: 'embroidered-kufi-cap',
    description: 'Handcrafted kufi with beautiful embroidery',
    shortDescription: 'Traditional kufi for prayer and daily wear',
    price: 19.99,
    category: 'men',
    subcategory: 'Caps/Kufis',
    images: ['/images/products/kufi-1.jpg'],
    colors: [
      { name: 'White', value: '#FFFFFF' },
      { name: 'Black', value: '#000000' },
    ],
    sizes: ['S', 'M', 'L'],
    tags: ['kufi', 'men', 'prayer'],
    featured: true,
    inStock: true,
    stockQuantity: 75,
    sku: 'KUF-001',
    similarProducts: [],
  },
  {
    id: '6',
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Arabian Oud Attar',
    slug: 'arabian-oud-attar',
    description: 'Luxurious oud-based fragrance',
    shortDescription: 'Long-lasting natural perfume',
    price: 49.99,
    category: 'accessories',
    subcategory: 'Attar/Perfumes',
    images: ['/images/products/attar-1.jpg'],
    colors: [],
    sizes: ['12ml', '24ml'],
    tags: ['attar', 'perfume', 'oud'],
    featured: true,
    inStock: true,
    stockQuantity: 45,
    sku: 'ATR-001',
    similarProducts: [],
  },
  {
    id: '7',
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Navy Moroccan Kurta',
    slug: 'navy-moroccan-kurta',
    description: 'Stylish Moroccan-style kurta in navy',
    shortDescription: 'Modern kurta for special occasions',
    price: 79.99,
    category: 'men',
    subcategory: 'Kurtas',
    images: ['/images/products/kurta-1.jpg'],
    colors: [{ name: 'Navy', value: '#345995' }],
    sizes: ['M', 'L', 'XL', 'XXL'],
    tags: ['kurta', 'men', 'moroccan'],
    featured: true,
    inStock: true,
    stockQuantity: 30,
    sku: 'KRT-001',
    similarProducts: [],
  },
  {
    id: '8',
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Sage Khimar Set',
    slug: 'sage-khimar-set',
    description: 'Full coverage khimar in sage green',
    shortDescription: 'Modest khimar for prayer and daily wear',
    price: 59.99,
    category: 'women',
    subcategory: 'Khimars',
    images: ['/images/products/khimar-1.jpg'],
    colors: [{ name: 'Sage', value: '#b5c1a0' }],
    sizes: ['One Size'],
    tags: ['khimar', 'women', 'prayer'],
    featured: true,
    inStock: true,
    stockQuantity: 40,
    sku: 'KHM-001',
    similarProducts: [],
  },
];

export default async function FeaturedProducts() {
  let products: Product[] = fallbackProducts;

  // Try to fetch from PocketBase
  try {
    const result = await getFeaturedProducts();
    if (result.items && result.items.length > 0) {
      products = result.items;
    }
  } catch (error) {
    console.warn('Failed to fetch featured products from PocketBase, using fallback data');
  }

  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container-custom">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-4">
          <div>
            <h2 className="font-heading text-3xl md:text-4xl mb-2">Featured Products</h2>
            <p className="text-muted-foreground">
              Discover our most popular items loved by the community
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/shop">
              View All Products <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
