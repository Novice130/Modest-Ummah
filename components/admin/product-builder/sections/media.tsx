'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { GripVertical, ImagePlus, Star, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getImageUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Field } from '../field';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

export default function MediaSection({ builder }: { builder: Builder }) {
  const { doc, update, addImages } = builder;
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

  const setPrimary = (index: number) => {
    if (index === 0) return;
    update((d) => {
      const [moved] = d.images.splice(index, 1);
      d.images.unshift(moved);
    });
  };

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
          setDragging(true);
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
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Drag and drop images here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          JPG, PNG, WebP or AVIF · up to 5 MB each · 10 at a time
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((img, index) => (
            <div
              key={`${img}-${index}`}
              className="relative aspect-square rounded-lg border overflow-hidden group bg-muted"
              draggable
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedIndex !== null) moveImage(draggedIndex, index);
                setDraggedIndex(null);
              }}
            >
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
              <span className="absolute top-2 right-2 text-muted-foreground/70">
                <GripVertical className="h-4 w-4" />
              </span>
              <div className="absolute bottom-2 left-2 right-2 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {index !== 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1 bg-white/90 hover:bg-white"
                    onClick={() => setPrimary(index)}
                  >
                    Make primary
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() =>
                    update((d) => {
                      d.images.splice(index, 1);
                      delete d.imageAlts[img];
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Alt text</h3>
          {images.map((img, index) => (
            <Field key={`${img}-${index}`} label={`Image ${index + 1}`} htmlFor={`pb-alt-${index}`}>
              <Input
                id={`pb-alt-${index}`}
                value={doc.imageAlts[img] || ''}
                onChange={(e) =>
                  update((d) => {
                    d.imageAlts[img] = e.target.value;
                  })
                }
                placeholder={`Describe image ${index + 1} for screen readers and SEO`}
              />
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}
