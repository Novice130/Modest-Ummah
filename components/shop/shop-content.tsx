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

  // Mock products for demo
  const mockProducts: Product[] = Array.from({ length: 24 }, (_, i) => ({
    id: `${i + 1}`,
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: [
      'Premium White Thobe',
      'Elegant Black Abaya',
      'Premium Hijab Set',
      'Natural Miswak Pack',
      'Embroidered Kufi Cap',
      'Arabian Oud Attar',
      'Navy Moroccan Kurta',
      'Sage Khimar Set',
    ][i % 8],
    slug: `product-${i + 1}`,
    description: 'High quality modest clothing item',
    shortDescription: 'Beautiful modest wear',
    price: [89.99, 129.99, 24.99, 12.99, 19.99, 49.99, 79.99, 59.99][i % 8],
    compareAtPrice: i % 3 === 0 ? [119.99, 159.99, 34.99][i % 3] : undefined,
    category: (['men', 'women', 'accessories'] as const)[i % 3],
    subcategory: ['Thobes', 'Abayas', 'Miswak', 'Hijabs', 'Kufis'][i % 5],
    images: [`/images/products/product-${(i % 8) + 1}.jpg`],
    colors: [
      { name: 'White', value: '#FFFFFF' },
      { name: 'Black', value: '#000000' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    tags: ['modest', 'featured'],
    featured: i < 8,
    inStock: i % 5 !== 4,
    stockQuantity: 50,
    sku: `SKU-${i + 1}`,
    similarProducts: [],
  }));

  // In production, use: const result = await getProducts({ page, perPage, filter, sort });
  const totalItems = mockProducts.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const products = mockProducts.slice((page - 1) * perPage, page * perPage);

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
