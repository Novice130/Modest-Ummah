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
  let sort = '-price'; // Default to price high-to-low since date sorting is restricted
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
    // case 'newest': // Date sorting restricted on backend
    //   sort = '-created';
    //   break;
  }

  // Fetch products from PocketBase
  let result;
  try {
    result = await getProducts({
      page,
      perPage,
      filter,
      sort,
    });
  } catch (error) {
    console.error('failed to fetch products:', error);
    throw error; // Re-throw to let error boundary handle it, but now we have a log
  }

  const products = result.items;
  const totalItems = result.totalItems;
  const totalPages = result.totalPages;

  return (
    <div>
      {/* Sort & Results Header */}
      <div className="hidden lg:flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">
          Showing {(page - 1) * perPage + 1} - {Math.min(page * perPage, totalItems)} of{' '}
          {totalItems} products
        </p>
        <Select defaultValue={searchParams.sort || 'price-desc'}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {/* <SelectItem value="newest">Newest</SelectItem> */}
            <SelectItem value="price-desc">Price: High to Low</SelectItem>
            <SelectItem value="price-asc">Price: Low to High</SelectItem>
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
