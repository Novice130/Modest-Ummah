import ProductCard from '@/components/product/product-card';
import type { Product } from '@/types';

interface ProductRecommendationsProps {
  product: Product;
}

export default async function ProductRecommendations({ product }: ProductRecommendationsProps) {
  // Mock related products
  const relatedProducts: Product[] = [
    {
      id: '2',
      collectionId: 'products',
      collectionName: 'products',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      name: 'Classic Beige Thobe',
      slug: 'classic-beige-thobe',
      description: 'Elegant beige thobe',
      shortDescription: 'Traditional beige thobe for daily wear',
      price: 79.99,
      category: 'men',
      subcategory: 'Thobes',
      images: ['/images/products/kurta-1.jpg'],
      colors: [{ name: 'Beige', value: '#F5F5DC' }],
      sizes: ['S', 'M', 'L', 'XL'],
      tags: ['thobe', 'men'],
      featured: true,
      inStock: true,
      stockQuantity: 30,
      sku: 'THB-002',
      similarProducts: [],
    },
    {
      id: '3',
      collectionId: 'products',
      collectionName: 'products',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      name: 'Navy Moroccan Thobe',
      slug: 'navy-moroccan-thobe',
      description: 'Moroccan style navy thobe',
      shortDescription: 'Stylish Moroccan thobe in navy',
      price: 99.99,
      compareAtPrice: 129.99,
      category: 'men',
      subcategory: 'Thobes',
      images: ['/images/products/thobe-1.jpg'],
      colors: [{ name: 'Navy', value: '#345995' }],
      sizes: ['M', 'L', 'XL', 'XXL'],
      tags: ['thobe', 'men', 'moroccan'],
      featured: true,
      inStock: true,
      stockQuantity: 25,
      sku: 'THB-003',
      similarProducts: [],
    },
    {
      id: '4',
      collectionId: 'products',
      collectionName: 'products',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      name: 'Premium Kufi Cap',
      slug: 'premium-kufi-cap',
      description: 'Handcrafted kufi cap',
      shortDescription: 'Traditional kufi for prayer',
      price: 19.99,
      category: 'men',
      subcategory: 'Caps/Kufis',
      images: ['/images/products/kufi-1.jpg'],
      colors: [{ name: 'White', value: '#FFFFFF' }, { name: 'Black', value: '#000000' }],
      sizes: ['S', 'M', 'L'],
      tags: ['kufi', 'men', 'prayer'],
      featured: true,
      inStock: true,
      stockQuantity: 100,
      sku: 'KUF-001',
      similarProducts: [],
    },
    {
      id: '5',
      collectionId: 'products',
      collectionName: 'products',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      name: 'Arabian Oud Attar',
      slug: 'arabian-oud-attar',
      description: 'Premium oud fragrance',
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
  ];

  if (relatedProducts.length === 0) return null;

  return (
    <section className="py-16 border-t mt-16">
      <h2 className="font-heading text-2xl md:text-3xl mb-8">You May Also Like</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {relatedProducts.map((product, index) => (
          <ProductCard key={product.id} product={product} index={index} />
        ))}
      </div>
    </section>
  );
}
