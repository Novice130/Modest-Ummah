'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Heart, Share2, Truck, Shield, RotateCcw, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCartStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { formatPrice, cn } from '@/lib/utils';
import type { Product } from '@/types';

interface ProductInfoProps {
  product: Product;
}

export default function ProductInfo({ product }: ProductInfoProps) {
  const [selectedColor, setSelectedColor] = useState(product.colors?.[0]?.name || '');
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const { addItem, openCart } = useCartStore();
  const { toast } = useToast();

  const discount = product.compareAtPrice
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : null;

  const handleAddToCart = () => {
    if (product.sizes?.length > 0 && !selectedSize) {
      toast({
        title: 'Please select a size',
        description: 'Choose a size before adding to cart.',
        variant: 'destructive',
      });
      return;
    }

    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      color: selectedColor,
      size: selectedSize || undefined,
      image: product.images?.[0],
    });

    toast({
      title: 'Added to cart!',
      description: `${product.name} has been added to your cart.`,
    });

    openCart();
  };

  return (
    <div className="space-y-6">
      {/* Category & SKU */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="uppercase tracking-wide">{product.subcategory}</span>
        <span>|</span>
        <span>SKU: {product.sku}</span>
      </div>

      {/* Title */}
      <h1 className="font-heading text-3xl md:text-4xl">{product.name}</h1>

      {/* Price */}
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold">{formatPrice(product.price)}</span>
        {product.compareAtPrice && (
          <>
            <span className="text-xl text-muted-foreground line-through">
              {formatPrice(product.compareAtPrice)}
            </span>
            <Badge variant="destructive">Save {discount}%</Badge>
          </>
        )}
      </div>

      {/* Short Description */}
      <p className="text-muted-foreground">{product.shortDescription}</p>

      {/* Stock Status */}
      <div className="flex items-center gap-2">
        {product.inStock ? (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-green-600">In Stock</span>
            {product.stockQuantity <= 10 && (
              <span className="text-sm text-orange-500">
                - Only {product.stockQuantity} left!
              </span>
            )}
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm text-red-600">Out of Stock</span>
          </>
        )}
      </div>

      {/* Color Selection */}
      {product.colors && product.colors.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">Color:</span>
            <span className="text-muted-foreground">{selectedColor}</span>
          </div>
          <div className="flex gap-2">
            {product.colors.map((color) => (
              <button
                key={color.name}
                onClick={() => setSelectedColor(color.name)}
                className={cn(
                  'w-10 h-10 rounded-full border-2 transition-all relative',
                  selectedColor === color.name
                    ? 'border-sage-500 ring-2 ring-sage-300 ring-offset-2'
                    : 'border-gray-300 hover:border-sage-300'
                )}
                style={{ backgroundColor: color.value }}
                title={color.name}
              >
                {color.value === '#FFFFFF' && (
                  <span className="absolute inset-0 rounded-full border border-gray-200" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Size Selection */}
      {product.sizes && product.sizes.length > 0 && !product.sizes.includes('One Size') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">Size:</span>
              {selectedSize && <span className="text-muted-foreground">{selectedSize}</span>}
            </div>
            <button className="text-sm text-sage-600 hover:underline">Size Guide</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={cn(
                  'px-4 py-2 border rounded-md text-sm font-medium transition-all',
                  selectedSize === size
                    ? 'bg-sage-300 text-navy-900 border-sage-400'
                    : 'border-gray-300 hover:border-sage-300'
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantity */}
      <div className="space-y-3">
        <span className="font-medium">Quantity:</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center border rounded-md">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="p-2 hover:bg-muted transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-12 text-center font-medium">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="p-2 hover:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          size="lg"
          className="flex-1"
          onClick={handleAddToCart}
          disabled={!product.inStock}
        >
          <ShoppingCart className="h-5 w-5 mr-2" />
          Add to Cart
        </Button>
        <Button size="lg" variant="outline">
          <Heart className="h-5 w-5" />
        </Button>
        <Button size="lg" variant="outline">
          <Share2 className="h-5 w-5" />
        </Button>
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-4 pt-6 border-t">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-full bg-sage-100 dark:bg-sage-900/30 flex items-center justify-center">
            <Truck className="h-5 w-5 text-sage-600" />
          </div>
          <span className="text-xs text-muted-foreground">Free Shipping</span>
        </div>
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-full bg-sage-100 dark:bg-sage-900/30 flex items-center justify-center">
            <Shield className="h-5 w-5 text-sage-600" />
          </div>
          <span className="text-xs text-muted-foreground">Secure Payment</span>
        </div>
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-full bg-sage-100 dark:bg-sage-900/30 flex items-center justify-center">
            <RotateCcw className="h-5 w-5 text-sage-600" />
          </div>
          <span className="text-xs text-muted-foreground">30-Day Returns</span>
        </div>
      </div>

      {/* Tags */}
      {product.tags && product.tags.length > 0 && (
        <div className="pt-4 border-t">
          <span className="text-sm text-muted-foreground">Tags: </span>
          {product.tags.map((tag, index) => (
            <span key={tag}>
              <a href={`/shop?tag=${tag}`} className="text-sm text-sage-600 hover:underline">
                {tag}
              </a>
              {index < product.tags.length - 1 && ', '}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
