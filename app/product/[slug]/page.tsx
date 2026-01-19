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

// Mock product for demo
function getMockProduct(slug: string): Product {
  return {
    id: '1',
    collectionId: 'products',
    collectionName: 'products',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Premium White Thobe',
    slug,
    description: `<p>Experience the perfect blend of tradition and modern elegance with our Premium White Thobe. Crafted from the finest cotton blend fabric, this thobe offers exceptional comfort and breathability for all-day wear.</p>
    <h3>Features:</h3>
    <ul>
      <li>Premium cotton blend fabric (65% cotton, 35% polyester)</li>
      <li>Classic collar design with hidden button placket</li>
      <li>Two side pockets for convenience</li>
      <li>Relaxed fit for comfortable movement</li>
      <li>Machine washable</li>
    </ul>
    <h3>Care Instructions:</h3>
    <p>Machine wash cold with like colors. Tumble dry low. Iron on medium heat if needed.</p>`,
    shortDescription: 'A classic white thobe perfect for daily wear and special occasions. Made from premium cotton blend for ultimate comfort.',
    price: 89.99,
    compareAtPrice: 119.99,
    category: 'men',
    subcategory: 'Thobes',
    images: [
      '/images/products/thobe-1.jpg',
      '/images/products/kurta-1.jpg',
      '/images/products/kufi-1.jpg',
      '/images/products/attar-1.jpg',
    ],
    colors: [
      { name: 'White', value: '#FFFFFF', image: '/images/products/thobe-1.jpg' },
      { name: 'Beige', value: '#F5F5DC', image: '/images/products/kurta-1.jpg' },
      { name: 'Navy', value: '#345995', image: '/images/products/kufi-1.jpg' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    tags: ['thobe', 'men', 'classic', 'premium', 'cotton'],
    featured: true,
    inStock: true,
    stockQuantity: 50,
    sku: 'THB-001-WHT',
    weight: 0.5,
    dimensions: '60 x 40 x 5 cm',
    similarProducts: ['2', '3', '4'],
  };
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  // In production: const product = await getProduct(slug);
  const product = getMockProduct(slug);

  if (!product) {
    return {
      title: 'Product Not Found',
    };
  }

  return {
    title: product.name,
    description: product.shortDescription,
    openGraph: {
      title: product.name,
      description: product.shortDescription,
      images: product.images?.[0] ? [product.images[0]] : [],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  // In production: const product = await getProduct(slug);
  const product = getMockProduct(slug);

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
          <ProductGallery images={product.images} name={product.name} />
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
