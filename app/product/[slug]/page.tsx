import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductGallery from '@/components/product/product-gallery';
import ProductInfo from '@/components/product/product-info';
import ProductRecommendations from '@/components/product/product-recommendations';
import { getProduct } from '@/lib/pocketbase';
import type { Product } from '@/types';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  
  try {
    const product = await getProduct(slug);
    
    if (!product) {
      return {
        title: 'Product Not Found',
      };
    }

    return {
      title: product.name,
      description: product.shortDescription || product.description?.substring(0, 160),
      openGraph: {
        title: product.name,
        description: product.shortDescription || product.description?.substring(0, 160),
        images: product.images?.[0] ? [product.images[0]] : [],
      },
    };
  } catch {
    return {
      title: 'Product Not Found',
    };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  
  let product: Product | null = null;
  
  try {
    product = await getProduct(slug);
  } catch (error) {
    console.error('Failed to fetch product:', error);
  }

  if (!product) {
    notFound();
  }

  // Generate JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    image: product.images,
    sku: product.sku,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'USD',
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
    brand: {
      '@type': 'Brand',
      name: 'Modest Ummah',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      
      <div className="container-custom py-8">
        {/* Breadcrumb */}
        <nav className="text-sm mb-6">
          <ol className="flex items-center gap-2 text-muted-foreground">
            <li><a href="/" className="hover:text-foreground">Home</a></li>
            <li>/</li>
            <li><a href="/shop" className="hover:text-foreground">Shop</a></li>
            <li>/</li>
            <li><a href={`/shop/${product.category}`} className="hover:text-foreground capitalize">{product.category}</a></li>
            <li>/</li>
            <li className="text-foreground">{product.name}</li>
          </ol>
        </nav>

        {/* Product Layout */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          <ProductGallery images={product.images} name={product.name} productId={product.id} collectionId={product.collectionId} />
          <ProductInfo product={product} />
        </div>

        {/* Product Details Tabs would go here */}

        {/* Related Products */}
        <Suspense fallback={<div className="py-16">Loading recommendations...</div>}>
          <ProductRecommendations product={product} />
        </Suspense>
      </div>
    </>
  );
}
