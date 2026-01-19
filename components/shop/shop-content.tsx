import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getProducts } from '@/lib/pocketbase';
import type { Product } from '@/types';

interface ShopContentProps {
  searchParams: {
    category?: string;
    subcategory?: string;
    color?: string;
    size?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
    page?: string;
    search?: string;
    price?: string;
  };
}

export default async function ShopContent({ searchParams }: ShopContentProps) {
  const page = parseInt(searchParams.page || '1', 10);
  const perPage = 12;

  // Build filter query
  let filter = '';
  const filters: string[] = [];

  if (searchParams.category) {
    filters.push(`category="${searchParams.category}"`);
  }
  if (searchParams.subcategory) {
    filters.push(`subcategory="${searchParams.subcategory}"`);
  }
  if (searchParams.color) {
    filters.push(`colors~"${searchParams.color}"`);
  }
  if (searchParams.size) {
    filters.push(`sizes~"${searchParams.size}"`);
  }
  if (searchParams.search) {
    filters.push(`(name~"${searchParams.search}" || description~"${searchParams.search}")`);
  }
  if (searchParams.price) {
    const [min, max] = searchParams.price.replace('+', '').split('-');
    if (min) filters.push(`price>=${min}`);
    if (max) filters.push(`price<=${max}`);
  }

  filter = filters.join(' && ');

  // Build sort query
  let sort = '-created';
  switch (searchParams.sort) {
    case 'price-asc':
      sort = 'price';
      break;
    case 'price-desc':
      sort = '-price';
      break;
    case 'name':
      sort = 'name';
      break;
  }

  // Mock products for demo - properly categorized
  const allMockProducts: Product[] = [
    // Men's products
    { id: '1', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Premium White Thobe', slug: 'premium-white-thobe', description: 'Elegant white thobe', shortDescription: 'Classic white thobe',
      price: 89.99, compareAtPrice: 119.99, category: 'men', subcategory: 'Thobes', images: ['/images/products/thobe-1.jpg'],
      colors: [{ name: 'White', value: '#FFFFFF' }], sizes: ['S', 'M', 'L', 'XL'], tags: ['thobe', 'men'], featured: true, inStock: true, stockQuantity: 50, sku: 'THB-001', similarProducts: [] },
    { id: '2', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Navy Moroccan Kurta', slug: 'navy-moroccan-kurta', description: 'Stylish kurta', shortDescription: 'Modern kurta',
      price: 79.99, category: 'men', subcategory: 'Kurtas', images: ['/images/products/kurta-1.jpg'],
      colors: [{ name: 'Navy', value: '#345995' }], sizes: ['M', 'L', 'XL'], tags: ['kurta', 'men'], featured: true, inStock: true, stockQuantity: 30, sku: 'KRT-001', similarProducts: [] },
    { id: '3', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Embroidered Kufi Cap', slug: 'embroidered-kufi-cap', description: 'Handcrafted kufi', shortDescription: 'Traditional kufi',
      price: 19.99, category: 'men', subcategory: 'Caps/Kufis', images: ['/images/products/kufi-1.jpg'],
      colors: [{ name: 'White', value: '#FFFFFF' }, { name: 'Black', value: '#000000' }], sizes: ['S', 'M', 'L'], tags: ['kufi', 'men'], featured: true, inStock: true, stockQuantity: 75, sku: 'KUF-001', similarProducts: [] },
    { id: '4', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Classic Beige Thobe', slug: 'classic-beige-thobe', description: 'Elegant beige thobe', shortDescription: 'Daily wear thobe',
      price: 79.99, category: 'men', subcategory: 'Thobes', images: ['/images/products/thobe-1.jpg'],
      colors: [{ name: 'Beige', value: '#F5F5DC' }], sizes: ['S', 'M', 'L', 'XL'], tags: ['thobe', 'men'], featured: false, inStock: true, stockQuantity: 40, sku: 'THB-002', similarProducts: [] },
    // Women's products
    { id: '5', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Elegant Black Abaya', slug: 'elegant-black-abaya', description: 'Flowing black abaya', shortDescription: 'Timeless abaya',
      price: 129.99, category: 'women', subcategory: 'Abayas', images: ['/images/products/abaya-1.jpg'],
      colors: [{ name: 'Black', value: '#000000' }], sizes: ['S', 'M', 'L', 'XL'], tags: ['abaya', 'women'], featured: true, inStock: true, stockQuantity: 35, sku: 'ABY-001', similarProducts: [] },
    { id: '6', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Premium Hijab Set', slug: 'premium-hijab-set', description: 'Soft jersey hijab', shortDescription: 'Comfortable hijab',
      price: 24.99, category: 'women', subcategory: 'Hijabs', images: ['/images/products/hijab-1.jpg'],
      colors: [{ name: 'Sage', value: '#b5c1a0' }, { name: 'Rose', value: '#d4a3a3' }], sizes: ['One Size'], tags: ['hijab', 'women'], featured: true, inStock: true, stockQuantity: 100, sku: 'HJB-001', similarProducts: [] },
    { id: '7', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Sage Khimar Set', slug: 'sage-khimar-set', description: 'Full coverage khimar', shortDescription: 'Modest khimar',
      price: 59.99, category: 'women', subcategory: 'Khimars', images: ['/images/products/khimar-1.jpg'],
      colors: [{ name: 'Sage', value: '#b5c1a0' }], sizes: ['One Size'], tags: ['khimar', 'women'], featured: true, inStock: true, stockQuantity: 40, sku: 'KHM-001', similarProducts: [] },
    { id: '8', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Rose Jilbab', slug: 'rose-jilbab', description: 'Beautiful rose jilbab', shortDescription: 'Elegant jilbab',
      price: 89.99, category: 'women', subcategory: 'Jilbabs', images: ['/images/products/abaya-1.jpg'],
      colors: [{ name: 'Rose', value: '#d4a3a3' }], sizes: ['S', 'M', 'L'], tags: ['jilbab', 'women'], featured: false, inStock: true, stockQuantity: 25, sku: 'JLB-001', similarProducts: [] },
    { id: '9', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Navy Hijab Premium', slug: 'navy-hijab-premium', description: 'Premium navy hijab', shortDescription: 'Luxury hijab',
      price: 34.99, category: 'women', subcategory: 'Hijabs', images: ['/images/products/hijab-1.jpg'],
      colors: [{ name: 'Navy', value: '#345995' }], sizes: ['One Size'], tags: ['hijab', 'women'], featured: false, inStock: true, stockQuantity: 60, sku: 'HJB-002', similarProducts: [] },
    // Accessories
    { id: '10', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Natural Miswak Pack', slug: 'natural-miswak-pack', description: 'Authentic miswak', shortDescription: 'Natural tooth-cleaning',
      price: 12.99, compareAtPrice: 18.99, category: 'accessories', subcategory: 'Miswak', images: ['/images/products/miswak-1.jpg'],
      colors: [], sizes: ['5 Pack'], tags: ['miswak', 'sunnah'], featured: true, inStock: true, stockQuantity: 200, sku: 'MSK-001', similarProducts: [] },
    { id: '11', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Arabian Oud Attar', slug: 'arabian-oud-attar', description: 'Luxurious oud fragrance', shortDescription: 'Natural perfume',
      price: 49.99, category: 'accessories', subcategory: 'Attar/Perfumes', images: ['/images/products/attar-1.jpg'],
      colors: [], sizes: ['12ml', '24ml'], tags: ['attar', 'perfume'], featured: true, inStock: true, stockQuantity: 45, sku: 'ATR-001', similarProducts: [] },
    { id: '12', collectionId: 'products', collectionName: 'products', created: new Date().toISOString(), updated: new Date().toISOString(),
      name: 'Prayer Beads Tasbih', slug: 'prayer-beads-tasbih', description: 'Wooden prayer beads', shortDescription: 'Traditional tasbih',
      price: 14.99, category: 'accessories', subcategory: 'Prayer Items', images: ['/images/products/attar-1.jpg'],
      colors: [], sizes: ['33 beads', '99 beads'], tags: ['tasbih', 'prayer'], featured: false, inStock: true, stockQuantity: 80, sku: 'TSB-001', similarProducts: [] },
  ];

  // Filter products by category if specified
  let filteredProducts = allMockProducts;
  if (searchParams.category) {
    filteredProducts = allMockProducts.filter(p => p.category === searchParams.category);
  }

  // In production, use: const result = await getProducts({ page, perPage, filter, sort });
  const totalItems = filteredProducts.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const products = filteredProducts.slice((page - 1) * perPage, page * perPage);

  return (
    <div>
      {/* Sort & Results Header */}
      <div className="hidden lg:flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">
          Showing {(page - 1) * perPage + 1} - {Math.min(page * perPage, totalItems)} of{' '}
          {totalItems} products
        </p>
        <Select defaultValue={searchParams.sort || 'newest'}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="price-asc">Price: Low to High</SelectItem>
            <SelectItem value="price-desc">Price: High to Low</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products Grid */}
      {products.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground mb-4">No products found</p>
          <Button asChild variant="outline">
            <Link href="/shop">Clear Filters</Link>
          </Button>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-12">
          <Button
            variant="outline"
            size="icon"
            disabled={page <= 1}
            asChild={page > 1}
          >
            {page > 1 ? (
              <Link
                href={`/shop?${new URLSearchParams({
                  ...searchParams,
                  page: String(page - 1),
                }).toString()}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span>
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
          </Button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (p) =>
                p === 1 ||
                p === totalPages ||
                (p >= page - 1 && p <= page + 1)
            )
            .map((p, i, arr) => (
              <span key={p}>
                {i > 0 && arr[i - 1] !== p - 1 && (
                  <span className="px-2 text-muted-foreground">...</span>
                )}
                <Button
                  variant={p === page ? 'default' : 'outline'}
                  size="icon"
                  asChild={p !== page}
                >
                  {p !== page ? (
                    <Link
                      href={`/shop?${new URLSearchParams({
                        ...searchParams,
                        page: String(p),
                      }).toString()}`}
                    >
                      {p}
                    </Link>
                  ) : (
                    <span>{p}</span>
                  )}
                </Button>
              </span>
            ))}

          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            asChild={page < totalPages}
          >
            {page < totalPages ? (
              <Link
                href={`/shop?${new URLSearchParams({
                  ...searchParams,
                  page: String(page + 1),
                }).toString()}`}
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span>
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
