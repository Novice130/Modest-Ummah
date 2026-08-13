import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from '@/components/product/product-card';
import ShopSortSelect from '@/components/shop/shop-sort-select';
import { Button } from '@/components/ui/button';
import { fetchProducts } from '@/lib/actions/product.actions';
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
  const limit = 12;

  let minPrice = searchParams.minPrice;
  let maxPrice = searchParams.maxPrice;

  if (searchParams.price) {
    const [min, max] = searchParams.price.replace('+', '').split('-');
    if (min) minPrice = min;
    if (max) maxPrice = max;
  }

  // Fetch products from database natively
  let result;
  try {
    result = await fetchProducts({
      page,
      limit,
      category: searchParams.category,
      subcategory: searchParams.subcategory,
      search: searchParams.search,
      minPrice,
      maxPrice,
      sort: searchParams.sort || '-price',
    });
  } catch (error) {
    console.error('failed to fetch products:', error);
    throw error;
  }

  const products = result.items;
  const totalItems = result.totalItems;
  const totalPages = result.totalPages;

  return (
    <div>
      {/* Sort & Results Header */}
      <div className="hidden lg:flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">
          Showing {(page - 1) * limit + 1} - {Math.min(page * limit, totalItems)} of{' '}
          {totalItems} products
        </p>
        <ShopSortSelect />
      </div>

      {/* Products Grid */}
      {products.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {products.map((product: Product, index: number) => (
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
