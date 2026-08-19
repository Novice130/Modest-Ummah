import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ShopContent from '@/components/shop/shop-content';
import ShopFilters from '@/components/shop/shop-filters';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';
import { fetchCategoryTree } from '@/lib/actions/category.actions';
import type { CategoryNode } from '@/types';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{
    tag?: string;
    color?: string;
    size?: string;
    price?: string;
    sort?: string;
    page?: string;
    search?: string;
  }>;
}

/** Depth-first lookup by slug across the whole tree. */
function findBySlug(nodes: CategoryNode[], slug: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const hit = findBySlug(node.children, slug);
    if (hit) return hit;
  }
  return null;
}

function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const node = findBySlug(await fetchCategoryTree(), category);

  if (!node) return { title: 'Shop' };

  const children = node.children.map((c) => c.name).join(', ');
  return {
    title: `Shop ${node.name}`,
    description:
      node.description ||
      `Browse our ${node.name.toLowerCase()} collection.${children ? ` ${children} and more.` : ''}`,
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category } = await params;
  const search = await searchParams;
  const node = findBySlug(await fetchCategoryTree(), category);

  // An unknown slug is a 404, not a soft "not found" page — it used to render
  // a 200 with an error message, which let dead category URLs get indexed.
  if (!node) notFound();

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="bg-muted/30 py-12">
        <div className="container-custom">
          <h1 className="font-heading text-3xl md:text-4xl mb-2">{node.name}</h1>
          {node.children.length > 0 && (
            <p className="text-muted-foreground">
              {node.children.map((c) => c.name).join(' • ')}
            </p>
          )}
          {node.children.length === 0 && node.description && (
            <p className="text-muted-foreground">{node.description}</p>
          )}
        </div>
      </div>

      <div className="container-custom py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <aside className="w-full lg:w-64 shrink-0">
            <ShopFilters />
          </aside>

          {/* Products Grid */}
          <main className="flex-1">
            <Suspense
              fallback={
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              }
            >
              <ShopContent searchParams={{ ...search, category }} />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * Every category, at any depth, gets a static entry — a shopper can land on
 * /shop/jewellery or /shop/rings and both must work. The catalogue read
 * filters by descendants, so a parent slug shows everything beneath it.
 */
export async function generateStaticParams() {
  const tree = await fetchCategoryTree();
  return flatten(tree).map((node) => ({ category: node.slug }));
}
