'use client';

import { useState } from 'react';
import Image from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ProductGalleryProps {
  images: string[];
  name: string;
  productId?: string;
  collectionId?: string;
}

// Helper to construct PocketBase file URL
function getPocketBaseImageUrl(collectionId: string, productId: string, filename: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';
  return `${baseUrl}/api/files/${collectionId}/${productId}/${filename}`;
}

// Check if URL is a blob URL
function isBlobUrl(url: string): boolean {
  return url.startsWith('blob:');
}

export default function ProductGallery({ images, name, productId, collectionId }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  const scrollPrev = () => {
    emblaApi?.scrollPrev();
    const newIndex = emblaApi?.selectedScrollSnap();
    if (typeof newIndex === 'number') setSelectedIndex(newIndex);
  };

  const scrollNext = () => {
    emblaApi?.scrollNext();
    const newIndex = emblaApi?.selectedScrollSnap();
    if (typeof newIndex === 'number') setSelectedIndex(newIndex);
  };

  const scrollTo = (index: number) => {
    emblaApi?.scrollTo(index);
    setSelectedIndex(index);
  };

  // Fallback to placeholder if no images
  const hasImages = images?.length > 0;
  
  // Transform images to full URLs if needed
  const displayImages = hasImages 
    ? images.map(img => {
        // If it's already a full URL (starts with http, blob, or /), use as-is
        if (img.startsWith('http') || img.startsWith('blob:') || img.startsWith('/')) {
          return img;
        }
        // Otherwise, construct PocketBase URL
        if (productId && collectionId) {
          return getPocketBaseImageUrl(collectionId, productId, img);
        }
        return img;
      })
    : [];

  // If no images, show placeholder
  if (displayImages.length === 0) {
    return (
      <div className="space-y-4">
        <div className="relative aspect-[3/4] bg-muted rounded-lg overflow-hidden flex items-center justify-center">
          <span className="text-muted-foreground">No images available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Image */}
      <div className="relative aspect-[3/4] bg-muted rounded-lg overflow-hidden group">
        <div className="overflow-hidden h-full" ref={emblaRef}>
          <div className="flex h-full">
            {displayImages.map((image, index) => (
              <div key={index} className="flex-[0_0_100%] min-w-0 relative h-full">
                {isBlobUrl(image) ? (
                  // Use regular img for blob URLs
                  <img
                    src={image}
                    alt={`${name} - Image ${index + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  // Use Next.js Image for regular URLs
                  <Image
                    src={image}
                    alt={`${name} - Image ${index + 1}`}
                    fill
                    className="object-cover"
                    priority={index === 0}
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Arrows */}
        {displayImages.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={scrollPrev}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={scrollNext}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Zoom Button */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 bg-white/80 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl p-0">
            <div className="relative aspect-square">
              {isBlobUrl(displayImages[selectedIndex]) ? (
                <img
                  src={displayImages[selectedIndex]}
                  alt={name}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                <Image
                  src={displayImages[selectedIndex]}
                  alt={name}
                  fill
                  className="object-contain"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Thumbnails */}
      {displayImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {displayImages.map((image, index) => (
            <button
              key={index}
              onClick={() => scrollTo(index)}
              className={cn(
                'relative w-20 h-24 rounded-md overflow-hidden shrink-0 border-2 transition-all',
                selectedIndex === index
                  ? 'border-sage-500'
                  : 'border-transparent hover:border-sage-300'
              )}
            >
              {isBlobUrl(image) ? (
                <img
                  src={image}
                  alt={`${name} thumbnail ${index + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <Image
                  src={image}
                  alt={`${name} thumbnail ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
