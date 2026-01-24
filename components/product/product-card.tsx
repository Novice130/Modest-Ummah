'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, ShoppingCart, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCartStore } from '@/lib/store';
import { formatPrice, getImageUrl } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  index?: number;
}

// Helper to get the proper image src for display
function getProductImageSrc(product: Product): string | null {
  const firstImage = product.images?.[0];
  if (!firstImage) return null;
  
  // If it's already a full URL (http/https/blob), use as-is
  if (firstImage.startsWith('http') || firstImage.startsWith('blob:') || firstImage.startsWith('/')) {
    return firstImage;
  }
  
  // Otherwise construct PocketBase URL
  if (product.collectionId && product.id) {
    return getImageUrl(product.collectionId, product.id, firstImage);
  }
  
  return null;
}

export default function ProductCard({ product, index = 0 }: ProductCardProps) {
  const { addItem, openCart } = useCartStore();
  const { toast } = useToast();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const imageSrc = getProductImageSrc(product);
    
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      color: product.colors?.[0]?.name,
      size: product.sizes?.[0],
      image: imageSrc || undefined,
    });

    toast({
      title: 'Added to cart',
      description: `${product.name} has been added to your cart.`,
    });

    openCart();
  };

  const discount = product.compareAtPrice
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : null;

  const imageSrc = getProductImageSrc(product);
  const isBlobUrl = imageSrc?.startsWith('blob:');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group"
    >
      <Link href={`/product/${product.slug || product.id}`} className="block">
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-muted mb-3">
          {/* Image - use regular img for blob URLs, Next Image for others */}
          {imageSrc ? (
            isBlobUrl ? (
              // Use regular img tag for blob URLs (preview mode)
              <img
                src={imageSrc}
                alt={product.name}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              // Use Next.js Image for regular URLs
              <Image
                src={imageSrc}
                alt={product.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
            )
          ) : (
            // Placeholder when no image
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-muted">
              <span className="text-sm">No Image</span>
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {discount && discount > 0 && (
              <Badge variant="destructive" className="text-xs">
                -{discount}%
              </Badge>
            )}
            {!product.inStock && (
              <Badge variant="secondary" className="text-xs">
                Out of Stock
              </Badge>
            )}
          </div>

          {/* Quick Actions */}
          <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-foreground"
            >
              <Heart className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-foreground"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>

          {/* Add to Cart Button */}
          <div className="absolute bottom-3 left-3 right-3 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
            <Button
              onClick={handleAddToCart}
              className="w-full"
              size="sm"
              disabled={!product.inStock}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to Cart
            </Button>
          </div>
        </div>

        {/* Product Info */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {product.subcategory}
          </p>
          <h3 className="font-medium text-sm md:text-base line-clamp-2 group-hover:text-sage-600 transition-colors">
            {product.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base">
              {formatPrice(product.price)}
            </span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice)}
              </span>
            )}
          </div>

          {/* Color Swatches */}
          {product.colors && product.colors.length > 1 && (
            <div className="flex gap-1 pt-1">
              {product.colors.slice(0, 4).map((color) => (
                <div
                  key={color.name}
                  className="w-4 h-4 rounded-full border border-gray-300"
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
              {product.colors.length > 4 && (
                <span className="text-xs text-muted-foreground">
                  +{product.colors.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
