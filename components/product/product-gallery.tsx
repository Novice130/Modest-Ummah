'use client';

import { useState } from 'react';
import Image from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SurfaceCard } from '@/components/ui/surface-card';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn, getImageUrl } from '@/lib/utils';

interface ProductGalleryProps {
  images: string[];
  name: string;
}

function isBlobUrl(url: string): boolean {
  return url.startsWith('blob:');
}

export default function ProductGallery({ images, name }: ProductGalleryProps) {
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

  const hasImages = images?.length > 0;
  const displayImages = hasImages ? images.map(getImageUrl) : [];

  if (displayImages.length === 0) {
    return (
      <SurfaceCard className="w-full">
        <div className="relative aspect-[4/5] bg-muted/30 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">No images available</span>
        </div>
      </SurfaceCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Image in SurfaceCard */}
      <SurfaceCard className="relative aspect-[4/5] w-full bg-card group shadow-xs">
        <div className="overflow-hidden h-full" ref={emblaRef}>
          <div className="flex h-full">
            {displayImages.map((image, index) => (
              <div key={index} className="flex-[0_0_100%] min-w-0 relative h-full">
                {isBlobUrl(image) ? (
                  <img
                    src={image}
                    alt={`${name} - Image ${index + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
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

        {/* Carousel Navigation Arrows */}
        {displayImages.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 dark:bg-card/80 backdrop-blur-xs hover:bg-white text-foreground shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={scrollPrev}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 dark:bg-card/80 backdrop-blur-xs hover:bg-white text-foreground shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={scrollNext}
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Floating Indicator Dots */}
        {displayImages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/40 backdrop-blur-xs px-2.5 py-1 rounded-full z-10">
            {displayImages.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => scrollTo(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  selectedIndex === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                )}
              />
            ))}
          </div>
        )}

        {/* Zoom Lightbox Trigger */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 w-8 h-8 rounded-full bg-white/80 dark:bg-card/80 backdrop-blur-xs hover:bg-white text-foreground shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Zoom photo"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl p-2 bg-card border border-black/[0.08] dark:border-white/[0.12] rounded-2xl overflow-hidden">
            <div className="relative aspect-square w-full">
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
      </SurfaceCard>

      {/* Thumbnails Row */}
      {displayImages.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide py-1">
          {displayImages.map((image, index) => (
            <button
              key={index}
              type="button"
              onClick={() => scrollTo(index)}
              className={cn(
                'relative w-18 h-22 rounded-xl overflow-hidden shrink-0 border-2 transition-all',
                selectedIndex === index
                  ? 'border-foreground ring-1 ring-foreground/20'
                  : 'border-transparent hover:border-black/[0.15] dark:hover:border-white/[0.2]'
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
