'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, GripVertical, Loader2, Star, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getImageUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

export default function MediaSection({ builder }: { builder: Builder }) {
  const { doc, update, addImages, uploading } = builder;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const images = doc.images;

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    update((d) => {
      const [moved] = d.images.splice(from, 1);
      d.images.splice(to, 0, moved);
    });
  };

  const removeImage = (index: number, url: string) =>
    update((d) => {
      d.images.splice(index, 1);
      delete d.imageAlts[url];
      // Do not leave variants or the social image pointing at a removed file.
      d.variants.forEach((v) => {
        if (v.image === url) v.image = undefined;
      });
      if (d.ogImage === url) d.ogImage = '';
    });

  return (
    <div className="space-y-6">
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary hover:bg-primary/5'
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          // Reordering tiles also fires dragover here; only files count.
          if (e.dataTransfer.types.includes('Files')) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) addImages(files);
        }}
        role="button"
        aria-label="Upload product images — drag and drop or click to browse"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 mx-auto text-muted-foreground mb-2 animate-spin" />
        ) : (
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        )}
        <p className="text-sm text-muted-foreground">
          {uploading ? 'Uploading…' : 'Drag and drop images here, or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          JPG, PNG, WebP or AVIF · up to 5 MB each
        </p>
        <Input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) addImages(files);
            e.target.value = '';
          }}
        />
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center">
          No images yet — the first image becomes the primary product image.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Drag to reorder. The first image is the primary image on cards and the product page.
            Alt text describes the image for screen readers and search engines.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {images.map((img, index) => (
              <div
                key={img}
                className="space-y-2"
                draggable
                onDragStart={(e) => {
                  setDraggedIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (draggedIndex !== null) moveImage(draggedIndex, index);
                  setDraggedIndex(null);
                }}
              >
                <div className="relative aspect-square rounded-lg border overflow-hidden group bg-muted">
                  <Image
                    src={getImageUrl(img)}
                    alt={doc.imageAlts[img] || doc.name || `Product image ${index + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 200px"
                  />
                  {index === 0 && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 bg-navy-900/80 text-white text-xs px-2 py-1 rounded">
                      <Star className="h-3 w-3 fill-gold-200 text-gold-200" /> Primary
                    </span>
                  )}
                  <span className="absolute top-2 right-2 text-white drop-shadow cursor-grab" aria-hidden>
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="absolute bottom-2 left-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="bg-white text-navy-900 border-0 shadow-sm"
                      aria-label={`Move image ${index + 1} earlier`}
                      disabled={index === 0}
                      onClick={() => moveImage(index, index - 1)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="bg-white text-navy-900 border-0 shadow-sm"
                      aria-label={`Move image ${index + 1} later`}
                      disabled={index === images.length - 1}
                      onClick={() => moveImage(index, index + 1)}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    {index !== 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 bg-white hover:bg-slate-100 text-navy-900 border-0 shadow-sm font-medium"
                        onClick={() => moveImage(index, 0)}
                      >
                        Make primary
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="ml-auto"
                      aria-label={`Remove image ${index + 1}`}
                      onClick={() => removeImage(index, img)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Input
                  id={`pb-alt-${index}`}
                  aria-label={`Alt text for image ${index + 1}`}
                  value={doc.imageAlts[img] || ''}
                  onChange={(e) =>
                    update((d) => {
                      d.imageAlts[img] = e.target.value;
                    })
                  }
                  placeholder="Alt text, e.g. Silver necklace on a velvet bust"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
